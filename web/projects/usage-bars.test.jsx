// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
// The figures speak through i18next; the assertions below are its English values.
import '/i18n/index.js';
import { NodeUsageBars } from './component-common.jsx';

// A progress track needs a quantity to be a fraction OF, and an availability has
// none: a granted network is not "1 of 1 used", it is simply there. Drawn as a
// bar it reads as a full budget about to run out.

const resources = [
    { id: 'cores', name: 'Cores' },
    { id: 'gpu-hours', name: 'GPU hours' },
    { id: 'gpus', name: 'GPUs' },
    { id: 'dhbw-ipv4', name: 'DHBW IPv4', kind: 'bool' },
    { id: 'gpu-rtx6000', name: 'RTX 6000', kind: 'bool' },
];

function renderBars(node) {
    return render(
        <MantineProvider>
            <NodeUsageBars resources={resources} node={node} />
        </MantineProvider>,
    );
}

describe('NodeUsageBars', () => {
    afterEach(cleanup);

    it('draws a bar for the quantity and none for the availabilities', () => {
        const { container } = renderBars({
            limit: { cores: 8, 'dhbw-ipv4': 1, 'gpu-rtx6000': 1 },
            usage: { approved: { limit: { cores: 4 } } },
        });

        // Mantine's Progress renders a progressbar role per bar.
        expect(container.querySelectorAll('[role="progressbar"]').length).toBe(1);
    });

    it('names the granted availabilities', () => {
        renderBars({
            limit: { cores: 8, 'dhbw-ipv4': 1, 'gpu-rtx6000': 1 },
            usage: {},
        });

        expect(screen.getByText('DHBW IPv4')).toBeTruthy();
        expect(screen.getByText('RTX 6000')).toBeTruthy();
    });

    // A row of greyed-out badges for everything withheld says nothing and grows
    // with the catalogue.
    it('says nothing about the ones that were withheld', () => {
        renderBars({
            limit: { cores: 8, 'dhbw-ipv4': 1, 'gpu-rtx6000': 0 },
            usage: {},
        });

        expect(screen.getByText('DHBW IPv4')).toBeTruthy();
        expect(screen.queryByText('RTX 6000')).toBeNull();
    });

    // Handed out is not used: the figures say both, and a budget whose projects hold everything but use nothing is full, not short.
    it('shows what is allocated and what of it is used', () => {
        renderBars({
            limit: { cores: 400, 'gpu-hours': 200, gpus: 1 },
            usage: { approved: { limit: { cores: 10, 'gpu-hours': 20, gpus: 1 } } },
            subtree_in_use: { cores: 0, 'gpu-hours': 0, gpus: 0 },
        });

        expect(screen.getByText('10 / 400 allocated · 0 used')).toBeTruthy();
        expect(screen.getByText('20 / 200 allocated · 0 used')).toBeTruthy();
        expect(screen.getByText('1 / 1 allocated · 0 used')).toBeTruthy();
        expect(screen.getByText('Fully allocated')).toBeTruthy();
        expect(screen.queryByText('Fully used')).toBeNull();
    });

    it('goes red only when consumption reaches the limit', () => {
        const { container } = renderBars({
            limit: { gpus: 1 },
            usage: { approved: { limit: { gpus: 1 } } },
            subtree_in_use: { gpus: 1 },
        });

        expect(screen.getByText('1 / 1 allocated · 1 used')).toBeTruthy();
        expect(screen.getByText('Fully used')).toBeTruthy();
        expect(container.querySelector('[data-state="exhausted"]')).toBeTruthy();
    });

    // A missing key means nothing measures the resource, not that nothing is used.
    it('says nothing about use where nothing is measured', () => {
        renderBars({
            limit: { cores: 8 },
            usage: { approved: { limit: { cores: 4 } } },
        });

        expect(screen.getByText('4 / 8 allocated')).toBeTruthy();
        expect(screen.queryByText(/used/)).toBeNull();
    });
});
