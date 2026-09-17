import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:3100', channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true },
  webServer: {
    command: 'npm start', url: 'http://127.0.0.1:3100/api/health', reuseExistingServer: false,
    env: { PORT: '3100', HOST: '127.0.0.1', GOOGLE_MAPS_API_KEY: 'test-key-no-external-requests' },
  },
});
