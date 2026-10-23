// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { valkeyShare } from './storage.jsx';

describe('valkeyShare', () => {
    it('measures against maxmemory when set, else the node RAM', () => {
        expect(valkeyShare({ used_bytes: 1, max_bytes: 4, system_bytes: 100 })).toBe(25);
        expect(valkeyShare({ used_bytes: 10, max_bytes: 0, system_bytes: 100 })).toBe(10);
    });
    it('is unknown without a report or a limit', () => {
        expect(valkeyShare(null)).toBeNull();
        expect(valkeyShare({ used_bytes: 10 })).toBeNull();
    });
});
