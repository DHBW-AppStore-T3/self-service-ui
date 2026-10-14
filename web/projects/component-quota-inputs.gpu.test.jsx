import { describe, expect, it } from 'vitest';
import { gpuPools, quotaSections, shortName } from './component-quota-inputs.jsx';

describe('gpuPools', () => {
    it('pairs the two resources of each GPU class and arranges the classes by pool, tiers in order', () => {
        const pools = gpuPools([
            { id: 'ws-gpu-hours-forschung-gross', name: 'Forschung · groß: GPU hours', gpu_class: { pool: 'forschung', pool_name: 'Forschung', tier: 'gross', tier_name: 'groß', products: 'NVIDIA-H100', lends: true } },
            { id: 'ws-gpu-hours-allgemein-mittel', name: 'Allgemein · mittel: GPU hours', gpu_class: { pool: 'allgemein', pool_name: 'Allgemein', tier: 'mittel', tier_name: 'mittel', products: 'NVIDIA-L40S-12Q' } },
            { id: 'ws-gpus-allgemein-mittel', name: 'Allgemein · mittel: GPUs at the same time', gpu_class: { pool: 'allgemein', pool_name: 'Allgemein', tier: 'mittel', tier_name: 'mittel', products: 'NVIDIA-L40S-12Q' } },
            { id: 'ws-gpus-allgemein-klein', name: 'Allgemein · klein: GPUs at the same time', gpu_class: { pool: 'allgemein', pool_name: 'Allgemein', tier: 'klein', tier_name: 'klein', products: 'NVIDIA-L4-3Q' } },
        ]);
        expect(pools.map(p => p.name)).toEqual(['Allgemein', 'Forschung']);
        expect(pools[0].rows.map(r => r.name)).toEqual(['klein', 'mittel']);
        expect(pools[0].rows[1].gpus.id).toBe('ws-gpus-allgemein-mittel');
        expect(pools[0].rows[1].hours.id).toBe('ws-gpu-hours-allgemein-mittel');
        expect(pools[0].rows[0].hours).toBeUndefined();
        expect(pools[1].products).toBe('H100');
        expect(pools[1].lends).toBe(true);
    });
    it('reads pool and tier from the name without class info', () => {
        const pools = gpuPools([{ id: 'ws-gpus-allgemein-klein', name: 'Allgemein · klein: GPUs at the same time' }]);
        expect(pools[0].name).toBe('Allgemein');
        expect(pools[0].rows[0].name).toBe('klein');
    });
    it('leaves other groups alone', () => {
        expect(gpuPools([{ id: 'ws-vcpu-hours' }])).toBeNull();
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
