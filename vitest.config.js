// Vitest is retained only for the upstream test suite; the app builds with Webpack.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [react()],
    resolve: { alias: [{ find: /^\/(?=swagger\/|app-store\/|providers\/|projects\/|dyndns\/|tokens\/|helper\/|test\/|i18n\/|features\.js|nav\.jsx|format-date\.js)/, replacement: fileURLToPath(new URL('./web/', import.meta.url)) }] },
    define: { __DEV__: 'true', __APP_VERSION__: '"test"' },
    test: { environment: 'node', include: ['web/**/*.test.js', 'web/**/*.test.jsx'] },
});
