import { describe, expect, it } from 'vitest';
import { subzonesUnder } from './zone-tree.js';

describe('subzonesUnder', () => {
    it('lists subzones of subzones under their parent, depth first', () => {
        const zones = [
            { name: 'services.dhbw.cloud' },
            { name: 'staging.llm.services.dhbw.cloud', parent: 'llm.services.dhbw.cloud' },
            { name: 'llm.services.dhbw.cloud', parent: 'services.dhbw.cloud' },
            { name: 'gpu.services.dhbw.cloud', parent: 'services.dhbw.cloud' },
            { name: 'other.example', parent: 'example' },
        ];
        expect(subzonesUnder(zones, 'services.dhbw.cloud').map(z => z.name)).toEqual([
            'gpu.services.dhbw.cloud',
            'llm.services.dhbw.cloud',
            'staging.llm.services.dhbw.cloud',
        ]);
    });

    it('stops at a cycle instead of looping', () => {
        const zones = [{ name: 'a.x', parent: 'b.x' }, { name: 'b.x', parent: 'a.x' }];
        expect(subzonesUnder(zones, 'a.x').map(z => z.name)).toEqual(['b.x']);
    });
});
