import { describe, it, expect, vi } from 'vitest';
import {
    accessEntries, activeCatalogFilter, approvedVersionOptions, createAppStoreApi, deployTarget, deploymentPayload,
    INITIAL_STREAM, applyStreamEvent, cloudNames, credentialState, departmentsForGitLink, filterApps, frontendLink, greetingName, isAdmin, isStaff,
    normalizeGitLink, plainSummary, quickDeployBlocker, safeNextPath, statusColor, versionOptions,
} from './api.js';

const json = (data, init = {}) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' }, ...init });

describe('App Store client', () => {
    it('loads every page and uses only the BFF cookie, never a token', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(json(Array.from({ length: 100 }, (_, appId) => ({ appId }))))
            .mockResolvedValueOnce(json([{ appId: 100 }]));
        const api = createAppStoreApi({ baseUrl: '/api/app-store/', fetchImpl });
        expect(await api.apps()).toHaveLength(101);
        expect(fetchImpl.mock.calls[1][0]).toBe('/api/app-store/apps/?skip=100&limit=100');
        expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', redirect: 'error', headers: { Accept: 'application/json' } });
    });

    it('reports a 401 and keeps the status for the view', async () => {
        const onUnauthorized = vi.fn();
        const api = createAppStoreApi({ baseUrl: '/api/app-store', onUnauthorized, fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 401 })) });
        await expect(api.apps()).rejects.toMatchObject({ status: 401 });
        expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    it('does not mistake a 403 for an expired session', async () => {
        const onUnauthorized = vi.fn();
        const api = createAppStoreApi({ baseUrl: '/api/app-store', onUnauthorized, fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 403 })) });
        await expect(api.deployments()).rejects.toMatchObject({ status: 403 });
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('rejects a login page returned with HTTP 200', async () => {
        const api = createAppStoreApi({ baseUrl: '/api/app-store', fetchImpl: vi.fn().mockResolvedValue(new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })) });
        await expect(api.apps()).rejects.toThrow('not JSON');
    });

    it('carries the structured reason of a refused create', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(json({ detail: { reason: 'openstack_credentials_missing' } }, { status: 412 }));
        const api = createAppStoreApi({ baseUrl: '/api/app-store', fetchImpl });
        await expect(api.createDeployment({ name: 'x' })).rejects.toMatchObject({ status: 412, reason: 'openstack_credentials_missing' });
        expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"x"}' });
    });

    it('encodes IDs and forwards cancellation', async () => {
        const fetchImpl = vi.fn(async () => json({}));
        const signal = new AbortController().signal;
        const api = createAppStoreApi({ baseUrl: '/api/app-store', fetchImpl });
        await api.app('a/b', signal);
        expect(fetchImpl).toHaveBeenCalledWith('/api/app-store/apps/a%2Fb', expect.objectContaining({ signal }));
        await api.appVariables('a', 'v1.0 beta');
        expect(fetchImpl.mock.calls[1][0]).toBe('/api/app-store/apps/a/variables?version=v1.0%20beta');
    });

    it('refuses unsafe or absent handoff URLs', () => {
        vi.stubGlobal('window', { location: { origin: 'https://portal.example' } });
        expect(frontendLink('javascript:alert(1)', '/apps')).toBeNull();
        expect(frontendLink('', '/apps')).toBeNull();
        expect(frontendLink('https://store.example/', '/apps/123')).toBe('https://store.example/apps/123');
        vi.unstubAllGlobals();
    });
});

describe('roles and status', () => {
    it('counts teachers and admins as staff, nobody else', () => {
        expect(isStaff({ role: 'teacher' })).toBe(true);
        expect(isStaff({ role: 'admin' })).toBe(true);
        expect(isStaff({ role: 'student' })).toBe(false);
        expect(isStaff(undefined)).toBe(false);
    });

    it('counts only admins as admin', () => {
        expect(isAdmin({ role: 'admin' })).toBe(true);
        expect(isAdmin({ role: 'teacher' })).toBe(false);
        expect(isAdmin(undefined)).toBe(false);
    });

    // A deployment without any task has status null; that used to throw.
    it('colours every status, including none', () => {
        expect(statusColor(null)).toBe('gray');
        expect(statusColor('success')).toBe('green');
        expect(statusColor('pause_failed')).toBe('red');
        expect(statusColor('running')).toBe('blue');
        expect(statusColor('paused')).toBe('gray');
    });
});

describe('one-click deployment', () => {
    it('lists stable versions before prereleases', () => {
        const options = versionOptions([
            { version: 'v2.0-rc1', name: 'v2.0-rc1', prerelease: 'True' },
            { version: 'v1.0', name: 'First', prerelease: 'False' },
            { name: 'no tag' },
        ]);
        expect(options.map(o => o.value)).toEqual(['v1.0', 'v2.0-rc1']);
        expect(options[0].label).toBe('v1.0 – First');
    });

    it('allows variables that have a default, and nothing that needs input', () => {
        expect(quickDeployBlocker([])).toBeNull();
        expect(quickDeployBlocker([{ name: 'size', required: false, default: 'm1.small' }])).toBeNull();
        expect(quickDeployBlocker([{ name: 'pw', required: true }])).toBe('inputs');
        expect(quickDeployBlocker([{ name: 'cfg', osType: 'file', required: false }])).toBe('inputs');
        expect(quickDeployBlocker([{ name: 'per', varScope: 'team', required: false, default: '' }])).toBe('inputs');
    });

    it('sends what the existing wizard sends without teams and inputs', () => {
        expect(deploymentPayload({ name: '  Linux ', appId: 'a', releaseTag: 'v1.0' }))
            .toEqual({ name: 'Linux', appId: 'a', releaseTag: 'v1.0', userInputVar: { tofu: {} }, teams: [] });
    });
});

describe('access credentials', () => {
    it('builds one entry per account with an address', () => {
        const entries = accessEntries({
            user_accounts: {
                a: { username: 'anna', ip: '10.0.0.5', port: 22, auth: 'pw', type: 'password', protocol: 'ssh' },
                b: { username: 'ben', auth: 'KEY', type: 'ssh_key' },
            },
            team_vms: { 'Team-1': { floating_ip: '192.0.2.7' } },
        });
        expect(entries[0]).toMatchObject({ username: 'anna', address: '10.0.0.5:22', protocol: 'ssh', secret: 'pw', secretIsKey: false });
        expect(entries[1]).toMatchObject({ username: 'ben', address: '192.0.2.7', secretIsKey: true });
    });

    it('treats an empty answer as no credentials, not an error', () => {
        expect(accessEntries({ user_accounts: {}, team_vms: {} })).toEqual([]);
        expect(accessEntries(undefined)).toEqual([]);
    });
});

describe('catalog filter', () => {
    const apps = [
        { name: 'Zeta', description: 'Linux', is_private: false, created_at: '2026-01-01' },
        { name: 'Alpha', description: 'Windows', is_private: true, created_at: '2026-02-01' },
    ];
    it('searches name and description, filters visibility, sorts', () => {
        expect(filterApps(apps, { search: 'linux', visibility: 'all', sort: 'name' }, 'de').map(a => a.name)).toEqual(['Zeta']);
        expect(filterApps(apps, { search: '', visibility: 'private', sort: 'name' }, 'de').map(a => a.name)).toEqual(['Alpha']);
        expect(filterApps(apps, { search: '', visibility: 'all', sort: 'name' }, 'de').map(a => a.name)).toEqual(['Alpha', 'Zeta']);
        expect(filterApps(apps, { search: '', visibility: 'all', sort: 'newest' }, 'de').map(a => a.name)).toEqual(['Alpha', 'Zeta']);
    });
});

describe('departments', () => {
    it('brings every spelling of a git link to host/owner/repo', () => {
        const expected = 'github.com/dhbw-appstore-t3/online-ide';
        expect(normalizeGitLink('https://github.com/DHBW-AppStore-T3/Online-IDE')).toBe(expected);
        expect(normalizeGitLink('https://github.com/DHBW-AppStore-T3/Online-IDE.git')).toBe(expected);
        expect(normalizeGitLink('https://github.com/DHBW-AppStore-T3/Online-IDE.git/')).toBe(expected);
        expect(normalizeGitLink('https://www.github.com/DHBW-AppStore-T3/Online-IDE/')).toBe(expected);
        expect(normalizeGitLink('ssh://git@github.com/DHBW-AppStore-T3/Online-IDE.git')).toBe(expected);
        expect(normalizeGitLink('git@github.com:DHBW-AppStore-T3/Online-IDE.git')).toBe(expected);
        expect(normalizeGitLink('  ')).toBeNull();
        expect(normalizeGitLink(null)).toBeNull();
    });

    it('assigns departments by exact alias, never by name', () => {
        expect(departmentsForGitLink('https://github.com/DHBW-AppStore-T3/Online-IDE')).toEqual(['informatik']);
        expect(departmentsForGitLink('https://github.com/DHBW-AppStore/web-latex.git'))
            .toEqual(['informatik', 'maschinenbau', 'elektrotechnik', 'wirtschaftsingenieurwesen', 'faecheruebergreifend']);
        // The same repository name under an unknown owner is not the curated app.
        expect(departmentsForGitLink('https://github.com/someone-else/online-ide')).toEqual([]);
        expect(departmentsForGitLink(undefined)).toEqual([]);
    });
});

describe('catalog filter by department and recommendation', () => {
    const apps = [
        { name: 'IDE', git_link: 'https://github.com/DHBW-AppStore-T3/Online-IDE', recommended: true, description: '', is_private: false, created_at: '2026-01-01' },
        { name: 'LaTeX', git_link: 'https://github.com/DHBW-AppStore-T3/Web-LaTeX', recommended: false, description: '', is_private: false, created_at: '2026-01-02' },
        { name: 'Unknown', git_link: 'https://example.org/x', recommended: true, description: '', is_private: false, created_at: '2026-01-03' },
    ];
    const names = filter => filterApps(apps, { search: '', visibility: 'all', sort: 'name', filter }, 'de').map(a => a.name);

    it('shows everything under all, and only matches under a department or recommended', () => {
        expect(names('all')).toEqual(['IDE', 'LaTeX', 'Unknown']);
        expect(names('maschinenbau')).toEqual(['LaTeX']);
        expect(names('informatik')).toEqual(['IDE', 'LaTeX']);
        expect(names('recommended')).toEqual(['IDE', 'Unknown']);
    });

    it('combines the filter with the search', () => {
        expect(filterApps(apps, { search: 'late', visibility: 'all', sort: 'name', filter: 'informatik' }, 'de').map(a => a.name)).toEqual(['LaTeX']);
        expect(filterApps(apps, { search: 'late', visibility: 'all', sort: 'name', filter: 'recommended' }, 'de')).toEqual([]);
    });

    it('treats a missing filter like all', () => {
        expect(filterApps(apps, { search: '', visibility: 'all', sort: 'name' }, 'de')).toHaveLength(3);
    });

    it('preselects recommended only while something is recommended and nothing was chosen', () => {
        expect(activeCatalogFilter(null, apps)).toBe('recommended');
        expect(activeCatalogFilter(null, apps.map(a => ({ ...a, recommended: false })))).toBe('all');
        expect(activeCatalogFilter('informatik', apps)).toBe('informatik');
        expect(activeCatalogFilter('all', apps)).toBe('all');
        // The last recommendation was withdrawn while the chip was selected.
        expect(activeCatalogFilter('recommended', apps.map(a => ({ ...a, recommended: false })))).toBe('all');
    });
});

describe('which version gets deployed', () => {
    const versions = [
        { version: 'v2.0-rc1', name: 'v2.0-rc1', prerelease: 'True' },
        { version: 'v1.1', name: 'v1.1', prerelease: 'False' },
        { version: 'v1.0', name: 'v1.0', prerelease: 'False' },
    ];

    it('takes the version an admin fixed', () => {
        expect(deployTarget({ versions, deploy_version: 'v1.0' })).toEqual({ version: 'v1.0', fixed: true });
    });

    it('falls back to the first stable version while nothing is fixed', () => {
        expect(deployTarget({ versions, deploy_version: null })).toEqual({ version: 'v1.1', fixed: false });
        expect(deployTarget({ versions })).toEqual({ version: 'v1.1', fixed: false });
    });

    it('ignores a fixed version the list no longer offers', () => {
        expect(deployTarget({ versions, deploy_version: 'v0.9' })).toEqual({ version: 'v1.1', fixed: false });
    });

    it('has no target without any version', () => {
        expect(deployTarget({ versions: [], deploy_version: 'v1.0' })).toEqual({ version: null, fixed: false });
        expect(deployTarget({})).toEqual({ version: null, fixed: false });
    });
});

describe('versions an admin can fix', () => {
    const versions = [
        { version: 'v1.2', name: 'v1.2', prerelease: 'False' },
        { version: 'v1.1', name: 'Second', prerelease: 'False' },
        { version: 'v1.0', name: 'v1.0', prerelease: 'False' },
    ];
    const approvals = [
        { version_tag: 'v1.2', status: 'pending' },
        { version_tag: 'v1.1', status: 'approved' },
        { version_tag: 'v1.0', status: 'rejected' },
        { version_tag: 'v0.1', status: 'approved' },
    ];

    it('offers only approved versions that the repository still lists', () => {
        expect(approvedVersionOptions(versions, approvals).map(o => o.value)).toEqual(['v1.1']);
        expect(approvedVersionOptions(versions, approvals)[0].label).toBe('v1.1 – Second');
    });

    it('offers nothing while the approvals are unknown', () => {
        expect(approvedVersionOptions(versions, undefined)).toEqual([]);
    });
});

describe('the deploy version calls', () => {
    it('PUTs the version, and null to clear it', async () => {
        const fetchImpl = vi.fn(async () => json({ appId: 'a' }));
        const api = createAppStoreApi({ baseUrl: '/api/app-store', fetchImpl });
        await api.setDeployVersion('a/b', 'v1.1');
        await api.setDeployVersion('a/b', null);
        expect(fetchImpl.mock.calls[0][0]).toBe('/api/app-store/admin/apps/a%2Fb/deploy-version');
        expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: '{"version_tag":"v1.1"}' });
        expect(fetchImpl.mock.calls[1][1]).toMatchObject({ body: '{"version_tag":null}' });
    });

    it('reads the approvals of an app', async () => {
        const fetchImpl = vi.fn(async () => json([]));
        const api = createAppStoreApi({ baseUrl: '/api/app-store', fetchImpl });
        await api.versionApprovals('a/b');
        expect(fetchImpl.mock.calls[0][0]).toBe('/api/app-store/apps/a%2Fb/versions');
    });
});

describe('greeting', () => {
    it('uses the first name, then the username, then nothing', () => {
        expect(greetingName({ firstName: ' Dozentin ', username: 'dozent.demo' })).toBe('Dozentin');
        expect(greetingName({ firstName: '  ', username: 'dozent.demo' })).toBe('dozent.demo');
        expect(greetingName({ firstName: null, username: 'dozent.demo' })).toBe('dozent.demo');
        expect(greetingName({})).toBeNull();
        expect(greetingName(undefined)).toBeNull();
    });
});

describe('OpenStack credentials', () => {
    it('names the clouds of a clouds.yaml', () => {
        const one = 'clouds:\n  openstack:\n    auth:\n      auth_url: https://x\n';
        const two = '# a comment\nclouds:\n    dhbw:\n        auth:\n            a: b\n    "other-cloud":\n        auth: {}\nextra:\n  nope: 1\n';
        expect(cloudNames(one)).toEqual(['openstack']);
        expect(cloudNames(two)).toEqual(['dhbw', 'other-cloud']);
        expect(cloudNames('nothing: here')).toEqual([]);
        expect(cloudNames('')).toEqual([]);
    });

    it('classifies a stored credential', () => {
        expect(credentialState({ project_verified: true, last_validation_error: null })).toBe('valid');
        expect(credentialState({ project_verified: false, last_validation_error: null })).toBe('unverified');
        expect(credentialState({ project_verified: true, last_validation_error: 'auth_failed' })).toBe('invalid');
    });

    it('lets only app paths through as the place to return to', () => {
        expect(safeNextPath('/apps/abc')).toBe('/apps/abc');
        expect(safeNextPath('/apps/a%20b?x=1')).toBeNull();
        expect(safeNextPath('//evil.example/x')).toBeNull();
        expect(safeNextPath('https://evil.example')).toBeNull();
        expect(safeNextPath('javascript:alert(1)')).toBeNull();
        expect(safeNextPath('apps/abc')).toBeNull();
        expect(safeNextPath(null)).toBeNull();
    });

    it('reads, saves from a clouds.yaml, tests and deletes through the backend', async () => {
        const fetchImpl = vi.fn(async (url, init) => (init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ credentialId: 'c1' })));
        const api = createAppStoreApi({ baseUrl: '/api/app-store', fetchImpl });
        await api.credentials();
        await api.saveCredentialFromYaml('clouds: {}', 'dhbw');
        await api.saveCredentialFromYaml('clouds: {}');
        await api.testCredential('c/1');
        expect(await api.deleteCredential('c/1')).toBeNull();
        const calls = fetchImpl.mock.calls.map(([url, init]) => [url, init.method ?? 'GET', init.body]);
        expect(calls).toEqual([
            ['/api/app-store/me/openstack-credentials', 'GET', undefined],
            ['/api/app-store/me/openstack-credentials/from-yaml', 'POST', '{"clouds_yaml":"clouds: {}","cloud_name":"dhbw"}'],
            ['/api/app-store/me/openstack-credentials/from-yaml', 'POST', '{"clouds_yaml":"clouds: {}"}'],
            ['/api/app-store/me/openstack-credentials/c%2F1/test', 'POST', undefined],
            ['/api/app-store/me/openstack-credentials/c%2F1', 'DELETE', undefined],
        ]);
    });
});

describe('live log of a deployment', () => {
    const apply = (state, ...events) => events.reduce((s, [name, payload]) => applyStreamEvent(s, name, payload), state);

    it('takes phase and progress from the snapshot and from progress events', () => {
        const state = apply(INITIAL_STREAM,
            ['snapshot', { status: 'running', current_phase: 'plan', progress_pct: 10 }],
            ['progress', { current_phase: 'apply', progress_pct: 55 }]);
        expect(state).toMatchObject({ phase: 'apply', progress: 55, done: null });
    });

    it('collects log lines and keeps the last ones only', () => {
        let state = INITIAL_STREAM;
        for (let i = 0; i < 2100; i++) state = applyStreamEvent(state, 'log', { message: `line ${i}` });
        expect(state.lines).toHaveLength(2000);
        expect(state.lines[0]).toBe('line 100');
        expect(state.lines.at(-1)).toBe('line 2099');
    });

    it('notes an overflow and the end of the task', () => {
        expect(apply(INITIAL_STREAM, ['overflow', {}]).overflow).toBe(true);
        expect(apply(INITIAL_STREAM, ['failed', { message: 'boom' }])).toMatchObject({ done: 'failed' });
        expect(apply(INITIAL_STREAM, ['succeeded', {}]).done).toBe('succeeded');
        expect(apply(INITIAL_STREAM, ['revoked', {}]).done).toBe('revoked');
    });

    it('ends right away on the snapshot of a task that is already over', () => {
        expect(apply(INITIAL_STREAM, ['snapshot', { status: 'success' }]).done).toBe('succeeded');
        expect(apply(INITIAL_STREAM, ['snapshot', { status: 'failed' }]).done).toBe('failed');
        expect(apply(INITIAL_STREAM, ['snapshot', { status: null }]).done).toBe('ended');
        expect(apply(INITIAL_STREAM, ['snapshot', { status: 'running' }]).done).toBeNull();
    });

    it('ignores what it does not know', () => {
        expect(apply(INITIAL_STREAM, ['mystery', { x: 1 }])).toEqual(INITIAL_STREAM);
    });

    it('reads the deployment and its tasks', async () => {
        const fetchImpl = vi.fn(async () => json({}));
        const api = createAppStoreApi({ baseUrl: '/api/app-store/', fetchImpl });
        await api.deployment('d/1');
        await api.deploymentTasks('d/1');
        await api.deploymentLogs('d/1');
        expect(fetchImpl.mock.calls.map(c => c[0])).toEqual([
            '/api/app-store/deployments/d%2F1',
            '/api/app-store/tasks/deployment/d%2F1',
            '/api/app-store/deployments/d%2F1?include_logs=true',
        ]);
        expect(api.streamUrl('d/1')).toBe('/api/app-store/deployments/d%2F1/stream');
    });
});

describe('recommending an app', () => {
    it('PUTs the flag to the admin endpoint', async () => {
        const fetchImpl = vi.fn(async () => json({ appId: 'a/b', recommended: true }));
        const api = createAppStoreApi({ baseUrl: '/api/app-store', fetchImpl });
        await api.setRecommended('a/b', true);
        expect(fetchImpl).toHaveBeenCalledWith('/api/app-store/admin/apps/a%2Fb/recommended', expect.objectContaining({
            method: 'PUT', body: '{"recommended":true}',
        }));
    });
});

describe('catalog card summary', () => {
    it('reduces Markdown to its words', () => {
        const md = '# GitLab CE – Git pro Student\n\nDeploy für **jedes** Team.\n\n| Phase | Dauer |\n|---|---|\n| Start | 2 Min |\n\n- [Docs](https://x.example) mit `code`';
        expect(plainSummary(md)).toBe('GitLab CE – Git pro Student Deploy für jedes Team. Phase Dauer Start 2 Min Docs mit code');
        expect(plainSummary('')).toBe('');
        expect(plainSummary(null)).toBe('');
    });
});
