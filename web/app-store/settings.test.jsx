// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
vi.hoisted(() => { window.appconfig = { appStoreEnabled: true }; });

import { Settings } from './settings.jsx';
import { useRole } from './queries.jsx';

// The admin view: a browser-side switch that lets an admin experience the App
// Store like a lecturer. Whether it is on decides what the later views offer;
// these tests pin the rule itself and the page that flips it.

const STORAGE_KEY = 'appstore.adminView';

function backend(role) {
    return vi.fn(async url => {
        const path = new URL(url, 'http://localhost').pathname;
        if (path !== '/api/app-store/users/me') return new Response('', { status: 404 });
        return new Response(JSON.stringify({ role }), { headers: { 'content-type': 'application/json' } });
    });
}

const userOf = email => ({ profile: { email }, access_token: 't' });

// Prints what useRole answers, so a test can read it from the DOM.
function RoleProbe() {
    const role = useRole();
    return <output data-testid="role">{JSON.stringify(role)}</output>;
}

async function roleOf(role, email = 'admin@dhbw.de') {
    vi.stubGlobal('fetch', backend(role));
    renderView(<RoleProbe />, { user: userOf(email) });
    await vi.waitFor(() => expect(JSON.parse(screen.getByTestId('role').textContent).loaded).toBe(true));
    return JSON.parse(screen.getByTestId('role').textContent);
}

describe('admin view', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.appconfig = { appStoreEnabled: true, appStoreBaseUrl: '/api/app-store' };
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('is off for an admin until they switch it on', async () => {
        const role = await roleOf('admin');
        expect(role).toMatchObject({ admin: true, staff: true, isAdminView: false });
    });

    it('is on for an admin whose account has the switch stored', async () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'admin@dhbw.de': true }));
        const role = await roleOf('admin');
        expect(role.isAdminView).toBe(true);
    });

    it('keeps the switch per account', async () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'other@dhbw.de': true }));
        const role = await roleOf('admin', 'admin@dhbw.de');
        expect(role.isAdminView).toBe(false);
    });

    it('never applies to a teacher, whatever is stored', async () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'teacher@dhbw.de': true }));
        const role = await roleOf('teacher', 'teacher@dhbw.de');
        expect(role).toMatchObject({ admin: false, staff: true, isAdminView: false });
    });

    it('survives a stored value that is not the expected shape', async () => {
        window.localStorage.setItem(STORAGE_KEY, 'not json');
        const role = await roleOf('admin');
        expect(role.isAdminView).toBe(false);
    });
});

describe('settings page', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.appconfig = { appStoreEnabled: true, appStoreBaseUrl: '/api/app-store' };
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('lets an admin switch the admin view on and remembers it per account', async () => {
        vi.stubGlobal('fetch', backend('admin'));
        const first = renderView(<Settings />, { user: userOf('admin@dhbw.de') });
        const toggle = await screen.findByRole('switch', { name: /^Admin view/ });
        expect(toggle.checked).toBe(false);
        fireEvent.click(toggle);
        expect(toggle.checked).toBe(true);
        expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({ 'admin@dhbw.de': true });

        // A reload: a new tree reads the same storage.
        first.unmount();
        renderView(<Settings />, { user: userOf('admin@dhbw.de') });
        expect((await screen.findByRole('switch', { name: /^Admin view/ })).checked).toBe(true);
    });

    it('switches it off again and drops the stored flag', async () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'admin@dhbw.de': true, 'other@dhbw.de': true }));
        vi.stubGlobal('fetch', backend('admin'));
        renderView(<Settings />, { user: userOf('admin@dhbw.de') });
        const toggle = await screen.findByRole('switch', { name: /^Admin view/ });
        fireEvent.click(toggle);
        expect(toggle.checked).toBe(false);
        expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({ 'other@dhbw.de': true });
    });

    it.each(['teacher', 'student'])('does not show a %s the switch', async role => {
        vi.stubGlobal('fetch', backend(role));
        renderView(<Settings />, { user: userOf('someone@dhbw.de') });
        await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(screen.queryByRole('switch')).toBeNull();
    });
});
