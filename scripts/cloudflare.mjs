import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync } from 'node:fs';
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
if (command === 'check') {
  run('../node_modules/wrangler/bin/wrangler.js', ['deploy', '--dry-run', '--config', 'dist/server/wrangler.json']);
}
if (command === 'deploy') {
  // The build above regenerates bindings from the selected account, so a stale
  // Sites artifact or a verification build can never be published accidentally.
  run('../node_modules/wrangler/bin/wrangler.js', ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', 'dist/server/wrangler.json']);
  run('../node_modules/wrangler/bin/wrangler.js', ['deploy', '--config', 'dist/server/wrangler.json']);
}
