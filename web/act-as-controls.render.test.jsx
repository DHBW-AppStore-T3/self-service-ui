// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import { ActAsBanner, ActAsButton } from '/act-as-controls.jsx';

// Who sees the control, and that acting for somebody can never go unnoticed.

let state;
vi.mock('/providers/act-as.jsx', () => ({ useActAs: () => state }));

const base = { actingAs: null, mayActAs: false, refused: [], query: '', setQuery: () => {}, matches: [], hasMore: false, searching: false, submitTarget: null, actAs: () => {}, stop: () => {} };

afterEach(cleanup);

describe('acting on behalf', () => {
    it('shows nothing to people who may not', () => {
        state = base;
        renderView(<><ActAsButton /><ActAsBanner /></>);
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByText(/Im Auftrag von|On behalf of/)).toBeNull();
    });

    it('offers the button to an admin, without a banner', () => {
        state = { ...base, mayActAs: true };
        renderView(<><ActAsButton /><ActAsBanner /></>);
        expect(screen.getAllByRole('button').length).toBe(1);
        expect(screen.queryByText(/Im Auftrag von|On behalf of/)).toBeNull();
    });

    it('names the person and the refusing service while acting', () => {
        state = { ...base, mayActAs: true, actingAs: 'student@dhbw.de', refused: ['dns'] };
        renderView(<ActAsBanner />);
        expect(screen.getByText(/student@dhbw\.de/)).toBeTruthy();
        expect(screen.getByText(/DNS/)).toBeTruthy();
    });
});
