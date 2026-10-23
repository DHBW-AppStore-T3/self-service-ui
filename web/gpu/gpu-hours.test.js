// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { peopleOf, summaryOf } from './gpu-hours.jsx';

describe('GPU hours', () => {
    const hours = [
        { hour: '2026-10-13T16:00:00Z', gpu_class: 'l4-3q', sampled_hours: 1, capacity: 1, workspace_hours: 0.5, inference_hours: 0.5, wait_hours: 0.25, max_waiting: 1 },
        { hour: '2026-10-13T17:00:00Z', gpu_class: 'l4-3q', sampled_hours: 1, capacity: 1, workspace_hours: 1, inference_hours: 0, wait_hours: 0, max_waiting: 0 },
    ];
    it('sums a class over the period', () => {
        const s = summaryOf(hours);
        expect(s.workspace / s.capacity).toBe(0.75);
        expect(s.inference / s.capacity).toBe(0.25);
        expect(s.maxWaiting).toBe(1);
        expect(s.peak.hour).toBe('2026-10-13T17:00:00Z');
    });
    it('sums people, busiest first', () => {
        const p = peopleOf([
            { person: 'a', project: 'x', gpu_hours: 0.5, wait_hours: 0 },
            { person: 'b', project: 'x', gpu_hours: 0, wait_hours: 0.25 },
            { person: 'a', project: 'x', gpu_hours: 1, wait_hours: 0 },
        ]);
        expect(p.map(r => r.person)).toEqual(['a', 'b']);
        expect(p[0].gpu_hours).toBe(1.5);
        expect(p[0].hours).toBe(2);
    });
});
