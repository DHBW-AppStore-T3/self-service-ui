import { describe, expect, it } from 'vitest';
import { validPoolId } from './pool-id.js';

describe('validPoolId', () => {
    it('takes what the API takes', () => {
        for (const id of ['wi', 'maarm64', 'mannheim-arm64', 'a1-b2-c3']) expect(validPoolId(id)).toBe(true);
    });
    it('refuses underscores, double or trailing hyphens, a leading digit, and more than 20 characters', () => {
        for (const id of ['m', 'ma_arm64', 'ma--arm64', 'ma-', '-ma', '1ma', 'mannheim-arm64-gb10-x']) expect(validPoolId(id)).toBe(false);
    });
});
