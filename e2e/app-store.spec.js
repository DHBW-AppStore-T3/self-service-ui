import { test, expect } from '@playwright/test';

const apps = [
    { appId: 'ubuntu', name: 'Ubuntu Desktop', description: 'Eine Linux-Arbeitsumgebung für Studium und Lehre.', releaseTag: 'v1.0', is_private: false, created_at: '2026-09-01' },
    { appId: 'lab', name: 'Programmierlabor', description: 'Entwicklungsumgebung für praktische Übungen.', releaseTag: 'v2.1', is_private: true, created_at: '2026-09-02' },
];

test.beforeEach(async ({ page }) => {
    await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.appconfig = { dummyAuth: true, appStoreBaseUrl: "/api/app-store", appStoreFrontendUrl: "http://localhost:5173" };' }));
    await page.route('**/api/app-store/**', route => {
        const path = new URL(route.request().url()).pathname;
        const data = path === '/api/app-store/apps/' ? apps : path.endsWith('/apps/ubuntu') ? apps[0] : path.endsWith('/deployments/') ? [{ deploymentId: 'deployment-1', name: 'Linux-Kurs', status: 'success', created_at: '2026-09-29' }] : {};
        return route.fulfill({ json: data });
    });
});

test('catalog, search, details, handoff, deployments and direct reload work', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/app-store');
    await expect(page).toHaveURL(/\/app-store\/apps$/);
    await expect(page.getByRole('heading', { name: 'Ubuntu Desktop' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Apps suchen' }).fill('keine app');
    await expect(page.getByRole('heading', { name: 'Keine passenden Apps' })).toBeVisible();
    await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();
    await page.getByRole('article').filter({ hasText: 'Ubuntu Desktop' }).getByRole('link', { name: 'Details ansehen' }).click();
    await expect(page).toHaveURL(/\/app-store\/apps\/ubuntu$/);
    await page.reload();
    await expect(page.getByRole('link', { name: 'Im App-Store bereitstellen' })).toHaveAttribute('href', 'http://localhost:5173/apps/ubuntu');
    await page.getByRole('link', { name: 'Deployments', exact: true }).click();
    await expect(page.getByText('Linux-Kurs')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Deployment verwalten' })).toHaveAttribute('href', 'http://localhost:5173/deployments/deployment-1');
    expect(errors).toEqual([]);
});

test('mobile catalog has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app-store/apps');
    await expect(page.getByRole('heading', { name: 'Ubuntu Desktop' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Navigation öffnen' }).click();
    await page.getByRole('link', { name: 'Deployments', exact: true }).click();
    await expect(page.getByText('Linux-Kurs')).toBeVisible();
    await page.goto('/app-store/apps');
    await expect(page.getByRole('heading', { name: 'Ubuntu Desktop' })).toBeVisible();
    await page.screenshot({ path: 'test-results/app-store-mobile.png', fullPage: true });
});

test('errors can be retried and empty data is distinct from failed requests', async ({ page }) => {
    let failed = true;
    await page.route('**/api/app-store/apps/**', route => failed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: [] }));
    await page.goto('/app-store/apps');
    await expect(page.getByRole('alert')).toContainText('App-Store konnte nicht geladen werden');
    failed = false;
    await page.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.getByRole('heading', { name: 'Noch keine Apps verfügbar' })).toBeVisible();
});

test('desktop catalog screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.appconfig = { dummyAuth: true, cloudResourcesBaseUrl: "http://localhost:8084/api/projects/", dynamicZonesBaseUrl: "http://localhost:8084/api/dyndns/", appStoreBaseUrl: "/api/app-store", appStoreFrontendUrl: "http://localhost:5173" };' }));
    await page.route('**/api/projects/**', route => route.fulfill({ status: 503, json: {} }));
    await page.route('**/api/dyndns/**', route => route.fulfill({ status: 503, json: {} }));
    await page.goto('/app-store/apps');
    await expect(page.getByRole('heading', { name: 'Ubuntu Desktop' })).toBeVisible();
    for (const name of ['Start', 'Cloud-Projekte', 'DNS-Zonen', 'API-Tokens', 'App-Store']) {
        await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await page.screenshot({ path: 'test-results/app-store-desktop.png', fullPage: true });
});
