import { describe, expect, it } from 'vitest';
import { effectiveRelease, isEmptyRelease, normalizeRelease, releaseErrors, releaseSummary, sameRelease, stricterRelease, unlimitedAllowed } from './util-release-max.js';

const t = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

describe('release maximums', () => {
    it('normalizes to both kinds with only the set values', () => {
        expect(normalizeRelease({ gpu: { max_hours: 4, idle_open_minutes: null, idle_closed_minutes: '' } })).toEqual({ cpu: {}, gpu: { max_hours: 4 } });
        expect(isEmptyRelease({ cpu: { idle_open_minutes: null } })).toBe(true);
        expect(sameRelease(null, { cpu: {}, gpu: {} })).toBe(true);
        expect(sameRelease({ gpu: { max_hours: 0 } }, null)).toBe(false);
    });

    it('takes the stricter value per field, an upper bound over none', () => {
        const own = { cpu: { idle_open_minutes: 60, max_hours: 24 }, gpu: { max_hours: 0 } };
        const above = { cpu: { idle_open_minutes: 120, idle_closed_minutes: 120, max_hours: 12 }, gpu: { max_hours: 4, idle_closed_minutes: 5 } };
        expect(stricterRelease(own, above)).toEqual({ cpu: { idle_open_minutes: 60, idle_closed_minutes: 120, max_hours: 12 }, gpu: { idle_closed_minutes: 5, max_hours: 4 } });
        expect(effectiveRelease({ release_max: own })).toEqual({ cpu: { idle_open_minutes: 60, max_hours: 24 }, gpu: { max_hours: 0 } });
        expect(stricterRelease(null, null)).toBeNull();
    });

    it('allows no upper bound only for GPU and only where nothing above has one', () => {
        expect(unlimitedAllowed('gpu', null)).toBe(true);
        expect(unlimitedAllowed('gpu', { gpu: { max_hours: 0 } })).toBe(true);
        expect(unlimitedAllowed('gpu', { gpu: { max_hours: 4 } })).toBe(false);
        expect(unlimitedAllowed('cpu', null)).toBe(false);
    });

    it('checks like the server: bounds, only tighter than above', () => {
        const above = { cpu: { idle_open_minutes: 120, max_hours: 12 }, gpu: { max_hours: 4 } };
        expect(releaseErrors(t, { cpu: { idle_open_minutes: 60, max_hours: 12 }, gpu: { max_hours: 2 } }, above)).toEqual({});
        const errs = releaseErrors(t, { cpu: { idle_open_minutes: 121, idle_closed_minutes: 0, max_hours: 0 }, gpu: { max_hours: 0, idle_open_minutes: 2000 } }, above);
        expect(Object.keys(errs).sort()).toEqual(['releaseMax.cpu.idle_closed_minutes', 'releaseMax.cpu.idle_open_minutes', 'releaseMax.cpu.max_hours', 'releaseMax.gpu.idle_open_minutes', 'releaseMax.gpu.max_hours']);
        expect(errs['releaseMax.cpu.idle_open_minutes']).toContain('errAbove');
        expect(releaseErrors(t, { gpu: { max_hours: 0 } }, null)).toEqual({});
        expect(releaseErrors(t, { gpu: { max_hours: 721 } }, null)['releaseMax.gpu.max_hours']).toContain('errHours');
    });

    it('summarizes for the history', () => {
        expect(releaseSummary(t, null)).toBe('projects.releaseMax.none');
        expect(releaseSummary(t, { gpu: { idle_open_minutes: 30, max_hours: 0 } })).toContain('"kind":"GPU","open":"30","closed":"–","hours":"projects.releaseMax.unlimited"');
    });
});
