// The pure logic of the wizard's variables step: scopes and their slots,
// restoring values, comparing against defaults, required gating. Ported from the
// existing frontend (src/views/new-deployment/variableForm.ts); the view only
// wires these to state.
//
// Form values are keyed by `formKeyOf`: the variable name, except for Packer
// variables of multi-image apps, which are namespaced `<template_key>.<name>`.

const DEFAULT_TEMPLATE_KEY = 'default';
const FALLBACK_USERNAME_LENGTH = 8;

const isBool = type => ['bool', 'boolean'].includes(String(type).toLowerCase());
const isNumber = type => ['number', 'int', 'integer'].includes(String(type).toLowerCase());
export const isList = type => /^(list|set|array)/i.test(String(type));
export { isBool, isNumber };

// ------------------------------------------------------------------ flags
export const isFileVar = v => v.osType === 'file';
export const isExpert = v => v.description?.includes('@expert') ?? false;
export const displayDescription = v => (v.description ?? '').replace(/@expert\b/g, '').trim();
export const effectiveScope = v => v.varScope || v.osScope || 'all';
export const isScoped = v => effectiveScope(v) !== 'all';

const isPlainObject = x => !!x && typeof x === 'object' && !Array.isArray(x);

const isEmptyValue = val => val === undefined
    || val === null
    || (typeof val === 'string' && val.trim() === '')
    || (Array.isArray(val) && val.length === 0);

const hasNoDefault = v => v.default === null || v.default === undefined;

/**
 * splitVariables separates what a lecturer has to see from the rest. Only a
 * required variable without a default is shown up front; everything else — with
 * a default, optional, or marked @expert — goes into the "expert settings".
 */
export function splitVariables(defs) {
    const basic = [];
    const expert = [];
    for (const v of defs) (v.required && hasNoDefault(v) ? basic : expert).push(v);
    return { basic, expert };
}

// Expert settings open by default when a required expert variable has no default.
export const hasBlockingExpert = defs => defs.some(v => isExpert(v) && v.required && hasNoDefault(v));

// ------------------------------------------------------------ teams & slots
// Teams with member display names, from the distribution step and the student cache.
export function buildWizardTeams(groupNames, assignments, studentCache) {
    return (groupNames || []).map((rawName, idx) => {
        const memberIds = (assignments?.[idx] || []).map(String);
        return {
            name: rawName || `Team-${idx + 1}`,
            members: memberIds.map(userId => {
                const cached = studentCache.get(userId);
                const username = cached?.username
                    || cached?.email?.split('@')[0]
                    || cached?.firstName
                    || userId.slice(0, FALLBACK_USERNAME_LENGTH);
                return { userId, username };
            }),
        };
    });
}

export const userSlotKey = (teamName, username) => `${teamName}-${username}`;

// Slot keys of a scoped variable: one per team, or one per team member.
export function slotKeysFor(v, teams) {
    const scope = effectiveScope(v);
    if (scope === 'team') return teams.map(t => t.name);
    if (scope === 'user') return teams.flatMap(t => t.members.map(m => userSlotKey(t.name, m.username)));
    return [];
}

// Human label of a slot. The longest team name wins, so dashes in names resolve correctly.
export function formatSlotLabel(v, slotKey, teams) {
    const scope = effectiveScope(v);
    if (scope === 'team') return `Team „${slotKey}"`;
    if (scope === 'user') {
        const names = teams.map(t => t.name).sort((a, b) => b.length - a.length);
        for (const team of names) {
            if (slotKey === team) return `Team „${team}"`;
            if (slotKey.startsWith(`${team}-`)) return `Team „${team}" → ${slotKey.slice(team.length + 1)}`;
        }
        const sep = slotKey.lastIndexOf('-');
        if (sep > 0) return `Team „${slotKey.slice(0, sep)}" → ${slotKey.slice(sep + 1)}`;
    }
    return slotKey;
}

/**
 * Initial slot map of a scoped variable: a scalar or list default is spread over
 * every slot (a list default as comma string, like the plain textarea). Object
 * defaults yield nothing; existing values (coming back via "Back") are kept.
 */
export function seedScopedDefault(v, existing, teams) {
    const map = isPlainObject(existing) ? { ...existing } : {};
    const def = v.default;
    const seedable = def !== undefined && def !== null
        && (typeof def === 'string' || typeof def === 'number' || typeof def === 'boolean' || Array.isArray(def));
    if (!seedable) return map;
    const seed = isList(v.type) && Array.isArray(def) ? def.join(', ') : def;
    for (const slot of slotKeysFor(v, teams)) {
        const current = map[slot];
        if (current === undefined || current === null || current === '') map[slot] = seed;
    }
    return map;
}

// ------------------------------------------------------ definitions/layout
// Packer variables per template key (`default` when the app has a single image).
export function groupPackerByTemplate(defs) {
    const out = {};
    for (const v of defs) {
        if (v.source !== 'packer') continue;
        (out[v.template_key ?? DEFAULT_TEMPLATE_KEY] ??= []).push(v);
    }
    return out;
}

// Multi-image when there are several template keys, or one that is not `default`.
export function isMultiImageLayout(templateKeys) {
    return templateKeys.length > 1 || (templateKeys.length === 1 && templateKeys[0] !== DEFAULT_TEMPLATE_KEY);
}

export function formKeyOf(v, isMultiImage) {
    if (v.source !== 'packer') return v.name;
    const tkey = v.template_key ?? DEFAULT_TEMPLATE_KEY;
    return !isMultiImage || tkey === DEFAULT_TEMPLATE_KEY ? v.name : `${tkey}.${v.name}`;
}

// Drops duplicate definitions (same template key and name; Terraform: name).
export function dedupeVariables(defs) {
    const seen = new Map();
    for (const v of defs) {
        const key = v.source === 'packer' ? `${v.template_key ?? DEFAULT_TEMPLATE_KEY}.${v.name}` : v.name;
        if (!seen.has(key)) seen.set(key, v);
    }
    return [...seen.values()];
}

// Initial form values after a fresh load: saved input, then defaults.
export function initialFromFetch(defs, saved, isMultiImage, teams) {
    const values = {};
    for (const v of defs) {
        const key = formKeyOf(v, isMultiImage);
        let value = '';
        if (saved[key] !== undefined) value = saved[key];
        else if (saved[v.name] !== undefined) value = saved[v.name];
        else if (v.default !== undefined && v.default !== null) value = v.default;

        if (isScoped(v) && !isFileVar(v)) {
            values[key] = seedScopedDefault(v, isPlainObject(value) ? value : undefined, teams);
            continue;
        }
        if (isList(v.type) && Array.isArray(value)) value = value.join(', ');
        if (value === '' || value === null || value === undefined) value = isBool(v.type) ? false : '';
        values[key] = value;
    }
    return values;
}

/**
 * reconcileValues is the form's start, and its repair when the teams changed
 * after a step back: what was typed stays, scoped variables get their default for
 * new slots, and values of teams or members that are gone are dropped.
 */
export function reconcileValues(defs, previous, isMultiImage, teams) {
    return dropStaleSlots(defs, initialFromFetch(defs, previous, isMultiImage, teams), isMultiImage, teams).values;
}

// --------------------------------------------------------------- comparing
// Canonical form for "differs from default" comparisons.
export function normalizeValue(val, type) {
    if (val === null || val === undefined) {
        if (isList(type)) return JSON.stringify([]);
        if (isBool(type)) return false;
        return '';
    }
    if (isList(type)) {
        const arr = Array.isArray(val)
            ? val
            : typeof val === 'string' ? val.split(',').map(s => s.trim()).filter(s => s !== '') : [String(val)];
        return JSON.stringify([...arr].sort());
    }
    if (isNumber(type)) return val === '' ? null : Number(val);
    if (isBool(type)) return Boolean(val);
    return String(val).trim();
}

const splitList = raw => raw.split(',').map(s => s.trim()).filter(s => s !== '');

// A value as it is sent: lists as arrays, numbers as numbers.
function toStoredValue(raw, type) {
    if (isList(type) && typeof raw === 'string') return splitList(raw);
    if (isNumber(type) && raw !== '') return Number(raw);
    return raw;
}

function cleanScopedMap(map, type) {
    const clean = {};
    if (!isPlainObject(map)) return clean;
    for (const [slot, raw] of Object.entries(map)) {
        if (raw === undefined || raw === null) continue;
        if (typeof raw === 'string' && raw.trim() === '') continue;
        clean[slot] = toStoredValue(raw, type);
    }
    return clean;
}

/**
 * Splits the form into `changed` (differs from the author's default) and `all`
 * (every value, as it will be sent). Multi-image Packer values are nested under
 * `packer[<template key>]`.
 */
export function buildDraftValues(defs, form, isMultiImage) {
    const changed = {};
    const all = {};
    const nestedChanged = {};
    const nestedAll = {};

    for (const v of defs) {
        if (isFileVar(v)) continue;
        const key = formKeyOf(v, isMultiImage);
        const tkey = v.template_key ?? DEFAULT_TEMPLATE_KEY;
        const nested = v.source === 'packer' && isMultiImage;

        let value;
        let hasChanged;
        if (isScoped(v)) {
            value = cleanScopedMap(form[key], v.type);
            hasChanged = Object.keys(value).length > 0;
        } else {
            value = toStoredValue(form[key], v.type);
            hasChanged = normalizeValue(form[key], v.type) !== normalizeValue(v.default, v.type);
        }

        if (nested) {
            if (hasChanged) (nestedChanged[tkey] ??= {})[v.name] = value;
            (nestedAll[tkey] ??= {})[v.name] = value;
        } else {
            if (hasChanged) changed[v.name] = value;
            all[v.name] = value;
        }
    }

    if (isMultiImage && Object.keys(nestedChanged).length > 0) changed.packer = nestedChanged;
    if (isMultiImage && Object.keys(nestedAll).length > 0) all.packer = nestedAll;
    return { changed, all };
}

// ------------------------------------------------------- required gating
// Names of required variables (or `name (slot)`) that are still empty.
export function findMissingRequired(defs, form, isMultiImage, teams) {
    const missing = [];
    for (const v of defs) {
        if (!v.required || isFileVar(v)) continue;
        const key = formKeyOf(v, isMultiImage);
        if (isScoped(v)) {
            const map = form[key] ?? {};
            const slots = slotKeysFor(v, teams);
            if (slots.length === 0) missing.push(v.name);
            for (const slot of slots) if (isEmptyValue(map[slot])) missing.push(`${v.name} (${slot})`);
        } else if (isEmptyValue(form[key])) {
            missing.push(v.name);
        }
    }
    return missing;
}

// Removes slot values whose team or member no longer exists (e.g. after a rename).
export function dropStaleSlots(defs, form, isMultiImage, teams) {
    const dropped = [];
    let values = form;
    for (const v of defs) {
        if (!isScoped(v) || isFileVar(v)) continue;
        const key = formKeyOf(v, isMultiImage);
        const map = form[key];
        if (!isPlainObject(map)) continue;
        const valid = new Set(slotKeysFor(v, teams));
        const stale = Object.keys(map).filter(slot => !valid.has(slot));
        if (stale.length === 0) continue;
        stale.forEach(slot => dropped.push(`${v.name} → ${slot}`));
        values = { ...values, [key]: Object.fromEntries(Object.entries(map).filter(([slot]) => valid.has(slot))) };
    }
    return { values, dropped };
}

// What the backend could not resolve in a variable's @openstack marker.
export function markerErrorLines(defs) {
    return defs.filter(v => v.markerError).map(v => {
        const loc = v.markerError.location ? ` (${v.markerError.location})` : '';
        return `• ${v.markerError.variable}${loc}: ${v.markerError.message}`;
    });
}
