// startLink is where somebody without a project of an area (workspaces, llm, cloud) gets one: the start page of the projects section, which returns to `back` afterwards.
export function startLink(area = 'workspaces', back = typeof window !== 'undefined' ? window.location.href : '') {
    const q = new URLSearchParams({ for: area });
    if (back) q.set('back', back);
    return `/projects/start?${q}`;
}

// AREA_PROJECTS is where each area lists its projects (its section of the menu).
export const AREA_PROJECTS = { cloud: '/cloud/projects', workspaces: '/workspaces/projects', llm: '/llm/projects' };
