// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';

// Does each GPU view render at all, with data in it? Same question as llm/views.render.test.jsx.

const ME = {
    email: 'dennis.pfisterer@dhbw.de', role: 'admin', tier: 'staff', jupyter_url: 'https://jupyter.example',
};

// The workspace settings ask the AI service only where this deployment has it.
vi.mock('/features.js', async (importOriginal) => ({ ...(await importOriginal()), llmEnabled: true }));
// A test switches to a project manager who is not an admin with globalThis.__llmIsAdmin = false.
vi.mock('/llm/use-llm-me.jsx', () => ({
    useLlmMe: () => ({ query: { isPending: false, isError: false }, me: ME, hasAccess: true, isFleetAdmin: true, isAdmin: globalThis.__llmIsAdmin ?? true }),
}));
vi.mock('/gpu/api-gpu.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useGpuApi: () => globalThis.__gpuApi };
});

const SERVERS = [
    { name: '', ready: true, url: 'https://jupyter.example/user/a/', profile: 'cpu-gpukernel' },
    { name: 'kurs-gpu', ready: false, pending: 'spawn', url: 'https://jupyter.example/user/a/kurs-gpu/', profile: 'gpu' },
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

const PROJECTS = [
    { slug: 'wwi23seb-ml', tree_node: 'p_ml', name: 'Machine Learning WWI23SEB', description: 'Übungen', role: 'manager', profiles: ['cpu', 'gpu'], gpu_classes: ['l4-3q'],
      members: [{ token: 'group:wwi23seb', role: 'member' }], image_base: 'tensorflow',
      image_git_url: 'https://github.com/o/ml-kurs', project_image: 'reg/envs/github-com-o-ml-kurs:0123456789ab-v1.1.0',
      image_build: { status: 'building', image: 'reg/envs/github-com-o-ml-kurs:89abcdef0123-v1.1.0', commit: '89abcdef0123456', branch: 'main', updated_at: '2026-10-14T08:00:00Z' },
      limits: { servers_per_person: 2, cpu_per_person: 4, ram_gb_per_person: 16, gpus_per_person: 1 }, gpus_by_class: { "l4-3q": 4 },
      budgets: [{ unit: 'vcpu_hours', window: '30d', amount: 40, per_person: true }],
      budget_status: [{ unit: 'vcpu_hours', window: '30d', amount: 40, per_person: true, used: 34.5, exhausted: false }] },
    { slug: 'statistik', name: 'Statistik', role: 'member', profiles: ['cpu'], gpu_classes: [], members: [],
      limits: { servers_per_person: 1 }, budgets: [], ends_at: '2027-03-31T00:00:00Z' },
];
const CATALOG = { profiles: [{ slug: 'cpu', name: 'CPU' }, { slug: 'gpu', name: 'GPU', gpu_class: 'l4-3q' }], gpuClasses: ['l4-3q'],
    bases: [{ id: 'python', name: 'Python', image: 'reg/platform/base-python:v2' }, { id: 'pytorch', name: 'PyTorch', image: 'reg/platform/base-pytorch:v2', default: true }, { id: 'tensorflow', name: 'TensorFlow / Keras', image: 'reg/platform/base-tensorflow:v2' }] };

const { GpuServers } = await import('/gpu/servers.jsx');
const { GpuUsage, groupUsage } = await import('/gpu/usage.jsx');
const { WorkspaceSettingsPanel, useWorkspaceSettings } = await import('/gpu/workspace-settings.jsx');

function SettingsTab({ nodeId }) {
    const draft = useWorkspaceSettings(nodeId, true);
    return draft.available ? <WorkspaceSettingsPanel draft={draft} /> : <span>none</span>;
}

let consoleErrors = [];
beforeEach(() => {
    globalThis.__gpuApi = {
        listServers: async () => SERVERS,
        projectImageLog: async () => 'log',
        rebuildProjectImage: async () => ({}),
        myWorkspaceUsage: async () => USAGE,
        listProjects: async () => PROJECTS,
        catalog: async () => CATALOG,
        workspaceUsage: async () => USAGE,
    };
    globalThis.__llmIsAdmin = true;
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
    it('Servers lists the servers', async () => {
        renderView(<GpuServers />);
        expect(await screen.findByText('kurs-gpu')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the workspace settings tab shows a project the AI service knows, with what is used of it', async () => {
        renderView(<SettingsTab nodeId="p_ml" />);
        expect(await screen.findByText(/34.5 (von|of) 40/)).toBeTruthy();
        // The project image from Git: its build and the image in use until the build is ready.
        expect(screen.getByText('reg/envs/github-com-o-ml-kurs:0123456789ab-v1.1.0')).toBeTruthy();
        expect(screen.getByText('89abcdef0123 (main)')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the workspace settings tab lets an admin add budgets', async () => {
        renderView(<SettingsTab nodeId="p_ml" />);
        expect(await screen.findByText(/Grenze hinzufügen|Add a limit/)).toBeTruthy();
        expect(screen.queryByText(/legen Admins fest|set by admins/)).toBeNull();
    });

    it('the workspace settings tab shows a manager the settings of the admins without offering to change them', async () => {
        globalThis.__llmIsAdmin = false;
        renderView(<SettingsTab nodeId="p_ml" />);
        expect(await screen.findByText(/legen Admins fest|set by admins/)).toBeTruthy();
        expect(screen.queryByText(/Grenze hinzufügen|Add a limit/)).toBeNull();
        // The environment stays editable.
        expect(screen.getByText('89abcdef0123 (main)')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the workspace settings tab stays away for a project the AI service does not know', async () => {
        renderView(<SettingsTab nodeId="p_unknown" />);
        expect(await screen.findByText('none')).toBeTruthy();
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
