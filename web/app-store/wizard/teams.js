// Who is in which team: the pure rules of the wizard's distribution step, ported
// from the existing frontend (src/views/new-deployment/teamAssignment.ts). A
// state is { mode: 'one' | 'eachUser' | 'custom', count, assignments, names };
// `assignments[i]` holds the student ids of team i. `name(index)` gives the
// default name of the team at that (0-based) index.

const LEGACY_DEFAULT_PREFIX = 'Team';

const isBlank = value => !value || value.trim() === '';

// Existing non-blank names are kept, the rest defaulted.
function namesFor(count, existing, name) {
    return Array.from({ length: count }, (_, i) => (isBlank(existing[i]) ? name(i) : existing[i]));
}

function assignmentsFor(count, existing) {
    return Array.from({ length: count }, (_, i) => existing[i] ?? []);
}

// At least one team, and arrays that match the team count.
export function normalizeTeams(state, name) {
    const count = Math.max(1, state.count || 1);
    return { ...state, count, assignments: assignmentsFor(count, state.assignments), names: namesFor(count, state.names, name) };
}

// "One team for everyone"; keeps a custom name, replaces blank and generated ones.
export function chooseOneGroup(state, studentIds, name) {
    const first = state.names?.[0];
    const keep = !isBlank(first) && !first.startsWith(LEGACY_DEFAULT_PREFIX);
    return { mode: 'one', count: 1, assignments: [[...studentIds]], names: [keep ? first : name(0)] };
}

// One team per student (also forced for apps that run one VM per person).
export function chooseEachUser(studentIds, name) {
    return {
        mode: 'eachUser',
        count: studentIds.length,
        assignments: studentIds.map(id => [id]),
        names: studentIds.map((_, i) => name(i)),
    };
}

// Free assignment; starts with two teams when coming from a single one.
export function chooseCustom(state, studentCount, name) {
    const count = state.count === 1 && studentCount > 1 ? 2 : state.count;
    return normalizeTeams({ ...state, mode: 'custom', count }, name);
}

// Grow or shrink: new teams are empty and default-named, students of removed
// teams simply become unassigned.
export function resizeTeams(state, newCount, name) {
    return {
        ...state,
        count: newCount,
        assignments: assignmentsFor(newCount, state.assignments),
        names: namesFor(newCount, state.names, name),
    };
}

const withoutStudent = (assignments, studentId) => assignments.map(group => (group ?? []).filter(id => id !== studentId));

// Move a student to team `target`, or to the unassigned pool for null.
export function moveStudent(assignments, studentId, target) {
    const next = withoutStudent(assignments, studentId);
    if (target === null) return next;
    while (next.length <= target) next.push([]);
    next[target] = [...next[target], studentId];
    return next;
}

export function removeFromTeam(assignments, studentId, teamIndex) {
    return assignments.map((group, i) => (i === teamIndex ? (group ?? []).filter(id => id !== studentId) : group));
}

// Random, evenly sized teams (Fisher-Yates); earlier teams take the remainder.
export function shuffleIntoTeams(studentIds, count, random) {
    const pool = [...studentIds];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const base = Math.floor(pool.length / count);
    const remainder = pool.length % count;
    const teams = [];
    let cursor = 0;
    for (let i = 0; i < count; i++) {
        const size = base + (i < remainder ? 1 : 0);
        teams.push(pool.slice(cursor, cursor + size));
        cursor += size;
    }
    return teams;
}

export const clearAssignments = count => Array.from({ length: count }, () => []);

export function unassignedOf(studentIds, assignments) {
    const assigned = new Set(assignments.flat());
    return studentIds.filter(id => !assigned.has(id));
}

// Everybody assigned, no empty team, no blank team name.
export function isAssignmentComplete(studentIds, state) {
    const teams = state.assignments.slice(0, state.count);
    const names = state.names.slice(0, state.count);
    return unassignedOf(studentIds, state.assignments).length === 0
        && !teams.some(group => !group || group.length === 0)
        && !names.some(isBlank);
}

/**
 * syncTeams brings the teams in line with the students chosen in the first
 * step. "One team" and "each person" are rebuilt from the students; custom
 * teams keep their shape and only lose students who are no longer chosen. An app
 * that runs one VM per person (`forceEachUser`) always gets one team each.
 */
export function syncTeams(state, studentIds, forceEachUser, name) {
    if (studentIds.length === 0) return { mode: state.mode, count: 0, assignments: [], names: [] };
    if (forceEachUser || state.mode === 'eachUser') return chooseEachUser(studentIds, name);
    if (state.mode === 'one') return chooseOneGroup(state, studentIds, name);
    const chosen = new Set(studentIds);
    return { ...state, assignments: state.assignments.map(group => (group ?? []).filter(id => chosen.has(id))) };
}
