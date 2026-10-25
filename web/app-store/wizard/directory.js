import { useMemo, useState } from 'react';
import { mergeIntoCache } from './students.js';
import { useCourseMembers, useCourses, useStudents } from '../queries.jsx';

/**
 * useDirectory is everything the first step needs to choose students: the
 * courses with their members, the students (or the matches of a search) and a
 * cache of everybody seen, so later steps can show names for ids.
 */
export function useDirectory() {
    const [search, setSearch] = useState('');
    const courses = useCourses();
    const courseList = useMemo(() => courses.data ?? [], [courses.data]);
    const memberQueries = useCourseMembers(courseList.map(c => c.courseId));
    const students = useStudents(search);
    // `memberQueries` is a new array on every render; when a course's answer
    // arrived is what tells the memos below to run again.
    const memberStamp = memberQueries.map(q => q.dataUpdatedAt).join();

    const membersByCourse = useMemo(
        () => new Map(courseList.flatMap((c, i) => {
            const data = memberQueries[i]?.data;
            return data ? [[c.courseId, (data.users ?? []).map(u => u.userId)]] : [];
        })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [courseList, memberStamp],
    );

    const cache = useMemo(() => {
        let merged = new Map();
        merged = mergeIntoCache(merged, students.data ?? []);
        for (const q of memberQueries) merged = mergeIntoCache(merged, q.data?.users ?? []);
        return merged;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [students.data, memberStamp]);

    return { search, setSearch, courses: courseList, membersByCourse, students: students.data ?? [], studentsQuery: students, cache };
}
