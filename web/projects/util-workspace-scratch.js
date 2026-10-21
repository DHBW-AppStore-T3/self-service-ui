// Local storage per workspace of a budget (workspace_scratch_gb in os-mgt): the most a workspace or GPU kernel of the projects below it may write at the AI service outside its home and the shared folder (installed packages, /tmp, logs), in GB. Not a quantity: the smallest value along the chain applies, a budget may only lower what the budgets above allow (inherited_workspace_scratch_gb). Where no budget sets one, the AI service's default applies (1 GB).

// The bound the server checks, the same as the AI service's default upper bound.
export const MAX_WORKSPACE_SCRATCH_GB = 200;

const isSet = (v) => v !== null && v !== undefined && v !== '';

// normalizeScratch is the value as a number, null when not set.
export function normalizeScratch(v) {
    return isSet(v) ? Number(v) : null;
}

// effectiveScratch is what applies below a node: the smaller of its own value and what it inherits; null when neither is set.
export function effectiveScratch(node) {
    const own = normalizeScratch(node?.workspace_scratch_gb);
    const above = normalizeScratch(node?.inherited_workspace_scratch_gb);
    if (own === null) return above;
    if (above === null) return own;
    return Math.min(own, above);
}

// scratchErrors checks a budget's own value like the server does, keyed by the form path (workspaceScratchGb).
export function scratchErrors(t, value, above) {
    const v = normalizeScratch(value);
    if (v === null) return {};
    if (!Number.isInteger(v) || v < 1 || v > MAX_WORKSPACE_SCRATCH_GB) {
        return { workspaceScratchGb: t('projects.workspaceScratch.errRange', { max: MAX_WORKSPACE_SCRATCH_GB }) };
    }
    const a = normalizeScratch(above);
    if (a !== null && v > a) return { workspaceScratchGb: t('projects.workspaceScratch.errAbove', { value: a }) };
    return {};
}

// scratchSummary is a value for the history: "5 GB", or "none of its own".
export function scratchSummary(t, v) {
    const n = normalizeScratch(v);
    return n === null ? t('projects.workspaceScratch.none') : t('projects.workspaceScratch.gbValue', { value: n });
}
