// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
vi.hoisted(() => { window.appconfig = { appStoreEnabled: true }; });

import { Credentials } from './credentials.jsx';

// The page where a lecturer hands over their OpenStack access: a clouds.yaml
// is uploaded and checked against Keystone by the backend, which stores it.

const VALID = { credentialId: 'c1', auth_type: 'v3applicationcredential', auth_url: 'https://os.example:5000/v3', project_id: 'p1', project_name: 'course-project', project_verified: true, last_validation_error: null, active_deployments: 0 };
const UNVERIFIED = { ...VALID, credentialId: 'c2', project_name: null, project_id: 'p2', project_verified: false };

const ONE_CLOUD = 'clouds:\n  openstack:\n    auth:\n      auth_url: https://os.example:5000/v3\n';
const TWO_CLOUDS = 'clouds:\n  dhbw:\n    auth: {}\n  other:\n    auth: {}\n';

function json(body, status = 200) {
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// A backend with a mutable list of credentials; writes are recorded in `sent`.
function backend({ credentials = [], onPost } = {}) {
    const sent = [];
    const fetch = vi.fn(async (url, init = {}) => {
        const path = new URL(url, 'http://localhost').pathname;
        const method = init.method ?? 'GET';
        if (path === '/api/app-store/users/me') return json({ role: 'teacher' });
        if (path === '/api/app-store/me/openstack-credentials' && method === 'GET') return json(credentials);
        sent.push({ method, path, body: init.body ? JSON.parse(init.body) : undefined });
        if (method === 'POST' && path.endsWith('/from-yaml')) return onPost ? onPost() : json({ ...VALID, credentialId: 'new' }, 201);
        if (method === 'DELETE') return json(null, 204);
        if (method === 'POST') return json(VALID);
        return json({}, 404);
    });
    return { fetch, sent };
}

function fileOf(text, name = 'clouds.yaml') {
    return new File([text], name, { type: 'application/x-yaml' });
}

function upload(file) {
    const input = document.querySelector('input[type=file]');
    fireEvent.change(input, { target: { files: [file] } });
}

describe('OpenStack credentials page', () => {
    beforeEach(() => {
        window.appconfig = { appStoreEnabled: true, appStoreBaseUrl: '/api/app-store' };
        window.history.replaceState({}, '', '/credentials');
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('says when nothing is stored yet', async () => {
        vi.stubGlobal('fetch', backend().fetch);
        renderView(<Credentials />);
        expect(await screen.findByText('No credentials stored yet')).toBeTruthy();
    });

    it('lists what is stored, with the state of each', async () => {
        vi.stubGlobal('fetch', backend({ credentials: [VALID, UNVERIFIED] }).fetch);
        renderView(<Credentials />);
        expect(await screen.findByText('Project course-project')).toBeTruthy();
        expect(screen.getByText('Valid')).toBeTruthy();
        expect(screen.getByText('Not yet verified')).toBeTruthy();
        expect(screen.getByText('Project p2')).toBeTruthy();
    });

    it('saves an uploaded clouds.yaml at once when nothing is stored yet', async () => {
        const { fetch, sent } = backend();
        vi.stubGlobal('fetch', fetch);
        renderView(<Credentials />);
        await screen.findByText('No credentials stored yet');
        upload(fileOf(ONE_CLOUD));
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).toEqual({ method: 'POST', path: '/api/app-store/me/openstack-credentials/from-yaml', body: { clouds_yaml: ONE_CLOUD } });
        expect(await screen.findByText(/Credentials saved for project course-project/)).toBeTruthy();
    });

    it('waits for a click before replacing credentials that exist', async () => {
        const { fetch, sent } = backend({ credentials: [VALID] });
        vi.stubGlobal('fetch', fetch);
        renderView(<Credentials />);
        await screen.findByText('Project course-project');
        upload(fileOf(ONE_CLOUD));
        const save = await screen.findByRole('button', { name: 'Save and check' });
        expect(sent).toHaveLength(0);
        fireEvent.click(save);
        await vi.waitFor(() => expect(sent).toHaveLength(1));
    });

    it('saves pasted contents on request', async () => {
        const { fetch, sent } = backend({ credentials: [VALID] });
        vi.stubGlobal('fetch', fetch);
        renderView(<Credentials />);
        await screen.findByText('Project course-project');
        fireEvent.change(screen.getByLabelText('Or paste the contents'), { target: { value: ONE_CLOUD } });
        fireEvent.click(screen.getByRole('button', { name: 'Save and check' }));
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].body).toEqual({ clouds_yaml: ONE_CLOUD });
    });

    it('lets the person pick the cloud when the file has several', async () => {
        const { fetch, sent } = backend();
        vi.stubGlobal('fetch', fetch);
        renderView(<Credentials />);
        await screen.findByText('No credentials stored yet');
        upload(fileOf(TWO_CLOUDS));
        expect(await screen.findByText('This file contains several clouds. Which one should be used?')).toBeTruthy();
        expect(sent).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Save and check' }));
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].body).toEqual({ clouds_yaml: TWO_CLOUDS, cloud_name: 'dhbw' });
    });

    it('explains what OpenStack refused', async () => {
        const refusal = () => json({ detail: { reason: 'openstack_credentials_invalid', cause: 'auth_url_not_allowed' } }, 422);
        vi.stubGlobal('fetch', backend({ onPost: refusal }).fetch);
        renderView(<Credentials />);
        await screen.findByText('No credentials stored yet');
        upload(fileOf(ONE_CLOUD));
        expect(await screen.findByText(/OpenStack did not accept these credentials/)).toBeTruthy();
        expect(screen.getByText(/auth_url_not_allowed/)).toBeTruthy();
    });

    it('goes back to the app it came from once saved', async () => {
        window.history.replaceState({}, '', '/credentials?next=%2Fapps%2Fubuntu');
        vi.stubGlobal('fetch', backend().fetch);
        renderView(<Credentials />);
        await screen.findByText('No credentials stored yet');
        upload(fileOf(ONE_CLOUD));
        await vi.waitFor(() => expect(window.location.pathname).toBe('/apps/ubuntu'));
    });

    it('ignores a return address that is not an app page', async () => {
        window.history.replaceState({}, '', '/credentials?next=https%3A%2F%2Fevil.example');
        vi.stubGlobal('fetch', backend().fetch);
        renderView(<Credentials />);
        await screen.findByText('No credentials stored yet');
        upload(fileOf(ONE_CLOUD));
        await screen.findByText(/Credentials saved/);
        expect(window.location.pathname).toBe('/credentials');
    });

    it('deletes a credential after a confirmation', async () => {
        const { fetch, sent } = backend({ credentials: [VALID] });
        vi.stubGlobal('fetch', fetch);
        renderView(<Credentials />);
        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
        const dialog = await screen.findByRole('dialog');
        expect(sent).toHaveLength(0);
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
        await vi.waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/api/app-store/me/openstack-credentials/c1', body: undefined }]));
    });

    it('does not offer to delete a credential that deployments still use', async () => {
        vi.stubGlobal('fetch', backend({ credentials: [{ ...VALID, active_deployments: 2 }] }).fetch);
        renderView(<Credentials />);
        expect(await screen.findByText('2 active deployments in this project')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Delete' }).disabled).toBe(true);
    });
});
