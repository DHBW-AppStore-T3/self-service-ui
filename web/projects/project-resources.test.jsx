// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
import { ProjectResources, syncErrorText } from './component-project-resources.jsx';

// A measured project shows what it uses of what it holds, and for each
// availability whether anything uses it — including one used without being
// granted, the state in which the reconciler tries to take it away.

const resources = [
    { id: 'cores', name: 'Cores' },
    { id: 'ipv4', name: 'IPv4', kind: 'bool', grant_type: 'network' },
    { id: 'gpu', name: 'GPU', kind: 'bool', grant_type: 'flavor' },
    { id: 'img', name: 'Image', kind: 'bool', grant_type: 'image' },
];

function renderIt(node, quota) {
    return render(
        <MantineProvider>
            <ProjectResources node={node} resources={resources} quota={quota} />
        </MantineProvider>,
    );
}

describe('ProjectResources', () => {
    afterEach(cleanup);

    it('draws a bar per quantity and the VMs, and counts what uses an availability', () => {
        const { container } = renderIt(
            { bindings: { openstack: { in_use: { cores: 12 }, facts: { servers: 2, server_limit: 25 }, grant_use: { ipv4: 2, gpu: 0, img: 1 } } } },
            { cores: 25, ipv4: 1, gpu: 1, img: 0 },
        );
        expect(container.querySelectorAll('[role="progressbar"]').length).toBe(2);
        expect(screen.getByText('12 / 25')).toBeTruthy();
        expect(screen.getByText('IPv4 · 2')).toBeTruthy();
        expect(screen.getByText('GPU')).toBeTruthy();
        // Not granted, but in use: shown, so it is not missed.
        expect(screen.getByText('Image · 1')).toBeTruthy();
    });

    it('is the plain summary before the first measurement', () => {
        const { container } = renderIt({}, { cores: 4, ipv4: 1 });
        expect(container.querySelectorAll('[role="progressbar"]').length).toBe(0);
    });

    // Incident 19.10.2026: the network was refused with OverQuota on every sync while the card read as granted.
    it('says in red what OpenStack refused, measured or not', () => {
        const errors = { ipv4: { kind: 'availability', reason: 'over_quota', detail: 'HTTP 409 OverQuota', since: '2026-10-19T08:00:00Z' } };
        renderIt({ bindings: { openstack: { in_use: { cores: 1 }, grant_use: { ipv4: 0 }, sync_errors: errors } } }, { cores: 4, ipv4: 1 });
        expect(screen.getByText(/^IPv4:/)).toBeTruthy();
        cleanup();
        renderIt({ bindings: { openstack: { sync_errors: errors } } }, { cores: 4, ipv4: 1 });
        expect(screen.getByText(/^IPv4:/)).toBeTruthy();
        // The cloud's own message is the admins', not on the card.
        expect(screen.queryByText(/HTTP 409/)).toBeNull();
    });
});

describe('syncErrorText', () => {
    const t = (key, opts) => (opts?.reason ? `${key}(${opts.reason})` : key);
    it('names the quota of network shares for a network, and falls back to the reason otherwise', () => {
        expect(syncErrorText(t, { grant_type: 'network' }, { kind: 'availability', reason: 'over_quota' }))
            .toBe('projects.resources.syncFailed(projects.resources.syncReason.over_quota_network)');
        expect(syncErrorText(t, { grant_type: 'flavor' }, { kind: 'availability', reason: 'over_quota' }))
            .toBe('projects.resources.syncFailed(projects.resources.syncReason.over_quota)');
        expect(syncErrorText(t, { id: 'cores' }, { kind: 'quota', reason: 'forbidden' }))
            .toBe('projects.resources.syncFailed(projects.resources.syncReason.forbidden)');
        expect(syncErrorText(t, { id: 'cores' }, null)).toBeNull();
    });
});
