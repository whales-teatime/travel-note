import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = process.argv[2];
if (!['build', 'check', 'deploy'].includes(command)) {
  console.error('Usage: node scripts/cloudflare.mjs build|check|deploy');
  process.exit(1);
}

// This ignored file contains account/database IDs only, never API secrets.
const settingsPath = new URL('../.cloudflare.local.json', import.meta.url);
const settings = existsSync(settingsPath)
  ? JSON.parse(readFileSync(settingsPath, 'utf8'))
  : {};
const env = {
  ...process.env,
  TRAVEL_HOST: 'cloudflare',
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || settings.accountId || '',
  CLOUDFLARE_D1_DATABASE_ID: process.env.CLOUDFLARE_D1_DATABASE_ID || settings.databaseId || '',
  CLOUDFLARE_D1_DATABASE_NAME: process.env.CLOUDFLARE_D1_DATABASE_NAME || settings.databaseName || 'travel-note',
};
const placeholder = '00000000-0000-4000-8000-000000000000';
if (command === 'deploy' && (
  !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID) ||
  !/^[a-f0-9-]{36}$/i.test(env.CLOUDFLARE_D1_DATABASE_ID) ||
  env.CLOUDFLARE_D1_DATABASE_ID === placeholder
)) {
  console.error('Deployment requires the owner\'s Cloudflare account ID and D1 database ID. See docs/HOSTING.md.');
  process.exit(1);
}

function run(relativePath, args) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(relativePath, import.meta.url)), ...args], {
    cwd: root, env, stdio: 'inherit', shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('../node_modules/vinext/dist/cli.js', ['build']);
cpSync(new URL('../drizzle/', import.meta.url), new URL('../dist/server/drizzle/', import.meta.url), { recursive: true });

// vinext's stock fetch handler has no scheduled entrypoint. Wrap it so the
// independent Worker can run the D1 trash cleanup cron without changing the
// generated application bundle.
const generatedHandler = new URL('../dist/server/index.js', import.meta.url);
const wrappedHandler = new URL('../dist/server/vinext-handler.js', import.meta.url);
if (existsSync(generatedHandler)) {
  cpSync(generatedHandler, wrappedHandler);
  writeFileSync(generatedHandler, `import handler from './vinext-handler.js';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function purgeExpiredPlans(env) {
  if (!env?.DB) return;
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  await env.DB.prepare('DELETE FROM plans WHERE deleted_at IS NOT NULL AND deleted_at <= ?').bind(cutoff).run();
  try {
    await env.DB.prepare('DELETE FROM place_lookup_cache WHERE expires_at <= ?').bind(new Date().toISOString()).run();
  } catch {
    // The cache table may not exist yet during a rolling deployment.
  }
  try {
    const accessCutoff = new Date(Date.now() - ACCESS_LOG_RETENTION_MS).toISOString();
    await env.DB.prepare('DELETE FROM access_logs WHERE created_at <= ?').bind(accessCutoff).run();
  } catch {
    // Access logging is optional while the migration rolls out.
  }
}

function shouldRecordAccess(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/') || url.pathname === '/favicon.svg' || url.pathname === '/robots.txt') return false;
  return (request.headers.get('accept') || '').toLowerCase().includes('text/html');
}

async function visitorHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || '';
  if (!ip || typeof env?.ADMIN_MASTER_PASSWORD !== 'string' || !env.ADMIN_MASTER_PASSWORD) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_MASTER_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip.split(',')[0].trim()));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function recordAccess(request, response, env) {
  if (!env?.DB || !shouldRecordAccess(request)) return;
  const url = new URL(request.url);
  const id = 'access_' + Date.now().toString(36) + '_' + crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const path = url.pathname.slice(0, 180) || '/';
  const country = (request.headers.get('CF-IPCountry') || '').slice(0, 8) || null;
  const hash = await visitorHash(request, env);
  await env.DB.prepare('INSERT INTO access_logs (id,created_at,path,status,country,visitor_hash) VALUES (?,?,?,?,?,?)').bind(id, new Date().toISOString(), path, response.status, country, hash).run();
}

export default {
  fetch(request, env, ctx) {
    return Promise.resolve(handler.fetch(request, env, ctx)).then(response => {
      const log = recordAccess(request, response, env).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(log);
      return response;
    });
  },
  async scheduled(_controller, env, ctx) {
    const cleanup = purgeExpiredPlans(env);
    if (ctx?.waitUntil) ctx.waitUntil(cleanup);
    else await cleanup;
  },
};
`);
}
if (command === 'check') {
  run('../node_modules/wrangler/bin/wrangler.js', ['deploy', '--dry-run', '--config', 'dist/server/wrangler.json']);
}
if (command === 'deploy') {
  // The build above regenerates bindings from the selected account, so a stale
  // Sites artifact or a verification build can never be published accidentally.
  run('../node_modules/wrangler/bin/wrangler.js', ['d1', 'migrations', 'apply', env.CLOUDFLARE_D1_DATABASE_NAME, '--remote', '--config', 'dist/server/wrangler.json']);
  // Migrations intentionally stay schema-only. Populate the title/destination
  // search index separately so existing plans are searchable immediately.
  run('./backfill-plan-search.mjs', []);
  run('../node_modules/wrangler/bin/wrangler.js', ['deploy', '--config', 'dist/server/wrangler.json']);
}
