// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';

vi.mock('/nav.jsx', () => ({
    HEADER_HEIGHT: 60,
    NAV_BREAKPOINT: 'md',
    SUBNAV_HEIGHT: 40,
    useNav: () => ({
        sections: [{
            id: 'app-store',
            label: 'DHBW App-Store',
            href: 'https://appstore.example.com',
            external: true,
            items: [],
        }],
        activeSection: null,
        activeItem: null,
        subNavItems: [],
    }),
}));
vi.mock('/providers/auth.jsx', () => ({
    useAuth: () => ({ user: { profile: { email: 'student@dhbw.de', name: 'student@dhbw.de' } }, login: () => {}, logout: () => {}, useDummyAuth: true }),
}));
vi.mock('/providers/confirm.jsx', () => ({
    useConfirm: () => async () => true,
}));
vi.mock('/projects/component-group-role-switcher.jsx', () => ({
    RoleSwitchButton: () => null,
}));

const { Header } = await import('./header.jsx');

// The desktop button and the burger's button both call the same function —
// exercised here through the desktop one, which is what renders at the
// default (wide) jsdom viewport.
const renderHeader = () => render(
    <MantineProvider>
        <Header />
    </MantineProvider>,
);

describe('openWithSso (App-Store nav entry)', () => {
    let originalOpen;
    let popup;

    beforeEach(() => {
        originalOpen = window.open;
        popup = { location: '', close: vi.fn() };
        window.open = vi.fn(() => popup);
    });

    afterEach(() => {
        window.open = originalOpen;
        vi.restoreAllMocks();
        cleanup();
    });

    it('mints handoff token and opens popup with it', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ email: 'student@dhbw.de', handoff_token: 'tok123' }),
        });

        renderHeader();
        fireEvent.click(screen.getByText('DHBW App-Store'));

        // The popup opens synchronously, before the mint call resolves — this
        // is what keeps browsers from treating it as a blocked popup.
        expect(window.open).toHaveBeenCalledWith('', 'dhbw-app-store');

        await waitFor(() => expect(popup.location).toContain('handoff_token=tok123'));
        expect(popup.location).toContain('handoff=1');
        expect(popup.location).toContain('email=student%40dhbw.de');
        expect(fetch).toHaveBeenCalledWith('/api/appstore/handoff/mint', {
            method: 'POST',
            credentials: 'include',
        });
    });

    it('closes popup and logs error when mint fails', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        renderHeader();
        fireEvent.click(screen.getByText('DHBW App-Store'));

        await waitFor(() => expect(popup.close).toHaveBeenCalled());
        expect(popup.location).toBe('');
        expect(consoleError).toHaveBeenCalledWith('SSO handoff to App-Store failed:', expect.any(Error));
    });
});
