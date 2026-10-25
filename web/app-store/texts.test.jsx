// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
vi.hoisted(() => { window.appconfig = { appStoreEnabled: true }; });

import { Help } from './help.jsx';
import { useGreetingName } from './queries.jsx';

function json(body) {
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function Greeting() {
    return <output data-testid="name">{String(useGreetingName())}</output>;
}

describe('greeting name', () => {
    beforeEach(() => {
        window.appconfig = { appStoreEnabled: true, appStoreBaseUrl: '/api/app-store' };
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('is the first name', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ role: 'teacher', firstName: 'Dozentin', username: 'dozent.demo' })));
        renderView(<Greeting />);
        await vi.waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Dozentin'));
    });

    it('is the username when there is no first name', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ role: 'teacher', firstName: null, username: 'dozent.demo' })));
        renderView(<Greeting />);
        await vi.waitFor(() => expect(screen.getByTestId('name').textContent).toBe('dozent.demo'));
    });

    it('is nothing while the App Store does not answer', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
        renderView(<Greeting />);
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(screen.getByTestId('name').textContent).toBe('null');
    });
});

describe('help page', () => {
    afterEach(cleanup);

    it('gives the steps and the usual problems, briefly', () => {
        renderView(<Help />);
        expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeTruthy();
        const [steps, problems] = screen.getAllByRole('list');
        expect(within(steps).getAllByRole('listitem')).toHaveLength(5);
        expect(within(problems).getAllByRole('listitem')).toHaveLength(3);
    });

    it('uses no red: that colour is for errors', () => {
        renderView(<Help />);
        expect(document.body.innerHTML).not.toMatch(/mantine-color-red|data-color="red"/);
    });
});
