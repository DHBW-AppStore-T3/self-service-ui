import { useTranslation } from 'react-i18next';
import {
    ActionIcon, Alert, Badge, Box, Button, Checkbox, Chip, Group, Loader, NumberInput, Paper, ScrollArea, SegmentedControl,
    Select, SimpleGrid, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { AlertCircle, Shuffle, X } from 'lucide-react';
import { deriveCourseIds, displayNameOf, toggleCourseSelection, toggleId } from './students.js';
import {
    chooseCustom, chooseEachUser, chooseOneGroup, clearAssignments, isAssignmentComplete, moveStudent, removeFromTeam,
    resizeTeams, shuffleIntoTeams, unassignedOf,
} from './teams.js';

// --------------------------------------------------------- 1. configuration
export function ConfigStep({ version, name, setName, studentIds, setStudentIds, directory }) {
    const { t } = useTranslation();
    const { courses, membersByCourse, students, studentsQuery, search, setSearch } = directory;
    const selectedCourses = new Set(deriveCourseIds(courses.map(c => c.courseId), membersByCourse, studentIds));

    return (
        <Stack gap="lg">
            <Group grow align="flex-start">
                <TextInput label={t('appStore.wizard.config.name')} value={name} required
                    onChange={e => setName(e.currentTarget.value)} />
                <Box>
                    <Text size="sm" fw={500}>{t('appStore.wizard.config.version')}</Text>
                    <Badge variant="light" size="lg" mt={6} tt="none">{version ?? '–'}</Badge>
                </Box>
            </Group>

            <Stack gap="sm">
                <Box>
                    <Title order={3} size="h5">{t('appStore.wizard.config.studentsTitle')}</Title>
                    <Text size="sm" c="dimmed">{t('appStore.wizard.config.studentsHint')}</Text>
                </Box>

                {courses.length > 0 && (
                    <Group gap="xs" role="group" aria-label={t('appStore.wizard.config.courses')}>
                        {courses.map(course => {
                            const members = membersByCourse.get(course.courseId);
                            return (
                                <Chip key={course.courseId} variant="outline" size="sm" checked={selectedCourses.has(course.courseId)}
                                    disabled={!members?.length}
                                    onChange={() => setStudentIds(toggleCourseSelection(studentIds, members ?? []))}>
                                    {t('appStore.wizard.config.course', { name: course.name, count: members?.length ?? 0 })}
                                </Chip>
                            );
                        })}
                    </Group>
                )}

                <TextInput label={t('appStore.wizard.config.search')} placeholder={t('appStore.wizard.config.searchPlaceholder')}
                    value={search} onChange={e => setSearch(e.currentTarget.value)}
                    rightSection={studentsQuery.isFetching ? <Loader size="xs" /> : null} />

                {studentsQuery.isError && <Alert color="red" icon={<AlertCircle size={18} />}>{t('appStore.wizard.config.loadFailed')}</Alert>}
                <Paper withBorder>
                    <ScrollArea h={260} type="auto">
                        <Stack gap={0} p="xs">
                            {students.length === 0 && !studentsQuery.isPending && (
                                <Text size="sm" c="dimmed" p="sm">{t('appStore.wizard.config.noStudents')}</Text>
                            )}
                            {students.map(student => (
                                <Checkbox key={student.userId} py={6} px="xs"
                                    checked={studentIds.includes(student.userId)}
                                    onChange={() => setStudentIds(toggleId(studentIds, student.userId))}
                                    label={`${displayNameOf(student)}${student.email && displayNameOf(student) !== student.email ? ` · ${student.email}` : ''}`} />
                            ))}
                        </Stack>
                    </ScrollArea>
                </Paper>
                <Text size="sm" c="dimmed" role="status">
                    {studentIds.length === 0
                        ? t('appStore.wizard.config.none')
                        : t('appStore.wizard.config.selected', { count: studentIds.length })}
                </Text>
            </Stack>
        </Stack>
    );
}

// ---------------------------------------------------------- 2. distribution
function StudentChip({ id, label, locked, onRemove }) {
    const { t } = useTranslation();
    return (
        <Badge variant="light" size="lg" tt="none" style={{ cursor: locked ? 'default' : 'grab' }}
            draggable={!locked} onDragStart={e => e.dataTransfer.setData('text/plain', id)}
            rightSection={onRemove && !locked ? (
                <ActionIcon size="xs" variant="transparent" aria-label={t('appStore.wizard.teams.remove', { name: label })} onClick={onRemove}>
                    <X size={12} />
                </ActionIcon>
            ) : null}>
            {label}
        </Badge>
    );
}

function DropColumn({ title, onDrop, children }) {
    const { t } = useTranslation();
    return (
        <Paper withBorder p="sm" onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onDrop(e.dataTransfer.getData('text/plain')); }}>
            <Stack gap="xs" mih={90}>
                {title}
                <Group gap="xs">{children}</Group>
                <Text size="xs" c="dimmed">{t('appStore.wizard.teams.dropHere')}</Text>
            </Stack>
        </Paper>
    );
}

export function TeamsStep({ state, setState, studentIds, cache, forced, teamName }) {
    const { t } = useTranslation();
    const labelOf = id => displayNameOf(cache.get(id) ?? { userId: id });

    if (studentIds.length === 0) return <Text c="dimmed">{t('appStore.wizard.teams.empty')}</Text>;

    const mode = forced ? 'eachUser' : state.mode;
    const choose = next => setState(
        next === 'one' ? chooseOneGroup(state, studentIds, teamName)
            : next === 'eachUser' ? chooseEachUser(studentIds, teamName)
                : chooseCustom({ ...state, assignments: state.assignments.length ? state.assignments : [studentIds] }, studentIds.length, teamName),
    );
    const unassigned = unassignedOf(studentIds, state.assignments);
    const moveTo = (id, target) => id && studentIds.includes(id) && setState({ ...state, assignments: moveStudent(state.assignments, id, target) });
    const targets = [{ value: 'pool', label: t('appStore.wizard.teams.pool') }, ...state.names.slice(0, state.count).map((n, i) => ({ value: String(i), label: n || teamName(i) }))];

    return (
        <Stack gap="md">
            <SegmentedControl value={mode} onChange={choose} disabled={forced} fullWidth
                data={['one', 'eachUser', 'custom'].map(value => ({ value, label: t(`appStore.wizard.teams.modes.${value}`) }))} />

            {forced && <Text size="sm" c="dimmed">{t('appStore.wizard.teams.forced')}</Text>}
            {!forced && mode !== 'custom' && <Text size="sm" c="dimmed">{t(mode === 'one' ? 'appStore.wizard.teams.oneHint' : 'appStore.wizard.teams.eachHint', { count: studentIds.length })}</Text>}

            {!forced && mode === 'custom' && (
                <Stack gap="md">
                    <Group align="flex-end">
                        <NumberInput label={t('appStore.wizard.teams.count')} value={state.count} min={1} max={Math.max(1, studentIds.length)} w={140}
                            onChange={value => value && setState(resizeTeams(state, Number(value), teamName))} />
                        <Button variant="light" leftSection={<Shuffle size={16} />}
                            onClick={() => setState({ ...state, assignments: shuffleIntoTeams(studentIds, state.count, Math.random) })}>
                            {t('appStore.wizard.teams.shuffle')}
                        </Button>
                        <Button variant="subtle" color="gray" onClick={() => setState({ ...state, assignments: clearAssignments(state.count) })}>
                            {t('appStore.wizard.teams.clear')}
                        </Button>
                    </Group>

                    <DropColumn onDrop={id => moveTo(id, null)} title={<Text fw={500} size="sm">{t('appStore.wizard.teams.unassigned')} ({unassigned.length})</Text>}>
                        {unassigned.map(id => (
                            <Stack key={id} gap={2} align="flex-start">
                                <StudentChip id={id} label={labelOf(id)} />
                                <Select size="xs" aria-label={t('appStore.wizard.teams.moveTo', { name: labelOf(id) })} data={targets} value="pool"
                                    allowDeselect={false} w={150} onChange={value => moveTo(id, value === 'pool' ? null : Number(value))} />
                            </Stack>
                        ))}
                    </DropColumn>

                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        {state.names.slice(0, state.count).map((teamLabel, index) => (
                            <DropColumn key={index} onDrop={id => moveTo(id, index)}
                                title={(
                                    <TextInput aria-label={t('appStore.wizard.teams.teamNameLabel', { index: index + 1 })} value={teamLabel} size="xs"
                                        onChange={e => setState({ ...state, names: state.names.map((n, i) => (i === index ? e.currentTarget.value : n)) })} />
                                )}>
                                {(state.assignments[index] ?? []).map(id => (
                                    <Stack key={id} gap={2} align="flex-start">
                                        <StudentChip id={id} label={labelOf(id)}
                                            onRemove={() => setState({ ...state, assignments: removeFromTeam(state.assignments, id, index) })} />
                                        <Select size="xs" aria-label={t('appStore.wizard.teams.moveTo', { name: labelOf(id) })} data={targets} value={String(index)}
                                            allowDeselect={false} w={150}
                                            onChange={value => moveTo(id, value === 'pool' ? null : Number(value))} />
                                    </Stack>
                                ))}
                            </DropColumn>
                        ))}
                    </SimpleGrid>

                    {!isAssignmentComplete(studentIds, state) && (
                        <Alert color="blue" icon={<AlertCircle size={18} />} role="status">{t('appStore.wizard.teams.incomplete')}</Alert>
                    )}
                </Stack>
            )}
        </Stack>
    );
}
