// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
vi.hoisted(() => { window.appconfig = { appStoreEnabled: true }; });

import { Wizard } from './wizard.jsx';

// The deployment wizard end to end against a backend that answers like the real
// one: what a lecturer can do without leaving this UI, and what it sends.

const APP = { appId: 'ubuntu', name: 'Ubuntu Desktop', description: '', git_link: '', versions: [{ version: 'v1.0', name: 'v1.0', prerelease: 'False' }], deploy_version: null };
const ANNA = { userId: 'u1', username: 'anna', email: 'anna@dhbw.de', firstName: 'Anna', lastName: 'Beck' };
const BEN = { userId: 'u2', username: 'ben', email: 'ben@dhbw.de', firstName: 'Ben', lastName: 'Roth' };
const CARA = { userId: 'u3', username: 'cara', email: 'cara@dhbw.de', firstName: 'Cara', lastName: 'Voss' };
const POD = { runtime: 'kubernetes', scope: 'team', resources: [], network: {} };

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// A backend by pathname; POSTs to /deployments/ are recorded in `sent`.
function backend(overrides = {}, create = () => json({ deploymentId: 'new1' }, 201)) {
    const sent = [];
    const routes = {
        '/api/app-store/users/me': { role: 'teacher' },
        '/api/app-store/apps/ubuntu': APP,
        '/api/app-store/apps/ubuntu/variables': [],
        '/api/app-store/apps/ubuntu/runtime': POD,
        '/api/app-store/courses/': [{ courseId: 'c1', name: 'WWI23' }],
        '/api/app-store/courses/c1': { courseId: 'c1', name: 'WWI23', users: [ANNA, BEN] },
        '/api/app-store/users/': [ANNA, BEN, CARA],
        '/api/app-store/me/openstack-credentials': [],
        ...overrides,
    };
    const fetch = vi.fn(async (url, init = {}) => {
        const path = new URL(url, 'http://localhost').pathname;
        if (init.method === 'POST' && path === '/api/app-store/deployments/') {
            sent.push(JSON.parse(init.body));
            return create();
        }
        return path in routes ? json(routes[path]) : new Response('', { status: 404 });
    });
    return { fetch, sent };
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const deploy = () => fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));

async function open(overrides, create) {
    const server = backend(overrides, create);
    vi.stubGlobal('fetch', server.fetch);
    renderView(<Wizard params={{ id: 'ubuntu' }} />);
    await screen.findByRole('heading', { level: 1, name: 'Deploy Ubuntu Desktop' });
    // The first step waits for who the person is, like every other write path.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false));
    return server;
}

// Past the first step with the chosen course (Anna and Ben).
async function withCourse(overrides, create) {
    const server = await open(overrides, create);
    const chip = await screen.findByRole('checkbox', { name: /WWI23 \(2\)/ });
    await waitFor(() => expect(chip.disabled).toBe(false));
    fireEvent.click(chip);
    expect(screen.getByRole('status').textContent).toBe('2 students selected');
    return server;
}

describe('deployment wizard', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.history.replaceState({}, '', '/apps/ubuntu/deploy');
        window.appconfig = { appStoreEnabled: true, appStoreBaseUrl: '/api/app-store' };
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('deploys an app just for the lecturer, then opens the new deployment', async () => {
        const { sent } = await open();
        expect(screen.getByDisplayValue('Ubuntu Desktop')).toBeTruthy();
        next(); // distribution: nobody to distribute
        expect(screen.getByText('Nobody was chosen, so there is nothing to distribute.')).toBeTruthy();
        next(); // settings
        await screen.findByText('This version needs no settings.');
        next(); // summary
        expect(await screen.findByText('Only you')).toBeTruthy();
        deploy();
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).toEqual({
            name: 'Ubuntu Desktop', appId: 'ubuntu', releaseTag: 'v1.0', teams: [], userInputVar: { packer: {}, terraform: {} },
        });
        await waitFor(() => expect(window.location.pathname).toBe('/deployments/new1'));
    });

    it('needs a name before it goes on', async () => {
        await open();
        fireEvent.change(screen.getByLabelText(/Name of the deployment/), { target: { value: '  ' } });
        expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
    });

    it('puts a chosen course into one team', async () => {
        const { sent } = await withCourse();
        next();
        expect(screen.getByText('All 2 students are in one team.')).toBeTruthy();
        next();
        await screen.findByText('This version needs no settings.');
        next();
        expect(await screen.findByText('1 team · 2 people')).toBeTruthy();
        deploy();
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].teams).toEqual([{ name: 'Team 1', userIds: ['u1', 'u2'] }]);
    });

    it('selects single students and finds them by search', async () => {
        const { sent } = await open();
        fireEvent.click(await screen.findByRole('checkbox', { name: /Cara Voss/ }));
        expect(screen.getByRole('status').textContent).toBe('1 student selected');
        next();
        next();
        await screen.findByText('This version needs no settings.');
        next();
        deploy();
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].teams).toEqual([{ name: 'Team 1', userIds: ['u3'] }]);
    });

    it('puts everybody on their own, and locks the distribution, for an app that runs one VM per person', async () => {
        const { sent } = await withCourse({ '/api/app-store/apps/ubuntu/runtime': { ...POD, scope: 'user' } });
        // The runtime has to be known before the lock can apply.
        await waitFor(() => expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false));
        next();
        expect(await screen.findByText('This app runs one environment per person: everybody is on their own.')).toBeTruthy();
        for (const mode of ['One team for everyone', 'Everybody on their own', 'Own teams']) {
            expect(screen.getByRole('radio', { name: mode }).disabled).toBe(true);
        }
        expect(screen.getByRole('radio', { name: 'Everybody on their own' }).checked).toBe(true);
        expect(screen.queryByText('Distribute randomly')).toBeNull();
        expect(screen.queryByText(/Everybody needs a team/)).toBeNull();
        next();
        await screen.findByText('This version needs no settings.');
        next();
        deploy();
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].teams).toEqual([{ name: 'Team 1', userIds: ['u1'] }, { name: 'Team 2', userIds: ['u2'] }]);
    });

    it('hides the hint and the controls of own teams while everybody is on their own', async () => {
        await withCourse();
        next();
        fireEvent.click(screen.getByRole('radio', { name: 'Everybody on their own' }));
        expect(screen.getByText('Each of the 2 students gets an environment of their own.')).toBeTruthy();
        expect(screen.queryByText('Distribute randomly')).toBeNull();
        expect(screen.queryByText(/Everybody needs a team/)).toBeNull();
    });

    it('distributes into own teams by dropping students, and waits until it is complete', async () => {
        const { sent } = await withCourse();
        next();
        fireEvent.click(screen.getByRole('radio', { name: 'Own teams' }));
        // Starts with two teams; Anna and Ben are both in the first.
        expect(screen.getByLabelText('Name of team 2')).toBeTruthy();
        expect(screen.getByRole('status').textContent).toMatch(/Everybody needs a team/);
        expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);

        const second = screen.getByLabelText('Name of team 2').closest('[class*="Paper"]');
        const chip = screen.getByText('Ben Roth');
        fireEvent.drop(second, { dataTransfer: { getData: () => 'u2' } });
        expect(within(second).getByText('Ben Roth')).toBeTruthy();
        expect(chip).toBeTruthy();
        expect(screen.queryByRole('status')?.textContent ?? '').not.toMatch(/Everybody needs a team/);

        fireEvent.change(screen.getByLabelText('Name of team 2'), { target: { value: 'Late group' } });
        next();
        await screen.findByText('This version needs no settings.');
        next();
        deploy();
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].teams).toEqual([{ name: 'Team 1', userIds: ['u1'] }, { name: 'Late group', userIds: ['u2'] }]);
    });

    it('moves a student with the selector as well, and can empty all teams', async () => {
        await withCourse();
        next();
        fireEvent.click(screen.getByRole('radio', { name: 'Own teams' }));
        fireEvent.click(screen.getByRole('button', { name: 'Empty all teams' }));
        expect(screen.getByText('Not yet assigned (2)')).toBeTruthy();
        expect(screen.getAllByLabelText('Move Anna Beck to').length).toBeGreaterThan(0);
    });

    describe('settings', () => {
        const VARIABLES = [
            { name: 'admin_password', type: 'string', required: true, source: 'terraform', description: 'Login password' },
            { name: 'disk_size', type: 'number', required: false, default: 20, source: 'terraform', description: 'Disk in GB' },
            { name: 'tuning', type: 'string', required: false, default: 'normal', source: 'terraform', description: 'Fine tuning @expert' },
        ];

        async function atSettings(variables, overrides) {
            const server = await open({ '/api/app-store/apps/ubuntu/variables': variables, ...overrides });
            next();
            next();
            await screen.findByText('Settings', { selector: 'h3' });
            return server;
        }

        it('shows only what is required without a default, the rest under expert settings', async () => {
            await atSettings(VARIABLES);
            expect(await screen.findByLabelText(/admin_password/)).toBeTruthy();
            expect(screen.getByText('Expert settings')).toBeTruthy();
            // Collapsed: its inputs are there but out of sight.
            const disk = screen.getByDisplayValue('20');
            expect(getComputedStyle(disk.closest('[role="region"]')).display).toBe('none');
            fireEvent.click(screen.getByText('Expert settings'));
            await waitFor(() => expect(getComputedStyle(disk.closest('[role="region"]')).display).not.toBe('none'));
            expect(screen.getByDisplayValue('normal')).toBeTruthy();
        });

        it('does not go on while a required value is missing, and sends the values it has', async () => {
            const { sent } = await atSettings(VARIABLES);
            const password = await screen.findByLabelText(/admin_password/);
            expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
            expect(screen.getAllByText('Please fill in: admin_password').length).toBeGreaterThan(0);
            fireEvent.change(password, { target: { value: 's3cret' } });
            await waitFor(() => expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false));
            next();
            expect(await screen.findByText('admin_password')).toBeTruthy();
            deploy();
            await waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0].userInputVar.terraform).toEqual({ admin_password: 's3cret', disk_size: 20, tuning: 'normal' });
        });

        it('opens the expert settings when one of them is required', async () => {
            await atSettings([{ name: 'license', type: 'string', required: true, source: 'terraform', description: '@expert' }]);
            expect(await screen.findByLabelText(/license/)).toBeTruthy();
        });

        it('asks for a value per team and sends a file per team under files', async () => {
            const variables = [
                { name: 'team_note', type: 'string', required: true, varScope: 'team', source: 'terraform' },
                { name: 'starter', type: 'string', osType: 'file', varScope: 'team', source: 'terraform' },
            ];
            const server = await open({ '/api/app-store/apps/ubuntu/variables': variables });
            const chip = await screen.findByRole('checkbox', { name: /WWI23 \(2\)/ });
            await waitFor(() => expect(chip.disabled).toBe(false));
            fireEvent.click(chip);
            next();
            next();
            fireEvent.change(await screen.findByLabelText(/For Team „Team 1"/), { target: { value: 'hello' } });
            const input = document.querySelector('input[type=file]');
            fireEvent.change(input, { target: { files: [new File(['print(1)'], 'main.py', { type: 'text/x-python' })] } });
            await screen.findByText(/main\.py/);
            await waitFor(() => expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false));
            next();
            expect(await screen.findByText(/main\.py/)).toBeTruthy();
            deploy();
            await waitFor(() => expect(server.sent).toHaveLength(1));
            expect(server.sent[0].userInputVar.terraform).toEqual({ team_note: { 'Team 1': 'hello' } });
            expect(server.sent[0].files).toEqual({ starter: { 'Team 1': { name: 'main.py', content_b64: 'cHJpbnQoMSk=', size: 8, content_type: 'text/x-python' } } });
        });

        it('offers cpu and memory of a VM and the network switches the app allows', async () => {
            const runtime = {
                runtime: 'kubernetes', scope: 'team',
                resources: [{ container: 'vm', cpu: { default: '2', min: '1', max: '4' }, memory: { default: '4Gi', min: '2Gi', max: '8Gi' } }],
                network: { internet: { default: false } },
            };
            const { sent } = await atSettings([], { '/api/app-store/apps/ubuntu/runtime': runtime });
            expect(await screen.findByTestId('cpu-vm')).toBeTruthy();
            expect(screen.getByTestId('cpu-vm').textContent).toBe('2');
            expect(screen.getByTestId('memory-vm').textContent).toBe('4Gi');
            fireEvent.click(screen.getByRole('switch', { name: /Internet access/ }));
            next();
            await screen.findByText('Summary', { selector: 'h3' });
            expect(screen.getByText('Internet access')).toBeTruthy();
            deploy();
            await waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0].userInputVar).toEqual({
                packer: {}, terraform: {}, resources: { vm: { cpu: '2', memory: '4Gi' } }, network: { internet: true },
            });
        });
    });

    describe('VM apps', () => {
        const VM = { runtime: 'openstack-vm', scope: 'team', resources: [], network: {} };
        const CRED = { credentialId: 'cred-1', project_id: 'p1', project_name: 'course-project', project_verified: true, last_validation_error: null };

        async function toSummary(overrides) {
            await open({ '/api/app-store/apps/ubuntu/runtime': VM, ...overrides });
            next(); next();
            await screen.findByText('This version needs no settings.');
            next();
        }

        it('deploys in the only usable project without asking', async () => {
            await toSummary({ '/api/app-store/me/openstack-credentials': [CRED, { ...CRED, credentialId: 'cred-2', last_validation_error: 'auth_failed' }] });
            await waitFor(() => expect(screen.getByRole('button', { name: 'Deploy' }).disabled).toBe(false));
        });

        it('sends the credential, and makes the lecturer choose between several', async () => {
            const { sent } = await open({
                '/api/app-store/apps/ubuntu/runtime': VM,
                '/api/app-store/me/openstack-credentials': [CRED, { ...CRED, credentialId: 'cred-2', project_name: 'other' }],
            });
            next(); next();
            await screen.findByText('This version needs no settings.');
            next();
            await screen.findByText('OpenStack project');
            expect(screen.getByRole('button', { name: 'Deploy' }).disabled).toBe(true);
            fireEvent.change(screen.getByRole('combobox', { name: 'Choose the project to deploy in' }), { target: { value: 'cred-2' } });
            await waitFor(() => expect(screen.getByRole('button', { name: 'Deploy' }).disabled).toBe(false));
            deploy();
            await waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0].credentialId).toBe('cred-2');
        });

        it('points to the credentials page, and back to the wizard, when there is none', async () => {
            await toSummary();
            const link = await screen.findByRole('link', { name: 'Add credentials' });
            expect(link.getAttribute('href')).toBe('/credentials?next=%2Fapps%2Fubuntu%2Fdeploy');
            expect(screen.getByRole('button', { name: 'Deploy' }).disabled).toBe(true);
        });
    });

    it('says why a deployment could not be created', async () => {
        const refusal = () => json({ detail: { reason: 'openstack_credentials_missing' } }, 412);
        await open({}, refusal);
        next(); next();
        await screen.findByText('This version needs no settings.');
        next();
        await screen.findByText('Only you');
        deploy();
        expect(await screen.findByText('An OpenStack credential is needed for this app. Please add one first.')).toBeTruthy();
        expect(window.location.pathname).toBe('/apps/ubuntu/deploy');
    });

    it('sends a student back to the app instead of showing a wizard the backend would refuse', async () => {
        vi.stubGlobal('fetch', backend({ '/api/app-store/users/me': { role: 'student' } }).fetch);
        renderView(<Wizard params={{ id: 'ubuntu' }} />);
        await waitFor(() => expect(window.location.pathname).toBe('/apps/ubuntu'));
        expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    });

    it('offers nothing to deploy when the app has no deployable version', async () => {
        await open({ '/api/app-store/apps/ubuntu': { ...APP, versions: [] } }).catch(() => {});
        expect(await screen.findByText('No deployable version is available for this app.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
    });
});
