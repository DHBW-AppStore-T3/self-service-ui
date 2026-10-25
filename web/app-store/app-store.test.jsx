// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
// features.js reads window.appconfig once, when it is first imported; the
// section is opt-in, so the flag has to be there before the imports below run.
vi.hoisted(() => { window.appconfig = { appStoreEnabled: true }; });

import { Catalog } from './catalog.jsx';
import { AppDetail } from './app-detail.jsx';
import { Deployments } from './deployments.jsx';
import { Settings } from './settings.jsx';

// Render smoke tests for the three App Store views, against a fetch that
// answers like the backend. They check that each view renders and that the
// role decides what it offers — not what it looks like.

const APPS = [
    { appId: 'ubuntu', name: 'Ubuntu Desktop', description: 'Linux for courses', releaseTag: 'v1.0', is_private: false, created_at: '2026-09-01' },
    { appId: 'lab', name: 'Programming lab', description: '', releaseTag: 'v2.1', is_private: true, created_at: '2026-09-02' },
];

// Apps as the catalog filters see them: two of them curated into departments
// (by git link), one of them recommended.
const CURATED_APPS = [
    { ...APPS[0], appId: 'ide', name: 'Online IDE', git_link: 'https://github.com/DHBW-AppStore-T3/Online-IDE', recommended: true },
    { ...APPS[0], appId: 'latex', name: 'Web LaTeX', git_link: 'https://github.com/DHBW-AppStore-T3/Web-LaTeX', recommended: false },
    { ...APPS[1], appId: 'private', name: 'Private lab', git_link: 'https://example.org/lab', recommended: false },
];
const APP = { ...APPS[0], git_link: 'https://github.com/example/ubuntu', versions: [{ version: 'v1.0', name: 'v1.0', prerelease: 'False' }] };
const TWO_VERSIONS = [{ version: 'v1.1', name: 'v1.1', prerelease: 'False' }, { version: 'v1.0', name: 'v1.0', prerelease: 'False' }];
const APPROVALS = [
    { approvalId: 'x1', version_tag: 'v1.1', status: 'approved' },
    { approvalId: 'x2', version_tag: 'v1.0', status: 'pending' },
];

// A backend that also answers writes: PUT and POST bodies are recorded in `sent`.
function writableBackend(role, overrides = {}, answerFor = () => null) {
    const sent = [];
    const base = backend(role, overrides);
    const fetch = vi.fn(async (url, init = {}) => {
        if (init.method === 'PUT' || init.method === 'POST') {
            const path = new URL(url, 'http://localhost').pathname;
            sent.push({ method: init.method, path, body: JSON.parse(init.body) });
            const answer = answerFor(path, init);
            if (answer) return answer;
            return new Response(JSON.stringify({}), { status: init.method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } });
        }
        return base(url, init);
    });
    return { fetch, sent };
}
const DEPLOYMENTS = [{ deploymentId: 'd1', appId: 'ubuntu', name: 'Linux course', status: 'success', created_at: '2026-09-29' }];
const ACCESS = { user_accounts: { 'Team-1-anna': { username: 'anna', ip: '10.0.0.5', port: 22, auth: 's3cret', type: 'password', protocol: 'ssh' } }, team_vms: {} };

function backend(role, overrides = {}) {
    const routes = {
        '/api/app-store/users/me': { role },
        '/api/app-store/apps/': APPS,
        '/api/app-store/apps/ubuntu': APP,
        '/api/app-store/apps/ubuntu/variables': [],
        '/api/app-store/deployments/': DEPLOYMENTS,
        '/api/app-store/deployments/d1/my-access': ACCESS,
        ...overrides,
    };
    return vi.fn(async url => {
        const path = new URL(url, 'http://localhost').pathname;
        if (!(path in routes)) return new Response('', { status: 404 });
        return new Response(JSON.stringify(routes[path]), { headers: { 'content-type': 'application/json' } });
    });
}

function adminViewOn() {
    window.localStorage.setItem('appstore.adminView', JSON.stringify({ 'dennis.pfisterer@dhbw.de': true }));
}

describe('App Store views', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.appconfig = { appStoreEnabled: true, appStoreBaseUrl: '/api/app-store', appStoreFrontendUrl: 'http://store.example' };
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('lists the catalog and filters it', async () => {
        vi.stubGlobal('fetch', backend('teacher'));
        renderView(<Catalog />);
        expect(await screen.findByText('Ubuntu Desktop')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Search apps'), { target: { value: 'nothing like it' } });
        expect(screen.getByText('No matching apps')).toBeTruthy();
    });

    it('offers a teacher one-click deployment of an app without inputs', async () => {
        vi.stubGlobal('fetch', backend('teacher'));
        renderView(<AppDetail params={{ id: 'ubuntu' }} />);
        const button = await screen.findByRole('button', { name: /Deploy now/ });
        await vi.waitFor(() => expect(button.disabled).toBe(false));
    });

    it('hands a version that needs inputs over to the existing wizard', async () => {
        vi.stubGlobal('fetch', backend('teacher', {
            '/api/app-store/apps/ubuntu/variables': [{ name: 'admin_password', type: 'string', required: true }],
        }));
        renderView(<AppDetail params={{ id: 'ubuntu' }} />);
        expect(await screen.findByText(/needs inputs/)).toBeTruthy();
        expect(screen.getByRole('link', { name: /Configure in App Store/ }).getAttribute('href'))
            .toBe('http://store.example/apps/ubuntu');
        expect(screen.getByRole('button', { name: /Deploy now/ }).disabled).toBe(true);
    });

    it('never offers a student the deploy form', async () => {
        vi.stubGlobal('fetch', backend('student'));
        renderView(<AppDetail params={{ id: 'ubuntu' }} />);
        expect(await screen.findByText(/Your lecturers set environments up/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Deploy now/ })).toBeNull();
    });

    it('shows a student their own credentials', async () => {
        vi.stubGlobal('fetch', backend('student'));
        renderView(<Deployments />);
        expect(await screen.findByRole('heading', { name: 'My environments' })).toBeTruthy();
        fireEvent.click(await screen.findByRole('button', { name: /Credentials/ }));
        expect(await screen.findByText('anna')).toBeTruthy();
        expect(screen.getByText('10.0.0.5:22')).toBeTruthy();
    });

    it('explains a refused dev login instead of reporting an expired session', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
        renderView(<Catalog />, { auth: { useDummyAuth: true } });
        expect(await screen.findByText(/development login cannot load App Store data/)).toBeTruthy();
    });

    describe('catalog filters', () => {
        const visible = () => screen.queryAllByRole('article').map(card => card.querySelector('h2').textContent);

        it('starts on the recommended apps and widens to all on request', async () => {
            vi.stubGlobal('fetch', backend('teacher', { '/api/app-store/apps/': CURATED_APPS }));
            renderView(<Catalog />);
            expect(await screen.findByText('Online IDE')).toBeTruthy();
            expect(visible()).toEqual(['Online IDE']);
            expect(screen.getByRole('radio', { name: 'Recommended (1)' }).checked).toBe(true);

            fireEvent.click(screen.getByRole('radio', { name: 'All (3)' }));
            expect(visible()).toEqual(['Online IDE', 'Private lab', 'Web LaTeX']);
        });

        it('offers no recommended filter, and starts on all, when nothing is recommended', async () => {
            vi.stubGlobal('fetch', backend('teacher', { '/api/app-store/apps/': CURATED_APPS.map(a => ({ ...a, recommended: false })) }));
            renderView(<Catalog />);
            expect(await screen.findByText('Online IDE')).toBeTruthy();
            expect(screen.queryByRole('radio', { name: /Recommended/ })).toBeNull();
            expect(screen.getByRole('radio', { name: 'All (3)' }).checked).toBe(true);
        });

        it('filters by department with the search still applied', async () => {
            vi.stubGlobal('fetch', backend('teacher', { '/api/app-store/apps/': CURATED_APPS }));
            renderView(<Catalog />);
            expect(await screen.findByText('Online IDE')).toBeTruthy();

            fireEvent.click(screen.getByRole('radio', { name: 'Mechanical engineering (1)' }));
            expect(visible()).toEqual(['Web LaTeX']);
            fireEvent.change(screen.getByLabelText('Search apps'), { target: { value: 'ide' } });
            expect(screen.getByText('No matching apps')).toBeTruthy();
            expect(screen.getByText('Try another search term or change the filters.')).toBeTruthy();

            fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
            expect(visible()).toEqual(['Online IDE', 'Private lab', 'Web LaTeX']);
            expect((screen.getByLabelText('Search apps')).value).toBe('');
        });

        it('says so when no app is assigned to a department', async () => {
            vi.stubGlobal('fetch', backend('teacher', { '/api/app-store/apps/': [{ ...CURATED_APPS[0], recommended: false }] }));
            renderView(<Catalog />);
            expect(await screen.findByText('Online IDE')).toBeTruthy();
            fireEvent.click(screen.getByRole('radio', { name: 'Mechanical engineering (0)' }));
            expect(screen.getByText('No apps are assigned to Mechanical engineering yet.')).toBeTruthy();
        });

        it('shows the visibility select to an admin in the admin view only', async () => {
            vi.stubGlobal('fetch', backend('admin', { '/api/app-store/apps/': CURATED_APPS }));
            const first = renderView(<Catalog />);
            expect(await screen.findByText('Online IDE')).toBeTruthy();
            expect(screen.queryAllByLabelText('Visibility')).toHaveLength(0);
            first.unmount();

            adminViewOn();
            renderView(<Catalog />);
            expect((await screen.findAllByLabelText('Visibility')).length).toBeGreaterThan(0);
        });
    });

    describe('recommended apps on the settings page', () => {
        it('lets an admin recommend an app and saves it', async () => {
            const fetch = backend('admin', { '/api/app-store/apps/': CURATED_APPS });
            const base = fetch.getMockImplementation();
            fetch.mockImplementation(async (url, init) => (init?.method === 'PUT'
                ? new Response(JSON.stringify({ ...CURATED_APPS[1], recommended: true }), { headers: { 'content-type': 'application/json' } })
                : base(url, init)));
            vi.stubGlobal('fetch', fetch);
            renderView(<Settings />);

            const latex = await screen.findByRole('switch', { name: 'Recommend Web LaTeX' });
            expect(latex.checked).toBe(false);
            expect(screen.getByRole('switch', { name: 'Recommend Online IDE' }).checked).toBe(true);
            fireEvent.click(latex);

            await vi.waitFor(() => {
                const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT');
                expect(put[0]).toBe('/api/app-store/admin/apps/latex/recommended');
                expect(JSON.parse(put[1].body)).toEqual({ recommended: true });
            });
        });
    });

    describe('which version is deployed', () => {
        const withVersions = deploy_version => ({
            '/api/app-store/apps/ubuntu': { ...APP, versions: TWO_VERSIONS, deploy_version },
        });

        it('does not offer a teacher a version, and deploys the one an admin fixed', async () => {
            const { fetch, sent } = writableBackend('teacher', withVersions('v1.0'));
            vi.stubGlobal('fetch', fetch);
            renderView(<AppDetail params={{ id: 'ubuntu' }} />);
            const deploy = await screen.findByRole('button', { name: /Deploy now/ });
            await vi.waitFor(() => expect(deploy.disabled).toBe(false));
            expect(screen.queryAllByLabelText('Version')).toHaveLength(0);

            fireEvent.click(deploy);
            await vi.waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0]).toMatchObject({ path: '/api/app-store/deployments/', body: { releaseTag: 'v1.0', appId: 'ubuntu' } });
        });

        it('deploys the first version while none is fixed', async () => {
            const { fetch, sent } = writableBackend('teacher', withVersions(null));
            vi.stubGlobal('fetch', fetch);
            renderView(<AppDetail params={{ id: 'ubuntu' }} />);
            const deploy = await screen.findByRole('button', { name: /Deploy now/ });
            await vi.waitFor(() => expect(deploy.disabled).toBe(false));
            fireEvent.click(deploy);
            await vi.waitFor(() => expect(sent[0].body.releaseTag).toBe('v1.1'));
        });

        it('explains instead of failing when the app has no deployable version', async () => {
            vi.stubGlobal('fetch', backend('teacher', { '/api/app-store/apps/ubuntu': { ...APP, versions: [], deploy_version: null } }));
            renderView(<AppDetail params={{ id: 'ubuntu' }} />);
            expect(await screen.findByText(/No deployable version/)).toBeTruthy();
            expect(screen.queryByRole('button', { name: /Deploy now/ })).toBeNull();
        });

        it('links a missing OpenStack credential to the native page, back to this app afterwards', async () => {
            const refusal = new Response(JSON.stringify({ detail: { reason: 'openstack_credentials_missing' } }), { status: 412, headers: { 'content-type': 'application/json' } });
            const { fetch } = writableBackend('teacher', withVersions(null), () => refusal);
            vi.stubGlobal('fetch', fetch);
            renderView(<AppDetail params={{ id: 'ubuntu' }} />);
            const deploy = await screen.findByRole('button', { name: /Deploy now/ });
            await vi.waitFor(() => expect(deploy.disabled).toBe(false));
            fireEvent.click(deploy);
            const link = await screen.findByRole('link', { name: 'Add credentials' });
            expect(link.getAttribute('href')).toBe('/credentials?next=%2Fapps%2Fubuntu');
        });

        it('hides versions and the repository from a teacher and from an admin without the admin view', async () => {
            for (const role of ['teacher', 'admin']) {
                vi.stubGlobal('fetch', backend(role, withVersions(null)));
                const view = renderView(<AppDetail params={{ id: 'ubuntu' }} />);
                await screen.findByRole('button', { name: /Deploy now/ });
                expect(screen.queryByText('2 versions available')).toBeNull();
                expect(screen.queryByText(/Open source repository/)).toBeNull();
                expect(screen.queryByRole('button', { name: /Set version/ })).toBeNull();
                view.unmount();
            }
        });

        it('lets an admin in the admin view fix an approved version, without starting a deployment', async () => {
            adminViewOn();
            const { fetch, sent } = writableBackend('admin', {
                ...withVersions(null),
                '/api/app-store/apps/ubuntu/versions': APPROVALS,
            });
            vi.stubGlobal('fetch', fetch);
            renderView(<AppDetail params={{ id: 'ubuntu' }} />);

            expect(await screen.findByText('2 versions available')).toBeTruthy();
            expect(screen.getByText(/Open source repository/)).toBeTruthy();
            expect(screen.queryByRole('button', { name: /Deploy now/ })).toBeNull();

            const save = await screen.findByRole('button', { name: /Set version/ });
            await vi.waitFor(() => expect(save.disabled).toBe(false));
            fireEvent.click(save);
            await vi.waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0]).toMatchObject({ method: 'PUT', path: '/api/app-store/admin/apps/ubuntu/deploy-version', body: { version_tag: 'v1.1' } });
        });

        it('tells the admin why a version cannot be fixed', async () => {
            adminViewOn();
            const conflict = new Response(JSON.stringify({ detail: { reason: 'version_moved' } }), { status: 409, headers: { 'content-type': 'application/json' } });
            const { fetch } = writableBackend('admin', {
                ...withVersions(null),
                '/api/app-store/apps/ubuntu/versions': APPROVALS,
            }, () => conflict);
            vi.stubGlobal('fetch', fetch);
            renderView(<AppDetail params={{ id: 'ubuntu' }} />);
            const save = await screen.findByRole('button', { name: /Set version/ });
            await vi.waitFor(() => expect(save.disabled).toBe(false));
            fireEvent.click(save);
            expect(await screen.findByText(/points to a different commit/)).toBeTruthy();
        });

        it('shows the admin which version is fixed and lets them clear it', async () => {
            adminViewOn();
            const { fetch, sent } = writableBackend('admin', {
                ...withVersions('v1.1'),
                '/api/app-store/apps/ubuntu/versions': APPROVALS,
            });
            vi.stubGlobal('fetch', fetch);
            renderView(<AppDetail params={{ id: 'ubuntu' }} />);
            expect(await screen.findByText(/Lecturers deploy v1\.1/)).toBeTruthy();
            fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
            await vi.waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0].body).toEqual({ version_tag: null });
        });
    });
});
