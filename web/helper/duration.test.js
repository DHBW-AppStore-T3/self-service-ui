import { describe, expect, it } from 'vitest';
import { formatDuration } from '/helper/duration.js';

const min = 60000;

describe('formatDuration', () => {
    it('says hours and minutes, only what is there', () => {
        expect(formatDuration(190 * min, 'en')).toMatch(/3\s*hr.*10\s*min/);
        expect(formatDuration(120 * min, 'en')).toMatch(/^2\s*hr$/);
        expect(formatDuration(30 * min, 'en')).toMatch(/^30\s*min$/);
        expect(formatDuration(190 * min, 'de')).toMatch(/3\s*Std.*10\s*Min/);
    });
    it('says less than a minute, and never a negative span', () => {
        expect(formatDuration(20 * 1000, 'de')).toBe('< 1 Min.');
        expect(formatDuration(-5 * min, 'en')).toBe('< 1 min');
    });
});
