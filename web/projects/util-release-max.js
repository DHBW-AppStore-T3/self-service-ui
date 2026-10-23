// Release maximums of a budget (release_max in os-mgt): the most the projects below it may choose as release times of their workspaces at the AI service, per kind of use (cpu, gpu). Not a quantity: the strictest value along the chain applies, a budget may only tighten what the budgets above allow (inherited_release_max). max_hours 0 = no upper bound, only for GPU.

export const RELEASE_KINDS = ['cpu', 'gpu'];
export const RELEASE_FIELDS = ['idle_open_minutes', 'idle_closed_minutes', 'max_hours'];
// The bounds the server checks, the same as the AI service's.
export const MAX_IDLE_MINUTES = 24 * 60;
export const MAX_MAX_HOURS = 30 * 24;

const isSet = (v) => v !== null && v !== undefined && v !== '';

// normalizeRelease is r with only the set values, always both kinds: the shape the API takes, where an empty object removes the budget's own maximums.
export function normalizeRelease(r) {
    const out = { cpu: {}, gpu: {} };
    for (const kind of RELEASE_KINDS) {
        for (const field of RELEASE_FIELDS) {
            const v = r?.[kind]?.[field];
            if (isSet(v)) out[kind][field] = Number(v);
        }
    }
    return out;
}

// isEmptyRelease: r sets nothing.
export function isEmptyRelease(r) {
    const n = normalizeRelease(r);
    return RELEASE_KINDS.every(k => Object.keys(n[k]).length === 0);
}

// sameRelease compares two sets of maximums by their values.
export function sameRelease(a, b) {
    return JSON.stringify(normalizeRelease(a)) === JSON.stringify(normalizeRelease(b));
}

// stricter is the stricter of two values of a field: the smaller idle time; for max_hours the smaller bound, where 0 (none) is the loosest.
function stricter(field, a, b) {
    if (!isSet(a)) return isSet(b) ? b : undefined;
    if (!isSet(b)) return a;
    if (field === 'max_hours') {
        if (a === 0) return b;
        if (b === 0) return a;
    }
    return Math.min(a, b);
}

// stricterRelease is, field by field, the stricter of two sets of maximums (null for none): what applies below a budget is the stricter of its own and its inherited ones.
export function stricterRelease(a, b) {
    const out = { cpu: {}, gpu: {} };
    for (const kind of RELEASE_KINDS) {
        for (const field of RELEASE_FIELDS) {
            const v = stricter(field, a?.[kind]?.[field], b?.[kind]?.[field]);
            if (isSet(v)) out[kind][field] = v;
        }
    }
    return isEmptyRelease(out) ? null : out;
}

// effectiveRelease is what applies below a node as the API sends it: its own maximums tightened by the inherited ones.
export function effectiveRelease(node) {
    return stricterRelease(node?.release_max, node?.inherited_release_max);
}

// unlimitedAllowed: whether the budget may allow no upper bound for the kind — only GPU, and only where no budget above has an upper bound.
export function unlimitedAllowed(kind, inherited) {
    const above = inherited?.[kind]?.max_hours;
    return kind === 'gpu' && (!isSet(above) || above === 0);
}

// releaseErrors checks a budget's maximums like the server does, keyed by form path (releaseMax.<kind>.<field>).
export function releaseErrors(t, value, inherited) {
    const errors = {};
    for (const kind of RELEASE_KINDS) {
        for (const field of RELEASE_FIELDS) {
            const v = value?.[kind]?.[field];
            if (!isSet(v)) continue;
            const above = inherited?.[kind]?.[field];
            const key = `releaseMax.${kind}.${field}`;
            if (field === 'max_hours') {
                if (v === 0) {
                    if (!unlimitedAllowed(kind, inherited)) errors[key] = t('projects.releaseMax.errUnlimited');
                } else if (v < 1 || v > MAX_MAX_HOURS) errors[key] = t('projects.releaseMax.errHours', { max: MAX_MAX_HOURS });
                else if (isSet(above) && above > 0 && v > above) errors[key] = t('projects.releaseMax.errAbove', { value: above });
            } else if (v < 1 || v > MAX_IDLE_MINUTES) errors[key] = t('projects.releaseMax.errMinutes', { max: MAX_IDLE_MINUTES });
            else if (isSet(above) && v > above) errors[key] = t('projects.releaseMax.errAbove', { value: above });
        }
    }
    return errors;
}

// releaseSummary is one line for a set of maximums: "CPU 120/120 Min., 12 Std. · GPU 30/5 Min., 4 Std."; fields not set show as "–".
export function releaseSummary(t, r) {
    if (isEmptyRelease(r)) return t('projects.releaseMax.none');
    const n = normalizeRelease(r);
    const val = (v) => (isSet(v) ? String(v) : '–');
    return RELEASE_KINDS.map(kind => {
        const x = n[kind];
        const hours = x.max_hours === 0 ? t('projects.releaseMax.unlimited') : t('projects.releaseMax.hoursValue', { value: val(x.max_hours) });
        return t('projects.releaseMax.summaryKind', { kind: kind.toUpperCase(), open: val(x.idle_open_minutes), closed: val(x.idle_closed_minutes), hours });
    }).join(' · ');
}
