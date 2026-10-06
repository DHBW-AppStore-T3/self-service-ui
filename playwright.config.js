import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    use: { baseURL: 'http://localhost:8084', locale: 'de-DE' },
    webServer: { command: 'npm run dev', url: 'http://localhost:8084', reuseExistingServer: true, timeout: 120000 },
});
