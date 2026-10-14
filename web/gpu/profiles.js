// How JupyterHub's profile slugs read in the UI (the hub's profileList in gpu-aas). Unknown slugs are shown as they are.
export function profileLabel(slug, t) {
    const known = ['cpu', 'pytorch', 'tensorflow', 'cpu-gpukernel', 'project-gpu', 'free', 'free-gpu'];
    return known.includes(slug) ? t(`gpu.profiles.${slug}`) : (slug || '—');
}

export function usesGpu(slug) {
    return ['project-gpu', 'pytorch', 'tensorflow', 'free-gpu'].includes(slug);
}
