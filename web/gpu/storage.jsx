import { useQuery } from '@tanstack/react-query';
import { Group, Paper, Progress, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';

// For admins: how full the workspace storage is (llm-management-api, GET /v1/workspaces/storage). The directories of the JuiceFS file system — one volume per project with storage, plus homes from before the projects — and the memory of the Valkey that holds the file system's metadata: Valkey keeps everything in RAM, so the node's memory is what runs out first. Both are reported hourly.

const GIB = 1024 ** 3;

const gb = (v, digits = 1) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits });

// valkeyShare: the metadata's memory against its limit — maxmemory when set, else the node's RAM.
export function valkeyShare(valkey) {
    if (!valkey) return null;
    const limit = valkey.max_bytes || valkey.system_bytes;
    return limit ? Math.min(100, (valkey.used_bytes / limit) * 100) : null;
}

const shareColor = (pct) => (pct >= 80 ? 'red' : pct >= 60 ? 'orange' : 'teal');

function when(t, iso) {
    return iso ? new Date(iso).toLocaleString() : t('gpu.storage.never');
}

export function WorkspaceStorage() {
    const { t } = useTranslation();
    const api = useGpuApi();
    const query = useQuery({ queryKey: gpuKeys.storage(), queryFn: api.storage, staleTime: 5 * 60 * 1000 });
    const r = query.data;
    const share = valkeyShare(r?.valkey);
    return (
        <Paper withBorder p="lg" radius="md">
            <Stack gap="md">
                <div>
                    <Title order={4}>{t('gpu.storage.title')}</Title>
                    <Text size="xs" c="dimmed">{t('gpu.storage.hint')}</Text>
                </div>
                {query.isPending ? <Loading size="sm" />
                    : query.isError ? <LoadError query={query} />
                        : (
                            <>
                                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                                    <Stack gap={4}>
                                        <Text size="xs" c="dimmed">{t('gpu.storage.files')}</Text>
                                        <Text size="lg" fw={600}>{gb(r.used_gib)} GB</Text>
                                        <Text size="xs" c="dimmed">{t('gpu.storage.asOf', { when: when(t, r.dirs_at) })}</Text>
                                    </Stack>
                                    <Stack gap={4}>
                                        <Text size="xs" c="dimmed">{t('gpu.storage.metadata')}</Text>
                                        {r.valkey ? (
                                            <>
                                                <Group gap="xs" align="baseline">
                                                    <Text size="lg" fw={600}>{gb(r.valkey.used_bytes / GIB, 2)} GB</Text>
                                                    <Text size="xs" c="dimmed">{t(r.valkey.max_bytes ? 'gpu.storage.ofMax' : 'gpu.storage.ofNode', { total: gb((r.valkey.max_bytes || r.valkey.system_bytes) / GIB), peak: gb(r.valkey.peak_bytes / GIB, 2) })}</Text>
                                                </Group>
                                                {share !== null && <Progress value={Math.max(share, 1)} color={shareColor(share)} size="sm" aria-label={t('gpu.storage.metadata')} />}
                                                <Text size="xs" c="dimmed">{t('gpu.storage.asOf', { when: when(t, r.valkey_at) })}</Text>
                                            </>
                                        ) : <Text size="sm" c="dimmed">{t('gpu.storage.noReport')}</Text>}
                                    </Stack>
                                </SimpleGrid>
                                {!r.dirs.length ? <Text size="sm" c="dimmed">{t('gpu.storage.noReport')}</Text> : (
                                    <Table.ScrollContainer minWidth={640}>
                                        <Table striped fz="xs">
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th>{t('gpu.storage.dir')}</Table.Th>
                                                    <Table.Th ta="right">{t('gpu.storage.used')}</Table.Th>
                                                    <Table.Th ta="right">{t('gpu.storage.quota')}</Table.Th>
                                                    <Table.Th ta="right">{t('gpu.storage.share')}</Table.Th>
                                                    <Table.Th ta="right">{t('gpu.storage.inodes')}</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {r.dirs.map(d => {
                                                    const pct = d.quota_gib ? (d.used_gib / d.quota_gib) * 100 : null;
                                                    return (
                                                        <Table.Tr key={d.dir}>
                                                            <Table.Td>
                                                                <Text size="xs" fw={d.project ? 500 : undefined}>{d.project ? (d.name || t('gpu.storage.goneProject')) : t('gpu.storage.otherDir')}</Text>
                                                                <Text size="xs" c="dimmed" ff="monospace">{d.dir}</Text>
                                                            </Table.Td>
                                                            <Table.Td ta="right">{gb(d.used_gib, 2)}</Table.Td>
                                                            <Table.Td ta="right">{d.quota_gib ? gb(d.quota_gib, 0) : '—'}</Table.Td>
                                                            <Table.Td ta="right"><Text size="xs" c={pct !== null && pct >= 90 ? 'red' : undefined}>{pct === null ? '—' : `${Math.round(pct)} %`}</Text></Table.Td>
                                                            <Table.Td ta="right">{d.inodes ? d.inodes.toLocaleString() : '—'}</Table.Td>
                                                        </Table.Tr>
                                                    );
                                                })}
                                            </Table.Tbody>
                                        </Table>
                                    </Table.ScrollContainer>
                                )}
                                <Text size="xs" c="dimmed">{t('gpu.storage.explain')}</Text>
                            </>
                        )}
            </Stack>
        </Paper>
    );
}
