import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: '**/*.spec.ts', workers: 1, timeout: 90000, expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:5178', headless: true, trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx tsx scripts/dev-api.ts', port: 3000, reuseExistingServer: !process.env.CI },
    { command: 'npx vite --host 127.0.0.1 --port 5178 --strictPort', port: 5178, reuseExistingServer: !process.env.CI, env: { VITE_FIREBASE_API_KEY: 'emulator-only-api-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-workpulse.firebaseapp.com', VITE_FIREBASE_PROJECT_ID: 'demo-workpulse', VITE_FIREBASE_APP_ID: 'emulator-only-app-id', VITE_USE_EMULATORS: 'true' } }
  ]
});