// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, screen, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
vi.hoisted(() => { window.appconfig = { appStoreEnabled: true }; });

import { DeploymentDetail } from './deployment-detail.jsx';
import { useDeployment } from './queries.jsx';

// The detail page of one deployment. What matters: the status follows the
// backend without a reload while something is moving, and stops asking once it
// has settled; and each role sees what the backend lets it see.

const MEMBER = { owner_view: false, operate: false, member: true };
const OWNER = { owner_view: true, operate: true, member: false };

const TASK = { taskId: 't1', type: 'deploy', status: 'running', created_at: '2026-10-24T10:00:00', started_at: '2026-10-24T10:00:05', finished_at: null, current_phase: 'apply', progress_pct: 40 };

function detail(overrides = {}) {
    return {
        deploymentId: 'd1', appId: 'ubuntu', name: 'Linux course', status: 'running', created_at: '2026-10-24T10:00:00',
        app: { appId: 'ubuntu', name: 'Ubuntu Desktop' },
        teams: [], latest_task: TASK, permissions: MEMBER, actions: [],
        ...overrides,
    };
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Answers by path; a route may be a function, called with the call number.
function server(routes) {
    const calls = {};
    const fetch = vi.fn(async url => {
        const target = new URL(url, 'http://localhost');
        const path = target.pathname + (target.search.includes('include_logs') ? '?include_logs=true' : '');
        calls[path] = (calls[path] ?? 0) + 1;
        const route = routes[path];
        if (route === undefined) return new Response('', { status: 404 });
        const answer = typeof route === 'function' ? route(calls[path]) : route;
        return answer instanceof Response ? answer : json(answer);
    });
    return { fetch, calls };
}

const ME = role => ({ '/api/app-store/users/me': { role } });

class FakeEventSource {
    static instances = [];
    constructor(url) {
        this.url = url;
        this.listeners = {};
        this.closed = false;
        FakeEventSource.instances.push(this);
    }
    addEventListener(name, listener) { (this.listeners[name] ??= []).push(listener); }
    close() { this.closed = true; }
    emit(name, payload) { (this.listeners[name] ?? []).forEach(listener => listener({ data: JSON.stringify(payload) })); }
}

function Probe() {
    const query = useDeployment('d1');
    return <output data-testid="status">{query.data?.status ?? (query.isError ? 'error' : 'none')}</output>;
}

describe('polling a deployment', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });
        window.appconfig = { appStoreEnabled: true, appStoreBaseUrl: '/api/app-store' };
    });
    afterEach(() => {
        cleanup();
        focusManager.setFocused(undefined);
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('follows the status until it settles, then stops asking', async () => {
        const { fetch, calls } = server({
            ...ME('student'),
            '/api/app-store/deployments/d1': n => detail({ status: n < 3 ? 'running' : 'success' }),
        });
        vi.stubGlobal('fetch', fetch);
        renderView(<Probe />);
        await vi.waitFor(() => expect(screen.getByTestId('status').textContent).toBe('running'));

        await act(() => vi.advanceTimersByTimeAsync(5000));
        expect(screen.getByTestId('status').textContent).toBe('running');
        await act(() => vi.advanceTimersByTimeAsync(5000));
        await vi.waitFor(() => expect(screen.getByTestId('status').textContent).toBe('success'));

        const settledAt = calls['/api/app-store/deployments/d1'];
        await act(() => vi.advanceTimersByTimeAsync(120000));
        expect(calls['/api/app-store/deployments/d1']).toBe(settledAt);
    });

    it('stays quiet while the tab is in the background', async () => {
        const { fetch, calls } = server({ ...ME('student'), '/api/app-store/deployments/d1': detail() });
        vi.stubGlobal('fetch', fetch);
        renderView(<Probe />);
        await vi.waitFor(() => expect(screen.getByTestId('status').textContent).toBe('running'));

        focusManager.setFocused(false);
        const before = calls['/api/app-store/deployments/d1'];
        await act(() => vi.advanceTimersByTimeAsync(30000));
        expect(calls['/api/app-store/deployments/d1']).toBe(before);
    });

    it('keeps the last status when a poll fails, and tries again', async () => {
        const { fetch } = server({
            ...ME('student'),
            '/api/app-store/deployments/d1': n => (n === 2 ? new Response('', { status: 502 }) : detail({ status: n === 1 ? 'running' : 'success' })),
        });
        vi.stubGlobal('fetch', fetch);
        renderView(<Probe />);
        await vi.waitFor(() => expect(screen.getByTestId('status').textContent).toBe('running'));
        await act(() => vi.advanceTimersByTimeAsync(5000));
        // The failed poll did not blank the page …
        expect(screen.getByTestId('status').textContent).toBe('running');
        // … and the next one went through.
        await act(() => vi.advanceTimersByTimeAsync(10000));
        await vi.waitFor(() => expect(screen.getByTestId('status').textContent).toBe('success'));
    });
});

describe('deployment detail', () => {
    beforeEach(() => {
        FakeEventSource.instances = [];
        vi.stubGlobal('EventSource', FakeEventSource);
        window.appconfig = { appStoreEnabled: true, appStoreBaseUrl: '/api/app-store' };
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    const ACCESS = { user_accounts: { a: { username: 'anna', ip: '10.0.0.5', port: 22, auth: 's3cret', type: 'password', protocol: 'ssh' } }, team_vms: {} };

    it('shows a student progress while it runs, without teams, tasks or logs', async () => {
        const { fetch, calls } = server({ ...ME('student'), '/api/app-store/deployments/d1': detail({ teams: [{ teamId: 'x', name: 'Team A', members: [] }] }) });
        vi.stubGlobal('fetch', fetch);
        renderView(<DeploymentDetail params={{ id: 'd1' }} />);
        expect(await screen.findByRole('heading', { level: 1, name: 'Linux course' })).toBeTruthy();
        expect(screen.getByText('Deploying')).toBeTruthy();
        expect(screen.getByText(/apply/)).toBeTruthy();
        expect(screen.getByRole('progressbar')).toBeTruthy();
        // A student has no owner view: no stream, no task list.
        expect(FakeEventSource.instances).toHaveLength(0);
        expect(calls['/api/app-store/tasks/deployment/d1']).toBeUndefined();
        expect(screen.queryByText('Team A')).toBeNull();
    });

    it('shows a student their credentials once the environment is ready', async () => {
        const { fetch } = server({
            ...ME('student'),
            '/api/app-store/deployments/d1': detail({ status: 'success', latest_task: { ...TASK, status: 'success', progress_pct: 100 } }),
            '/api/app-store/deployments/d1/my-access': ACCESS,
        });
        vi.stubGlobal('fetch', fetch);
        renderView(<DeploymentDetail params={{ id: 'd1' }} />);
        expect(await screen.findByText('anna')).toBeTruthy();
        expect(screen.getByText('10.0.0.5:22')).toBeTruthy();
    });

    it('tells a student what a failure means for them', async () => {
        const { fetch } = server({ ...ME('student'), '/api/app-store/deployments/d1': detail({ status: 'failed', latest_task: { ...TASK, status: 'failed' } }) });
        vi.stubGlobal('fetch', fetch);
        renderView(<DeploymentDetail params={{ id: 'd1' }} />);
        expect(await screen.findByText(/Please ask your lecturer/)).toBeTruthy();
    });

    it('explains a missing access and a missing deployment', async () => {
        vi.stubGlobal('fetch', server({ ...ME('student'), '/api/app-store/deployments/d1': new Response('', { status: 403 }) }).fetch);
        renderView(<DeploymentDetail params={{ id: 'd1' }} />);
        expect(await screen.findByText('You have no access to this environment.')).toBeTruthy();
        cleanup();

        vi.stubGlobal('fetch', server({ ...ME('student'), '/api/app-store/deployments/d1': new Response('', { status: 404 }) }).fetch);
        renderView(<DeploymentDetail params={{ id: 'd1' }} />);
        expect(await screen.findByText('This deployment was not found or no longer exists.')).toBeTruthy();
    });

    it('gives the owner teams, task history and the live log', async () => {
        const { fetch } = server({
            ...ME('teacher'),
            '/api/app-store/deployments/d1': detail({
                permissions: OWNER,
                teams: [{ teamId: 'x', name: 'Team A', members: [{ userId: 'u1', email: 'anna@dhbw.de', username: 'anna' }] }],
            }),
            '/api/app-store/tasks/deployment/d1': [{ ...TASK, status: 'running' }],
        });
        vi.stubGlobal('fetch', fetch);
        renderView(<DeploymentDetail params={{ id: 'd1' }} />);

        expect(await screen.findByText('Team A')).toBeTruthy();
        expect(screen.getByText('anna@dhbw.de')).toBeTruthy();
        const history = await screen.findByRole('table', { name: 'Task history' });
        expect(within(history).getByText('Deploy')).toBeTruthy();

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
        const stream = FakeEventSource.instances[0];
        expect(stream.url).toBe('/api/app-store/deployments/d1/stream');
        act(() => {
            stream.emit('snapshot', { status: 'running', current_phase: 'plan', progress_pct: 10 });
            stream.emit('log', { message: 'Initializing the backend' });
            stream.emit('log', { message: 'Plan: 3 to add' });
        });
        expect(await screen.findByText(/Plan: 3 to add/)).toBeTruthy();
        expect(screen.getByText(/Initializing the backend/)).toBeTruthy();
    });

    it('stops listening when the task ends, and reads the deployment again', async () => {
        const { fetch, calls } = server({
            ...ME('teacher'),
            '/api/app-store/deployments/d1': n => detail({ permissions: OWNER, status: n === 1 ? 'running' : 'success' }),
            '/api/app-store/tasks/deployment/d1': [],
        });
        vi.stubGlobal('fetch', fetch);
        renderView(<DeploymentDetail params={{ id: 'd1' }} />);
        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
        const stream = FakeEventSource.instances[0];
        act(() => stream.emit('succeeded', {}));
        expect(stream.closed).toBe(true);
        expect(await screen.findByText('Ready')).toBeTruthy();
        expect(calls['/api/app-store/deployments/d1']).toBeGreaterThan(1);
    });

    it('does not open a stream for a deployment that has settled', async () => {
        const { fetch } = server({
            ...ME('teacher'),
            '/api/app-store/deployments/d1': detail({ permissions: OWNER, status: 'success', latest_task: { ...TASK, status: 'success' } }),
            '/api/app-store/tasks/deployment/d1': [],
        });
        vi.stubGlobal('fetch', fetch);
        renderView(<DeploymentDetail params={{ id: 'd1' }} />);
        await screen.findByText('Ready');
        expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('falls back to the polled status when the stream breaks', async () => {
        const { fetch } = server({
            ...ME('teacher'),
            '/api/app-store/deployments/d1': detail({ permissions: OWNER }),
            '/api/app-store/tasks/deployment/d1': [],
        });
        vi.stubGlobal('fetch', fetch);
        renderView(<DeploymentDetail params={{ id: 'd1' }} />);
        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
        act(() => FakeEventSource.instances[0].onerror?.());
        expect(await screen.findByText(/live log is not available/)).toBeTruthy();
        expect(FakeEventSource.instances[0].closed).toBe(true);
    });
});
