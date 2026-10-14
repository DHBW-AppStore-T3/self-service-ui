import { describe, expect, it } from 'vitest';
import { labDeletion } from './util-project.jsx';

const resources = [{ id: 'cores', provider: 'openstack', area: 'cloud' }, { id: 'ws-storage-gb', provider: 'aiaas', area: 'workspaces' }];
const retirement = { aiaasDeleteGraceDays: 14 };

describe('labDeletion', () => {
    it('is the day after the end plus the grace days, for Lab/AI projects only', () => {
        const node = { status: 'approved', termination_date: '2026-10-05', limit: { 'ws-storage-gb': 5 } };
        expect(labDeletion(node, resources, retirement)?.slice(0, 10)).toBe('2026-10-20');
        expect(labDeletion({ ...node, limit: { cores: 2 } }, resources, retirement)).toBeNull();
        expect(labDeletion(node, resources, { aiaasDeleteGraceDays: 0 })).toBeNull();
        expect(labDeletion({ ...node, termination_date: undefined }, resources, retirement)).toBeNull();
    });
    it('counts an earlier release as the end', () => {
        const node = { status: 'released', termination_date: '2027-03-31', limit: { 'ws-storage-gb': 5 },
            history: [{ event: 'released', timestamp: '2026-09-01T10:00:00Z' }] };
        expect(labDeletion(node, resources, retirement)?.slice(0, 10)).toBe('2026-09-16');
    });
});
