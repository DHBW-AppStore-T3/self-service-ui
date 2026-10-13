import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button, Container, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { PERIODS, percent, periodRange, toCSV } from '/projects/util-usage.js';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { WorkspaceStorage } from '/gpu/storage.jsx';
import { GpuHours } from '/gpu/gpu-hours.jsx';

// What workspaces reserved, from the rows llm-management-api books every minute (docs/plan-workspaces.md, W1): the same units as the cloud projects' report — server hours, vCPU-h, RAM-GB-h, GPU-h, home GB-days — plus the measured CPU use against the reservation. Everyone sees their own; admins can switch to all.

export const USAGE_GROUPINGS = ['project', 'person', 'profile', 'gpu_class'];
const SUMS = ['server_hours', 'vcpu_hours', 'ram_gb_hours', 'gpu_hours', 'cpu_used_hours', 'ram_used_gb_hours', 'home_gb_days'];

// groupUsage sums the report's entries by one dimension. people counts the distinct persons in a group.
export function groupUsage(entries, by) {
    const groups = new Map();
    for (const e of entries ?? []) {
        const name = e[by] ?? '';
        let g = groups.get(name);
        if (!g) {
            g = { name, persons: new Set(), ...Object.fromEntries(SUMS.map(k => [k, 0])) };
            groups.set(name, g);
        }
        g.persons.add(e.person);
        for (const k of SUMS) g[k] += e[k] ?? 0;
    }
    return [...groups.values()]
        .map(g => ({ ...g, people: g.persons.size, cpu_utilization: g.vcpu_hours > 0 ? g.cpu_used_hours / g.vcpu_hours : null }))
        .sort((a, b) => b.vcpu_hours - a.vcpu_hours || a.name.localeCompare(b.name));
}

const num = (v, digits = 0) => (v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 }));

function Stat({ label, value }) {
    return (
        <Stack gap="2">
            <Text size="xs" c="dimmed">{label}</Text>
            <Text size="lg" fw={600}>{value}</Text>
        </Stack>
    );
}

export function GpuUsage() {
    const { t } = useTranslation();
    const api = useGpuApi();
    const { isAdmin } = useLlmMe();
    const [scope, setScope] = useState('mine'); // mine, all (admins) or project:<slug> (managers and admins)
    const [periodKey, setPeriodKey] = useState('30');
    const [by, setBy] = useState('profile');
    const all = isAdmin && scope === 'all';
    const project = scope.startsWith('project:') ? scope.slice(8) : '';
    const period = useMemo(() => periodRange(periodKey === 'lifetime' ? '1098' : periodKey), [periodKey]);
    const projects = useQuery({ queryKey: gpuKeys.projects(false), queryFn: () => api.listProjects(false) });
    const managed = (projects.data ?? []).filter(p => isAdmin || p.role === 'manager');

    const query = useQuery({
        queryKey: gpuKeys.usage(scope, period),
        queryFn: () => (all || project ? api.workspaceUsage(period, project) : api.myWorkspaceUsage(period)),
        staleTime: 5 * 60 * 1000,
    });
    const report = query.data;
    const rows = useMemo(() => groupUsage(report?.entries, by), [report, by]);
    // Projects by name; for admins all of them (others get their own). A project that is gone keeps its slug.
    const allProjects = useQuery({ queryKey: gpuKeys.projects(true), queryFn: () => api.listProjects(true), staleTime: 5 * 60 * 1000 });
    const names = useMemo(() => new Map((allProjects.data ?? []).map(p => [p.slug, p.name || p.slug])), [allProjects.data]);
    const label = (r) => (by === 'project' && r.name ? names.get(r.name) ?? r.name : r.name) || (by === 'gpu_class' ? t('gpu.usage.noGpu') : '—');

    const columns = [
        { label: t(`gpu.usage.groupBy.${by}`), value: label },
        { label: t('gpu.usage.people'), value: r => r.people },
        { label: t('gpu.usage.serverHours'), value: r => r.server_hours },
        { label: t('gpu.usage.vcpuHours'), value: r => r.vcpu_hours },
        { label: t('gpu.usage.ramGbHours'), value: r => r.ram_gb_hours },
        { label: t('gpu.usage.gpuHours'), value: r => r.gpu_hours },
        { label: t('gpu.usage.homeGbDays'), value: r => r.home_gb_days },
        { label: t('gpu.usage.cpuUsed'), value: r => percent(r.cpu_utilization) },
        { label: t('gpu.usage.cpuUsedHours'), value: r => r.cpu_used_hours, csvOnly: true },
        { label: t('gpu.usage.ramUsedGbHours'), value: r => r.ram_used_gb_hours, csvOnly: true },
    ];

    const download = () => {
        const blob = new Blob([toCSV(columns, rows)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workspace-usage-${scope.replace(':', '-')}-${by}-${period.from}-${period.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const total = report?.total;
    return (
        <Container size="xl" py="md">
            <Paper withBorder p="lg" radius="md">
                <Stack gap="md">
                    <Group justify="space-between" align="center" wrap="wrap">
                        <div>
                            <Title order={4}>{t('gpu.usage.title')}</Title>
                            <Text size="xs" c="dimmed">{t('gpu.usage.hint', period)}</Text>
                        </div>
                        <Group gap="xs" wrap="wrap">
                            {(isAdmin || managed.length > 0) && (
                                <Select size="xs" w={220} value={scope} onChange={(v) => v && setScope(v)} allowDeselect={false}
                                    data={[
                                        { value: 'mine', label: t('gpu.usage.mine') },
                                        ...(isAdmin ? [{ value: 'all', label: t('gpu.usage.all') }] : []),
                                        ...managed.map(p => ({ value: `project:${p.slug}`, label: t('gpu.usage.project', { name: p.name }) })),
                                    ]} />
                            )}
                            <Select size="xs" w={160} value={by} onChange={(v) => v && setBy(v)} allowDeselect={false}
                                data={USAGE_GROUPINGS.map(g => ({ value: g, label: t(`gpu.usage.groupBy.${g}`) }))} />
                            <SegmentedControl size="xs" value={periodKey} onChange={setPeriodKey}
                                data={PERIODS.map(p => ({ value: p, label: t(`projects.consumption.period.${p}`) }))} />
                            <Tooltip label={t('gpu.usage.csvHint')}>
                                <Button size="xs" variant="light" leftSection={<Download size="14" />} onClick={download} disabled={!rows.length}>CSV</Button>
                            </Tooltip>
                        </Group>
                    </Group>
                    {query.isPending ? <Loading size="sm" />
                        : query.isError ? <LoadError query={query} />
                            : !rows.length ? <Text size="sm" c="dimmed">{t('gpu.usage.empty')}</Text>
                                : (
                                    <>
                                        <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
                                            <Stat label={t('gpu.usage.serverHours')} value={num(total.server_hours)} />
                                            <Stat label={t('gpu.usage.vcpuHours')} value={num(total.vcpu_hours)} />
                                            <Stat label={t('gpu.usage.ramGbHours')} value={num(total.ram_gb_hours)} />
                                            <Stat label={t('gpu.usage.gpuHours')} value={num(total.gpu_hours, 1)} />
                                            <Stat label={t('gpu.usage.homeGbDays')} value={num(total.home_gb_days, 1)} />
                                        </SimpleGrid>
                                        <Table.ScrollContainer minWidth={760}>
                                            <Table striped fz="xs">
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        {columns.filter(c => !c.csvOnly).map((c, i) => <Table.Th key={c.label} ta={i ? 'right' : undefined}>{c.label}</Table.Th>)}
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {rows.map(r => (
                                                        <Table.Tr key={r.name || '—'}>
                                                            <Table.Td>{label(r)}</Table.Td>
                                                            <Table.Td ta="right">{r.people}</Table.Td>
                                                            <Table.Td ta="right">{num(r.server_hours, 1)}</Table.Td>
                                                            <Table.Td ta="right">{num(r.vcpu_hours, 1)}</Table.Td>
                                                            <Table.Td ta="right">{num(r.ram_gb_hours, 1)}</Table.Td>
                                                            <Table.Td ta="right">{num(r.gpu_hours, 1)}</Table.Td>
                                                            <Table.Td ta="right">{num(r.home_gb_days, 1)}</Table.Td>
                                                            <Table.Td ta="right">{percent(r.cpu_utilization) === null ? '—' : `${percent(r.cpu_utilization)} %`}</Table.Td>
                                                        </Table.Tr>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>
                                        </Table.ScrollContainer>
                                        <Text size="xs" c="dimmed">{t('gpu.usage.explain')}</Text>
                                    </>
                                )}
                </Stack>
            </Paper>
            {/* GPU use per hour: admins for all (or the chosen project), a project's managers for their project. */}
            {(isAdmin || project) && <Stack mt="md"><GpuHours project={project} /></Stack>}
            {isAdmin && <Stack mt="md"><WorkspaceStorage /></Stack>}
        </Container>
    );
}
