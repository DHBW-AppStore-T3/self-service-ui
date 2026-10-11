// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';

// Does each GPU view render at all, with data in it? Same question as llm/views.render.test.jsx.

const ME = {
    email: 'dennis.pfisterer@dhbw.de', role: 'admin', tier: 'staff', gpu_tier: 'standard', jupyter_url: 'https://jupyter.example',
};

vi.mock('/llm/use-llm-me.jsx', () => ({
    useLlmMe: () => ({ query: { isPending: false, isError: false }, me: ME, hasAccess: true, isFleetAdmin: true, isAdmin: true }),
}));
vi.mock('/gpu/api-gpu.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useGpuApi: () => globalThis.__gpuApi };
});

const ENVS = [
    { id: 2, owner: 'dennis.pfisterer@dhbw.de', name: 'Conda-Beispiel', git_url: 'https://github.com/binder-examples/conda', branch: 'main',
      commit: 'f00a783146e9c6a2ed9726f01fc09fbfbad2f89e', image: 'reg/envs/github-com-binder-examples-conda:f00a783146e9', status: 'building',
      created_at: '2026-10-10T12:15:41Z', updated_at: '2026-10-10T12:15:41Z' },
    { id: 1, owner: 'dennis.pfisterer@dhbw.de', name: 'requirements', git_url: 'https://github.com/binder-examples/requirements', branch: 'main',
      commit: '505a59f0430cb6414a4acbdd88803ce33c7fd953', image: 'reg/envs/github-com-binder-examples-requirements:505a59f0430c', status: 'ready',
      created_at: '2026-10-10T12:15:41Z', updated_at: '2026-10-10T12:15:41Z' },
    { id: 3, owner: 'dennis.pfisterer@dhbw.de', name: 'kaputt', git_url: 'https://github.com/o/kaputt', branch: 'main',
      commit: '0123456789abcdef0123456789abcdef01234567', image: 'reg/envs/github-com-o-kaputt:0123456789ab', status: 'failed',
      message: 'Build fehlgeschlagen, Details im Build-Log.', created_at: '2026-10-10T12:15:41Z', updated_at: '2026-10-10T12:15:41Z' },
];

const SERVERS = [
    { name: '', ready: true, url: 'https://jupyter.example/user/a/', profile: 'cpu-gpukernel' },
    { name: 'conda-beispiel-2', ready: false, pending: 'spawn', url: 'https://jupyter.example/user/a/conda-beispiel-2/', profile: 'git-gpu',
      image: 'reg/envs/github-com-binder-examples-conda:f00a783146e9' },
];

const USAGE = {
    from: '2026-09-11T00:00:00Z', to: '2026-10-10T00:00:00Z',
    total: { days: 3, server_hours: 12, vcpu_hours: 8, ram_gb_hours: 30, gpu_hours: 2, cpu_used_hours: 2, ram_used_gb_hours: 10, home_gb_days: 4.5 },
    per_day: [],
    entries: [
        { project: 'group:wwi23seb', person: 'a@dhbw.de', profile: 'cpu', days: 2, server_hours: 8, vcpu_hours: 4, ram_gb_hours: 16, gpu_hours: 0, cpu_used_hours: 1, ram_used_gb_hours: 6, home_gb_days: 0 },
        { project: 'group:wwi23seb', person: 'b@dhbw.de', profile: 'pytorch', gpu_class: 'l4-3q', days: 1, server_hours: 2, vcpu_hours: 2, ram_gb_hours: 4, gpu_hours: 2, cpu_used_hours: 1, ram_used_gb_hours: 4, home_gb_days: 0 },
        { project: 'group:wwi23seb', person: 'a@dhbw.de', profile: 'home', days: 3, server_hours: 0, vcpu_hours: 0, ram_gb_hours: 0, gpu_hours: 0, cpu_used_hours: 0, ram_used_gb_hours: 0, home_gb_days: 4.5 },
    ],
};

const { GpuEnvironments } = await import('/gpu/environments.jsx');
const { GpuServers } = await import('/gpu/servers.jsx');
const { GpuUsage, groupUsage } = await import('/gpu/usage.jsx');

let consoleErrors = [];
beforeEach(() => {
    globalThis.__gpuApi = {
        listEnvironments: async () => ENVS,
        listServers: async () => SERVERS,
        environmentLog: async () => 'log',
        myWorkspaceUsage: async () => USAGE,
        workspaceUsage: async () => USAGE,
    };
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function expectNoRenderFailure() {
    const fatal = consoleErrors.filter(e =>
        /Maximum update depth|is not defined|is not a function|Cannot read/.test(e));
    expect(fatal).toEqual([]);
}

describe('the GPU views render', () => {
    it('Environments lists the environments with their status', async () => {
        renderView(<GpuEnvironments />);
        expect(await screen.findByText('Conda-Beispiel')).toBeTruthy();
        expect(screen.getByText('Build fehlgeschlagen, Details im Build-Log.')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Servers lists the servers', async () => {
        renderView(<GpuServers />);
        expect(await screen.findByText('conda-beispiel-2')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Usage shows the units per profile', async () => {
        renderView(<GpuUsage />);
        expect(await screen.findByText('pytorch')).toBeTruthy();
        expect(screen.getByText('home')).toBeTruthy();
        expectNoRenderFailure();
    });
});

describe('groupUsage', () => {
    it('sums by a dimension and counts people', () => {
        const byProject = groupUsage(USAGE.entries, 'project');
        expect(byProject).toHaveLength(1);
        expect(byProject[0]).toMatchObject({ name: 'group:wwi23seb', people: 2, vcpu_hours: 6, gpu_hours: 2, home_gb_days: 4.5 });
        expect(byProject[0].cpu_utilization).toBeCloseTo(2 / 6);
        const byClass = groupUsage(USAGE.entries, 'gpu_class');
        expect(byClass.map(g => g.name).sort()).toEqual(['', 'l4-3q']);
    });
});
