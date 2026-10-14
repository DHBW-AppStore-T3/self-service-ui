// The cached server state of the GPU section (see dyndns/query-keys.js for why keys are arrays).
export const gpuKeys = {
    servers: () => ['gpu', 'servers'],
    usage: (scope, period) => ['gpu', 'usage', scope, period.from, period.to],
    projects: (all) => ['gpu', 'projects', all ? 'all' : 'mine'],
    catalog: () => ['gpu', 'catalog'],
    storage: () => ['gpu', 'storage'],
    fleet: () => ['gpu', 'fleet'],
    gpuHours: (scope, period) => ['gpu', 'gpu-hours', scope, period.from, period.to],
};
