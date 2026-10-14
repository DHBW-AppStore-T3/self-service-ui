// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { envsOf, startLink } from '/gpu/start.jsx';

const profiles = [{ slug: 'cpu' }, { slug: 'cpu-gpukernel', gpu: true }, { slug: 'gpu', gpu: true }];

describe('start page', () => {
    it('offers the profiles of the project, the split one only on our bases', () => {
        expect(envsOf({ profiles: ['gpu', 'cpu', 'cpu-gpukernel'], image_derived: true }, profiles).map(p => p.slug)).toEqual(['cpu', 'cpu-gpukernel', 'gpu']);
        expect(envsOf({ profiles: ['cpu', 'cpu-gpukernel'], image_derived: false }, profiles).map(p => p.slug)).toEqual(['cpu']);
        expect(envsOf(undefined, profiles)).toEqual([]);
    });
    it('puts the choice into the link and drops what was there', () => {
        expect(startLink('https://ui/workspaces/servers/start?project=old', { project: 'ml', env: 'gpu', gpuClass: 'general-medium' }))
            .toBe('https://ui/workspaces/servers/start?project=ml&env=gpu&gpu_class=general-medium');
        expect(startLink('https://ui/workspaces/servers/start', { project: 'ml', env: 'cpu', gpuClass: '' })).toBe('https://ui/workspaces/servers/start?project=ml&env=cpu');
    });
});
