// startLink is where somebody without a project for a provider gets one: the
// start page of the projects section, which returns to `back` afterwards.
export function startLink(provider = 'aiaas', back = typeof window !== 'undefined' ? window.location.href : '') {
    const q = new URLSearchParams({ for: provider });
    if (back) q.set('back', back);
    return `/projects/start?${q}`;
}
