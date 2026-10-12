// Who may use the Workspaces section: members of a project (workspace_projects in /v1/me) and admins, who manage the projects. Its own module so the navigation does not pull in the lazily loaded section.
export const hasWorkspaces = (me, isAdmin) => !!(me?.workspace_projects > 0 || isAdmin);
