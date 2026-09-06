import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;
const independentHosting = process.env.TRAVEL_HOST === 'cloudflare';

// The independent build uses the owner's Cloudflare account and has no Sites
// middleware. A placeholder permits local verification before account setup.
const independentBindingConfig = {
  name: 'travel',
  main: 'vinext/server/fetch-handler',
  // Keep local Wrangler compatibility with the currently installed runtime.
  compatibility_date: '2026-05-22',
  compatibility_flags: ['nodejs_compat'],
  workers_dev: true,
  ...(process.env.CLOUDFLARE_ACCOUNT_ID
    ? { account_id: process.env.CLOUDFLARE_ACCOUNT_ID }
    : {}),
  d1_databases: [{
    binding: 'DB',
    database_name: 'travel-note',
    database_id: process.env.CLOUDFLARE_D1_DATABASE_ID || SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
    migrations_dir: 'drizzle',
  }],
  // Run the seven-day trash cleanup once a day at 03:00 KST (18:00 UTC).
  triggers: { crons: ['0 18 * * *'] },
};

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      ...(independentHosting ? [] : [sites()]),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: independentHosting ? independentBindingConfig : localBindingConfig,
      }),
    ],
  };
});
