// Who sees the Workspaces section (docs/plan-workspaces.md): members of a project (workspace_projects in /v1/me), before projects an access rule with a GPU tier, and admins, who manage the projects. Its own module so the navigation does not pull in the lazily loaded section.
export const hasWorkspaces = (me, isAdmin) => !!(me?.workspace_projects > 0 || me?.gpu_tier || isAdmin);
