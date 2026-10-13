// The cached server state of the GPU section (see dyndns/query-keys.js for why keys are arrays).
export const gpuKeys = {
    environments: () => ['gpu', 'environments'],
    log: (id) => ['gpu', 'environments', id, 'log'],
    servers: () => ['gpu', 'servers'],
    usage: (scope, period) => ['gpu', 'usage', scope, period.from, period.to],
    projects: (all) => ['gpu', 'projects', all ? 'all' : 'mine'],
    catalog: () => ['gpu', 'catalog'],
    storage: () => ['gpu', 'storage'],
};
