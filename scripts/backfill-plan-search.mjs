import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const settingsPath = new URL('../.cloudflare.local.json', import.meta.url);
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
const databaseName = process.env.CLOUDFLARE_D1_DATABASE_NAME || settings.databaseName || 'travel-note';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || settings.accountId || '';
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID || settings.databaseId || '';
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const config = fileURLToPath(new URL('../dist/server/wrangler.json', import.meta.url));
const remoteFlag = process.argv.includes('--local') ? '--local' : '--remote';

if (!databaseId || !existsSync(config)) {
  console.error('Plan search backfill requires a built Wrangler config and D1 database ID.');
  process.exit(1);
}

const sql = `INSERT INTO plan_search(rowid,plan_id,title,destination)
SELECT p.rowid,p.id,p.title,p.destination
FROM plans AS p
WHERE NOT EXISTS (SELECT 1 FROM plan_search AS s WHERE s.plan_id=p.id);

WITH RECURSIVE source(plan_id,value) AS (
  SELECT id,title FROM plans UNION ALL SELECT id,destination FROM plans
), chars(plan_id,value,pos) AS (
  SELECT plan_id,value,1 FROM source
  UNION ALL
  SELECT plan_id,value,pos+1 FROM chars WHERE pos < length(value)
)
INSERT OR IGNORE INTO plan_search_grams(plan_id,gram)
SELECT plan_id,substr(value,pos,1) FROM chars WHERE length(value) >= 1;

WITH RECURSIVE source(plan_id,value) AS (
  SELECT id,title FROM plans UNION ALL SELECT id,destination FROM plans
), chars(plan_id,value,pos) AS (
  SELECT plan_id,value,1 FROM source
  UNION ALL
  SELECT plan_id,value,pos+1 FROM chars WHERE pos < length(value)
)
INSERT OR IGNORE INTO plan_search_grams(plan_id,gram)
SELECT plan_id,substr(value,pos,2) FROM chars WHERE pos < length(value);`;

const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', databaseName, remoteFlag, '--config', config, '--command', sql], {
  cwd: root,
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_D1_DATABASE_ID: databaseId },
  stdio: 'inherit',
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
