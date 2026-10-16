import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/**/*.rules.test.ts', 'tests/**/*.integration.test.ts'] },
  // Browser traces contain generated HTML: do not let CI artifacts trigger reload loops.
  server: { watch: { ignored: ['**/test-results/**', '**/playwright-report/**', '**/artifacts/**', '**/*-debug.log'] }, proxy: { '/api': 'http://127.0.0.1:3000' } },
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'firebase', test: /node_modules\/(firebase|@firebase)/ }, { name: 'charts', test: /node_modules\/(recharts|d3-|victory|react-smooth)/ }] } } } },
});
