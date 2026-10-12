import { describe, expect, it } from 'vitest';
import { hasWorkspaces } from './access.js';

describe('hasWorkspaces', () => {
    it('opens the section to members of a project and to admins only', () => {
        expect(hasWorkspaces({ workspace_projects: 1 }, false)).toBe(true);
        expect(hasWorkspaces({ workspace_projects: 0 }, true)).toBe(true);
        expect(hasWorkspaces({ workspace_projects: 0 }, false)).toBe(false);
        expect(hasWorkspaces(null, false)).toBe(false);
    });
});
