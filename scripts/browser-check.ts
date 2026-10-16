import { execFileSync } from 'node:child_process';
// The browser suite never connects to production: both emulators must be loopback.
Object.assign(process.env, { FIREBASE_PROJECT_ID: 'demo-workpulse', GCLOUD_PROJECT: 'demo-workpulse', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098', APP_ORIGIN: 'http://127.0.0.1:5178' });
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed-emulator.ts'], { stdio: 'inherit', env: process.env });
execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], { stdio: 'inherit', env: process.env });