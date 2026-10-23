// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatSize, scanState } from '/gpu/image-facts.jsx';

describe('image facts', () => {
    it('writes the size in the reader language, nothing when unknown', () => {
        expect(formatSize(2_000_000_000, 'de')).toBe('2,0 GB');
        expect(formatSize(7_260_000_000, 'en')).toBe('7.3 GB');
        expect(formatSize(160_400_000, 'de')).toBe('160 MB');
        expect(formatSize(3_600_000, 'en')).toBe('4 MB');
        expect(formatSize(1000, 'de')).toBe('1 MB');
        expect(formatSize(0)).toBe('');
        expect(formatSize(undefined)).toBe('');
    });
    it('colours a finished scan by its worst severity', () => {
        expect(scanState({ status: 'Success', critical: 1, high: 0 })).toEqual({ kind: 'done', critical: 1, high: 0, color: 'red' });
        expect(scanState({ status: 'Success', high: 3 }).color).toBe('orange');
        expect(scanState({ status: 'Success' }).color).toBe('teal');
    });
    it('tells a running or failed scan apart, and none', () => {
        expect(scanState({ status: 'Running' }).kind).toBe('running');
        expect(scanState({ status: 'Pending' }).kind).toBe('running');
        expect(scanState({ status: 'Error' }).kind).toBe('failed');
        expect(scanState(null)).toBeNull();
        expect(scanState({})).toBeNull();
    });
});
