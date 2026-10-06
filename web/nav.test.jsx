// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// useNav asks these two providers questions unrelated to the App-Store entry —
// stubbed here the same way views.render.test.jsx stubs cloud-status, so this
// file only exercises the App-Store nav item's own on/off logic.
vi.mock('/projects/cloud-status.jsx', () => ({
    useCloudStatus: () => ({ isRoot: false, pending: 0, hasBudgets: false, ready: true, refresh: () => {} }),
}));
vi.mock('/dyndns/use-policy.jsx', () => ({
    useDnsPolicyStatus: () => ({ hasPolicy: false }),
}));
vi.mock('wouter', () => ({
    useLocation: () => ['/'],
}));

// features.js reads window.appconfig at import time, so appconfig has to be in
// place before the import and the module registry reset between cases —
// same pattern as web/tokens/mcp-config.test.jsx.
async function navWith(appconfig) {
    vi.resetModules();
    window.appconfig = appconfig;
    const { useNav } = await import('./nav.jsx');
    return renderHook(() => useNav()).result.current;
}

describe('the App-Store nav entry', () => {
    beforeEach(() => { delete window.appconfig; });

    it('hides App-Store nav entry when appstoreBaseUrl is unset', async () => {
        const { sections } = await navWith({});

        expect(sections.find((s) => s.id === 'app-store')).toBeUndefined();
    });

    it('shows App-Store nav entry when appstoreBaseUrl is set', async () => {
        const { sections } = await navWith({ appstoreBaseUrl: 'https://appstore.example.com' });

        const section = sections.find((s) => s.id === 'app-store');
        expect(section).toBeTruthy();
        expect(section.href).toBe('https://appstore.example.com');
        expect(section.external).toBe(true);
    });

    // external sections open in a popup via the SSO handoff, not a route in
    // this SPA — the URL-based active-section match must never claim them.
    it('never marks the external App-Store entry as the active section', async () => {
        const { activeSection } = await navWith({ appstoreBaseUrl: 'https://appstore.example.com' });

        expect(activeSection?.id).not.toBe('app-store');
    });
});
