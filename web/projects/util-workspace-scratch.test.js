import { describe, expect, it } from 'vitest';
import { effectiveScratch, MAX_WORKSPACE_SCRATCH_GB, normalizeScratch, scratchErrors, scratchSummary } from './util-workspace-scratch.js';

const t = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

describe('local storage per workspace', () => {
    it('normalizes to a number or null', () => {
        expect(normalizeScratch('')).toBeNull();
        expect(normalizeScratch(undefined)).toBeNull();
        expect(normalizeScratch('5')).toBe(5);
    });

    it('applies the smaller of own and inherited', () => {
        expect(effectiveScratch({})).toBeNull();
        expect(effectiveScratch({ workspace_scratch_gb: 10 })).toBe(10);
        expect(effectiveScratch({ inherited_workspace_scratch_gb: 4 })).toBe(4);
        expect(effectiveScratch({ workspace_scratch_gb: 10, inherited_workspace_scratch_gb: 4 })).toBe(4);
    });

    it('checks like the server: bounds, only lower than above', () => {
        expect(scratchErrors(t, null, 4)).toEqual({});
        expect(scratchErrors(t, 4, 4)).toEqual({});
        expect(scratchErrors(t, 0, null).workspaceScratchGb).toContain('errRange');
        expect(scratchErrors(t, MAX_WORKSPACE_SCRATCH_GB + 1, null).workspaceScratchGb).toContain('errRange');
        expect(scratchErrors(t, 5, 4).workspaceScratchGb).toContain('errAbove');
    });

    it('summarizes for the history', () => {
        expect(scratchSummary(t, null)).toBe('projects.workspaceScratch.none');
        expect(scratchSummary(t, 5)).toContain('"value":5');
    });
});
