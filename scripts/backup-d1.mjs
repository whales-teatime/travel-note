import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = resolve('backups');
const output = resolve(directory, `travel-note-${timestamp}.sql`);
mkdirSync(directory, { recursive: true });

const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const settingsPath = resolve('.cloudflare.local.json');
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
const databaseName = process.env.CLOUDFLARE_D1_DATABASE_NAME || settings.databaseName || 'travel-note';
const configPath = resolve('dist/server/wrangler.json');
const configArgs = existsSync(configPath) ? ['--config', configPath] : [];
const result = spawnSync(process.execPath, [wrangler, 'd1', 'export', databaseName, '--remote', ...configArgs, '--output', output], {
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: resolve('.wrangler/logs') },
});
if (result.status === 0) {
  console.log(`D1 backup written to ${output}`);
  process.exit(0);
}

// D1 cannot export a database containing an FTS5 virtual table. Keep the
// backup command useful by falling back to the durable application tables;
// the derived search indexes are rebuilt by the deployment backfill step.
// Keep every user-authored table in the fallback export. Search indexes and
// lookup caches are derived data and can be rebuilt, but comments cannot.
const tables = ['plans', 'feedback', 'feedback_comments'];
const rows = [];
for (const table of tables) {
  const query = spawnSync(process.execPath, [wrangler, 'd1', 'execute', databaseName, '--remote', ...configArgs, '--json', '--command', `SELECT * FROM ${table}`], {
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: resolve('.wrangler/logs') },
  });
  if (query.status !== 0) process.exit(query.status ?? 1);
  const payload = JSON.parse(query.stdout);
  const resultRows = payload.flatMap(entry => Array.isArray(entry.results) ? entry.results : []);
  rows.push({ table, rows: resultRows });
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

const statements = ['-- Data-only fallback backup. Apply the migrations first.', 'BEGIN TRANSACTION;'];
for (const { table, rows: tableRows } of rows) {
  for (const row of tableRows) {
    const columns = Object.keys(row);
    statements.push(`INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(column => sqlValue(row[column])).join(',')});`);
  }
}
statements.push('COMMIT;');
writeFileSync(output, `${statements.join('\n')}\n`, 'utf8');
console.log(`D1 backup written to ${output}`);
