// Picking students for a deployment, ported from the existing frontend
// (src/views/new-deployment/studentSelection.ts). Students are identified by
// their App Store `userId` — what teams carry, and the one id every user has.

// The name shown for a student in lists and chips.
export function displayNameOf(student) {
    if (student.firstName || student.lastName) return `${student.firstName || ''} ${student.lastName || ''}`.trim();
    return student.username || student.email || student.userId || '';
}

// A course counts as selected when it has students and all of them are selected.
export function isCourseFullySelected(courseStudentIds, selectedIds) {
    return courseStudentIds.length > 0 && courseStudentIds.every(id => selectedIds.includes(id));
}

// Select all students of a course (no duplicates), or deselect them when all are selected.
export function toggleCourseSelection(selectedIds, courseStudentIds) {
    if (isCourseFullySelected(courseStudentIds, selectedIds)) return selectedIds.filter(id => !courseStudentIds.includes(id));
    return [...new Set([...selectedIds, ...courseStudentIds])];
}

// Toggle one id in a list; blank ids are ignored.
export function toggleId(ids, id) {
    if (!id || !id.trim()) return ids;
    return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}

// Course ids whose members are all part of the current selection.
export function deriveCourseIds(courseIds, membersByCourse, selectedIds) {
    return courseIds.filter(id => {
        const members = membersByCourse.get(id);
        return members !== undefined && isCourseFullySelected(members, selectedIds);
    });
}

// Merge students into a cache keyed by userId. An existing entry is replaced
// only when the new one knows more (first or last name).
export function mergeIntoCache(cache, students) {
    const next = new Map(cache);
    for (const student of students || []) {
        const id = student?.userId;
        if (!id || typeof id !== 'string' || !id.trim()) continue;
        const existing = next.get(id);
        if (!existing || (student.firstName && !existing.firstName) || (student.lastName && !existing.lastName)) next.set(id, student);
    }
    return next;
}
