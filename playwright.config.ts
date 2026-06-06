import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(__dirname, 'tests/e2e'),
  timeout: 60_000,
  retries: 1,
  workers: 1,
  globalSetup: path.join(__dirname, 'tests/e2e/global-setup.ts'),
  use: {
    headless: false,
    channel: 'chromium',
  },
  webServer: {
    command: 'npx serve tests/fixtures -l 4173 --no-port-switching',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
