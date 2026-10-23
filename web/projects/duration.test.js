// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import '/test/jsdom-stubs.js';
import i18n from '/i18n/index.js';
import { durationUnitFor, formatTerm } from './component-common.jsx';

const t = i18n.getFixedT('de');

describe('durationUnitFor', () => {
    it('prefers the unit a span divides into exactly', () => {
        expect(durationUnitFor(180)).toBe('months');
        expect(durationUnitFor(28)).toBe('weeks');
        expect(durationUnitFor(10)).toBe('days');
    });

    it('falls back to the fewest digits', () => {
        expect(durationUnitFor(45)).toBe('days');
        expect(durationUnitFor(100)).toBe('weeks');
        expect(durationUnitFor(400)).toBe('months');
    });
});

describe('formatTerm', () => {
    it('reads as people say it', () => {
        expect(formatTerm(t, 180)).toBe('6 Monate');
        expect(formatTerm(t, 30)).toBe('1 Monat');
        expect(formatTerm(t, 14)).toBe('2 Wochen');
        expect(formatTerm(t, 1)).toBe('1 Tag');
    });
});
