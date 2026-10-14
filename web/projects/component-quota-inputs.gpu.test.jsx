import { describe, expect, it } from 'vitest';
import { gpuClassRows, quotaSections, shortName } from './component-quota-inputs.jsx';

describe('gpuClassRows', () => {
    it('pairs the two resources of each GPU class under its name', () => {
        const rows = gpuClassRows([
            { id: 'ws-gpu-hours-allgemein-mittel', name: 'Allgemein · mittel: GPU hours', window: '30d' },
            { id: 'ws-gpus-allgemein-klein', name: 'Allgemein · klein: GPUs at the same time' },
            { id: 'ws-gpus-allgemein-mittel', name: 'Allgemein · mittel: GPUs at the same time' },
        ]);
        expect(rows.map(r => r.name)).toEqual(['Allgemein · klein', 'Allgemein · mittel']);
        expect(rows[1].gpus.id).toBe('ws-gpus-allgemein-mittel');
        expect(rows[1].hours.id).toBe('ws-gpu-hours-allgemein-mittel');
        expect(rows[0].hours).toBeUndefined();
    });
    it('leaves other groups alone', () => {
        expect(gpuClassRows([{ id: 'ws-vcpu-hours' }])).toBeNull();
    });
});

describe('quotaSections', () => {
    it('puts Workspaces CPU and GPU into one section and keeps LLM apart', () => {
        const sections = quotaSections([
            ['Workspaces', [{ id: 'ws-vcpu-hours', group: 'Workspaces' }]],
            ['LLM', [{ id: 'llm-mtokens', group: 'LLM' }]],
            ['Workspaces GPU', [{ id: 'ws-gpus-allgemein-klein', group: 'Workspaces GPU' }]],
            ['Compute', [{ id: 'cores', group: 'Compute' }]],
        ]);
        expect(sections.map(s => s.title)).toEqual(['Workspaces', 'LLM', 'Compute']);
        expect(sections[0].parts.map(p => p.subtitle)).toEqual(['CPU', 'GPU']);
        expect(sections[1].parts[0].short).toBe(true);
        expect(sections[2].parts[0].short).toBe(false);
    });
    it('shortens names under their heading', () => {
        expect(shortName('Workspace CPU')).toBe('CPU');
        expect(shortName('LLM tokens per minute')).toBe('Tokens per minute');
        expect(shortName('LLM: every model directly')).toBe('Every model directly');
        expect(shortName('Workspace storage')).toBe('Storage');
    });
});
