import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = resolve('backups');
const output = resolve(directory, `travel-note-${timestamp}.sql`);
mkdirSync(directory, { recursive: true });

const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const result = spawnSync(process.execPath, [wrangler, 'd1', 'export', 'travel-note', '--remote', '--output', output], {
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: resolve('.wrangler/logs') },
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`D1 backup written to ${output}`);
