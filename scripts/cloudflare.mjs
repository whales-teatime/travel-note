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

async function purgeExpiredPlans(env) {
  if (!env?.DB) return;
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  await env.DB.prepare('DELETE FROM plans WHERE deleted_at IS NOT NULL AND deleted_at <= ?').bind(cutoff).run();
}

export default {
  fetch(request, env, ctx) { return handler.fetch(request, env, ctx); },
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
  run('../node_modules/wrangler/bin/wrangler.js', ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', 'dist/server/wrangler.json']);
  run('../node_modules/wrangler/bin/wrangler.js', ['deploy', '--config', 'dist/server/wrangler.json']);
}
