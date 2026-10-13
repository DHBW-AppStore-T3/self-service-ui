import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Box, Button, Group, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { toCSV } from '/projects/util-usage.js';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';

// GPU use per hour (llm-management-api, GET /v1/workspaces/gpu-hours; docs/bauplan.md 6.10): per GPU class a grid of days × 24 hours in local time, coloured by how much of the capacity workspaces held, with the inference pool and the queue in each cell's title; below, who held or waited for a GPU. Admins see the classes and everyone; a project's managers (project set) only their project's people.

export const GPU_HOUR_PERIODS = ['7', '30', '90'];

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const num = (v, digits = 1) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits });

// localPeriod: the last n days including today, as the API's from/to (local calendar days; the API counts UTC days, so a day more on each side is asked for and the grid cuts it).
function localPeriod(days) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (Number(days) - 1));
    const pad = new Date(from);
    pad.setDate(pad.getDate() - 1);
    const end = new Date(to);
    end.setDate(end.getDate() + 1);
    return { from: dayKey(pad), to: dayKey(end), days: Array.from({ length: Number(days) }, (_, i) => { const d = new Date(from); d.setDate(d.getDate() + i); return dayKey(d); }) };
}

// gridOf turns the hourly rows of one class into cells by local day and hour; a cell's share is what workspaces held of the capacity.
export function gridOf(hours) {
    const cells = new Map();
    for (const h of hours) {
        const at = new Date(h.hour);
        const key = `${dayKey(at)}|${at.getHours()}`;
        cells.set(key, { ...h, share: h.capacity > 0 ? h.workspace_hours / h.capacity : 0, inference: h.capacity > 0 ? h.inference_hours / h.capacity : 0, avgWaiting: h.sampled_hours > 0 ? h.wait_hours / h.sampled_hours : 0 });
    }
    return cells;
}

// summary of one class over the period: share used by workspaces and by the inference pool, the busiest hour, the longest queue, the hours waited.
export function summaryOf(hours) {
    const s = { capacity: 0, workspace: 0, inference: 0, wait: 0, maxWaiting: 0, peak: null };
    for (const h of hours) {
        s.capacity += h.capacity;
        s.workspace += h.workspace_hours;
        s.inference += h.inference_hours;
        s.wait += h.wait_hours;
        s.maxWaiting = Math.max(s.maxWaiting, h.max_waiting);
        const share = h.capacity > 0 ? h.workspace_hours / h.capacity : 0;
        if (!s.peak || share > s.peak.share) s.peak = { hour: h.hour, share };
    }
    return s;
}

// peopleOf sums the person rows over the period: GPU-hours held, hours waited, hours with a GPU.
export function peopleOf(rows) {
    const by = new Map();
    for (const r of rows) {
        const k = `${r.person}|${r.project}`;
        const cur = by.get(k) ?? { person: r.person, project: r.project, gpu_hours: 0, wait_hours: 0, hours: 0 };
        cur.gpu_hours += r.gpu_hours;
        cur.wait_hours += r.wait_hours;
        if (r.gpu_hours > 0) cur.hours += 1;
        by.set(k, cur);
    }
    return [...by.values()].sort((a, b) => b.gpu_hours - a.gpu_hours || b.wait_hours - a.wait_hours);
}

const pct = (v) => `${Math.round(v * 100)} %`;

function cellColor(c) {
    if (!c) return 'var(--mantine-color-gray-1)';
    if (c.share <= 0) return c.inference > 0 ? 'var(--mantine-color-blue-1)' : 'var(--mantine-color-gray-2)';
    const steps = [2, 4, 5, 6, 7, 8];
    return `var(--mantine-color-teal-${steps[Math.min(steps.length - 1, Math.floor(c.share * steps.length))]})`;
}

function Heatmap({ t, days, cells }) {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    return (
        <Box style={{ overflowX: 'auto' }}>
            <Box style={{ display: 'grid', gridTemplateColumns: `5.5rem repeat(24, minmax(0.9rem, 1fr))`, gap: 2, minWidth: 520 }}>
                <span />
                {hours.map(h => <Text key={h} size="10px" c="dimmed" ta="center">{h % 3 === 0 ? h : ''}</Text>)}
                {days.map(d => (
                    <Box key={d} style={{ display: 'contents' }}>
                        <Text size="xs" c="dimmed">{new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' })}</Text>
                        {hours.map(h => {
                            const c = cells.get(`${d}|${h}`);
                            const title = c
                                ? t('gpu.gpuHours.cell', { day: d, hour: h, share: pct(c.share), inference: pct(c.inference), avg: num(c.avgWaiting), max: c.max_waiting })
                                : t('gpu.gpuHours.cellNone', { day: d, hour: h });
                            return (
                                <Box key={h} title={title} aria-label={title} style={{ height: 14, borderRadius: 2, background: cellColor(c), outline: c?.max_waiting > 0 ? '2px solid var(--mantine-color-red-6)' : undefined, outlineOffset: -2 }} />
                            );
                        })}
                    </Box>
                ))}
            </Box>
            <Group gap="md" mt="xs">
                <Legend color="var(--mantine-color-gray-2)" label={t('gpu.gpuHours.legendIdle')} />
                <Legend color="var(--mantine-color-blue-1)" label={t('gpu.gpuHours.legendInference')} />
                <Legend color="var(--mantine-color-teal-6)" label={t('gpu.gpuHours.legendUsed')} />
                <Legend color="transparent" outline label={t('gpu.gpuHours.legendWaiting')} />
            </Group>
        </Box>
    );
}

function Legend({ color, label, outline }) {
    return (
        <Group gap={4}>
            <Box style={{ width: 12, height: 12, borderRadius: 2, background: color, outline: outline ? '2px solid var(--mantine-color-red-6)' : undefined, outlineOffset: -2 }} />
            <Text size="xs" c="dimmed">{label}</Text>
        </Group>
    );
}

function Stat({ label, value }) {
    return (
        <Stack gap={2}>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text size="lg" fw={600}>{value}</Text>
        </Stack>
    );
}

export function GpuHours({ project }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const [periodKey, setPeriodKey] = useState('7');
    const period = useMemo(() => localPeriod(periodKey), [periodKey]);
    const query = useQuery({
        queryKey: gpuKeys.gpuHours(project || 'all', period),
        queryFn: () => api.gpuHours({ from: period.from, to: period.to }, project),
        staleTime: 5 * 60 * 1000,
    });
    const inPeriod = (iso) => period.days.includes(dayKey(new Date(iso)));
    const hours = useMemo(() => (query.data?.hours ?? []).filter(h => inPeriod(h.hour)), [query.data, period]); // eslint-disable-line react-hooks/exhaustive-deps
    const rows = useMemo(() => (query.data?.people ?? []).filter(p => inPeriod(p.hour)), [query.data, period]); // eslint-disable-line react-hooks/exhaustive-deps
    // Names instead of slugs; all projects for admins (the API answers others with their own). A project that is gone keeps its slug.
    const projects = useQuery({ queryKey: gpuKeys.projects(true), queryFn: () => api.listProjects(true), staleTime: 5 * 60 * 1000 });
    const names = useMemo(() => new Map((projects.data ?? []).map(p => [p.slug, p.name || p.slug])), [projects.data]);
    const classes = [...new Set(hours.map(h => h.gpu_class))].sort();
    const people = peopleOf(rows);

    const download = () => {
        const cols = [
            { label: 'hour', value: r => r.hour }, { label: 'gpu_class', value: r => r.gpu_class },
            { label: 'project', value: r => r.project ?? '' }, { label: 'project_name', value: r => (r.project ? names.get(r.project) ?? '' : '') }, { label: 'person', value: r => r.person ?? '' }, { label: 'profile', value: r => r.profile ?? '' },
            { label: 'capacity', value: r => r.capacity ?? '' }, { label: 'workspace_hours', value: r => r.workspace_hours ?? r.gpu_hours },
            { label: 'inference_hours', value: r => r.inference_hours ?? '' }, { label: 'wait_hours', value: r => r.wait_hours }, { label: 'max_waiting', value: r => r.max_waiting ?? '' },
        ];
        const blob = new Blob([toCSV(cols, [...hours, ...rows])], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gpu-hours-${project || 'all'}-${period.days[0]}-${period.days[period.days.length - 1]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Paper withBorder p="lg" radius="md">
            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                    <div>
                        <Title order={4}>{t('gpu.gpuHours.title')}</Title>
                        <Text size="xs" c="dimmed">{t(project ? 'gpu.gpuHours.hintProject' : 'gpu.gpuHours.hint')}</Text>
                    </div>
                    <Group gap="xs">
                        <SegmentedControl size="xs" value={periodKey} onChange={setPeriodKey}
                            data={GPU_HOUR_PERIODS.map(p => ({ value: p, label: t(`gpu.gpuHours.period.${p}`) }))} />
                        <Button size="xs" variant="light" leftSection={<Download size="14" />} onClick={download} disabled={!hours.length && !rows.length}>CSV</Button>
                    </Group>
                </Group>
                {query.isPending ? <Loading size="sm" />
                    : query.isError ? <LoadError query={query} />
                        : (
                            <>
                                {classes.map(cls => {
                                    const own = hours.filter(h => h.gpu_class === cls);
                                    const s = summaryOf(own);
                                    return (
                                        <Stack key={cls} gap="sm">
                                            <Text fw={600} size="sm">{t('gpu.gpuHours.class', { name: cls })}</Text>
                                            <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
                                                <Stat label={t('gpu.gpuHours.used')} value={s.capacity ? pct(s.workspace / s.capacity) : '—'} />
                                                <Stat label={t('gpu.gpuHours.inference')} value={s.capacity ? pct(s.inference / s.capacity) : '—'} />
                                                <Stat label={t('gpu.gpuHours.peak')} value={s.peak && s.peak.share > 0 ? `${pct(s.peak.share)} · ${new Date(s.peak.hour).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : '—'} />
                                                <Stat label={t('gpu.gpuHours.maxWaiting')} value={s.maxWaiting} />
                                                <Stat label={t('gpu.gpuHours.waited')} value={`${num(s.wait)} h`} />
                                            </SimpleGrid>
                                            <Heatmap t={t} days={period.days} cells={gridOf(own)} />
                                        </Stack>
                                    );
                                })}
                                {!classes.length && !project && <Text size="sm" c="dimmed">{t('gpu.gpuHours.empty')}</Text>}
                                {people.length > 0 ? (
                                    <Table.ScrollContainer minWidth={520}>
                                        <Table striped fz="xs">
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th>{t('gpu.gpuHours.person')}</Table.Th>
                                                    <Table.Th>{t('gpu.gpuHours.project')}</Table.Th>
                                                    <Table.Th ta="right">{t('gpu.gpuHours.gpuHours')}</Table.Th>
                                                    <Table.Th ta="right">{t('gpu.gpuHours.hours')}</Table.Th>
                                                    <Table.Th ta="right">{t('gpu.gpuHours.waitHours')}</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {people.map(p => (
                                                    <Table.Tr key={`${p.person}|${p.project}`}>
                                                        <Table.Td>{p.person}</Table.Td>
                                                        <Table.Td>{p.project ? (names.get(p.project) ?? p.project) : '—'}</Table.Td>
                                                        <Table.Td ta="right">{num(p.gpu_hours, 2)}</Table.Td>
                                                        <Table.Td ta="right">{p.hours}</Table.Td>
                                                        <Table.Td ta="right">{num(p.wait_hours, 2)}</Table.Td>
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Table.ScrollContainer>
                                ) : project && <Text size="sm" c="dimmed">{t('gpu.gpuHours.empty')}</Text>}
                                <Text size="xs" c="dimmed">{t('gpu.gpuHours.explain')}</Text>
                            </>
                        )}
            </Stack>
        </Paper>
    );
}
