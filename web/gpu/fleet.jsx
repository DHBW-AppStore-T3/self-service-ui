import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Container, Group, Paper, Select, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useTranslation } from 'react-i18next';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';

// For admins: the GPU administration (llm-management-api, /v1/gpu/fleet; docs/bauplan.md 10.13). Every GPU node is put into a pool (who the GPUs are for) and a tier (how large they are); the combination is a GPU class, which the tree grants (ws-gpus-<class>, ws-gpu-hours-<class>) and a start chooses. A node without pool runs nothing. New GPUs of an existing class need nothing in the tree.

const day = (iso) => (iso ? iso.slice(0, 10) : null);

function Section({ title, hint, children }) {
    return (
        <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
                <div>
                    <Title order={4}>{title}</Title>
                    {hint && <Text size="xs" c="dimmed">{hint}</Text>}
                </div>
                {children}
            </Stack>
        </Paper>
    );
}

// One node: its pool, tier and end, saved together.
function NodeRow({ node, pools, tiers, models, tierModels, onSave, saving }) {
    const { t } = useTranslation();
    const a = node.assignment;
    const initial = { pool: a?.pool ?? '', tier: a?.tier ?? node.suggested_tier, until: day(a?.available_until), model: a?.gap_model ?? '' };
    const [draft, setDraft] = useState(initial);
    const dirty = draft.pool !== initial.pool || (draft.pool && (draft.tier !== initial.tier || draft.model !== initial.model)) || draft.until !== initial.until;
    const save = () => onSave(node.name, {
        pool: draft.pool, tier: draft.pool ? draft.tier : '',
        available_until: draft.pool && draft.until ? `${draft.until}T23:59:59Z` : undefined, gap_model: draft.pool ? draft.model : '',
    });
    return (
        <Table.Tr>
            <Table.Td>
                <Text size="sm" fw={500}>{node.name}</Text>
                <Text size="xs" c="dimmed">{node.product || t('gpu.fleet.unknownType')}{node.memory_gb ? ` · ${Math.round(node.memory_gb)} GB` : ''} · {t('gpu.fleet.gpus', { count: node.gpus ?? 0 })}</Text>
            </Table.Td>
            <Table.Td>
                {node.ready ? <Badge color="teal" variant="light">{t('gpu.fleet.ready')}</Badge> : <Badge color="gray" variant="light">{t('gpu.fleet.notReady')}</Badge>}
            </Table.Td>
            <Table.Td>
                <Select size="xs" w={170} allowDeselect={false} value={draft.pool}
                    data={[{ value: '', label: t('gpu.fleet.unassigned') }, ...pools.map(p => ({ value: p.id, label: p.name }))]}
                    onChange={v => setDraft({ ...draft, pool: v ?? '' })} aria-label={t('gpu.fleet.pool')} />
            </Table.Td>
            <Table.Td>
                <Select size="xs" w={110} allowDeselect={false} disabled={!draft.pool} value={draft.tier}
                    data={tiers.map(x => ({ value: x.id, label: x.id === node.suggested_tier ? `${x.name} ${t('gpu.fleet.suggested')}` : x.name }))}
                    onChange={v => setDraft({ ...draft, tier: v })} aria-label={t('gpu.fleet.tier')} />
            </Table.Td>
            <Table.Td>
                <DateInput size="xs" w={140} clearable disabled={!draft.pool} valueFormat="DD.MM.YYYY" placeholder={t('gpu.fleet.permanent')}
                    value={draft.until} onChange={v => setDraft({ ...draft, until: v || null })} aria-label={t('gpu.fleet.until')} />
            </Table.Td>
            <Table.Td>
                <Select size="xs" w={190} allowDeselect={false} disabled={!draft.pool} value={draft.model} aria-label={t('gpu.fleet.gapModel')}
                    data={[
                        { value: '', label: t('gpu.fleet.gapDefault', { model: tierModels?.[draft.tier] || '—' }) },
                        // Only what fits the node's GPU memory (the catalogue's "from GB"); the one chosen before stays listed.
                        ...models.filter(m => !node.memory_gb || (m.min_gb || 0) <= node.memory_gb || m.key === draft.model).map(m => ({ value: m.key, label: m.category ? `${m.key} · ${t(`llm.models.categories.${m.category}`)}` : m.key })),
                        { value: '-', label: t('gpu.fleet.gapNone') },
                    ]}
                    onChange={v => setDraft({ ...draft, model: v ?? '' })} />
            </Table.Td>
            <Table.Td>
                <Button size="xs" disabled={!dirty} loading={saving} onClick={save}>{t('gpu.fleet.save')}</Button>
            </Table.Td>
        </Table.Tr>
    );
}

function PoolForm({ onSave, saving }) {
    const { t } = useTranslation();
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    return (
        <Group gap="xs" align="flex-end">
            <TextInput size="xs" w={140} label={t('gpu.fleet.poolId')} description={t('gpu.fleet.poolIdHint')} value={id} onChange={e => setId(e.currentTarget.value.toLowerCase())} />
            <TextInput size="xs" w={240} label={t('gpu.fleet.poolName')} value={name} onChange={e => setName(e.currentTarget.value)} />
            <Button size="xs" variant="light" disabled={!id || !name} loading={saving}
                onClick={() => onSave(id, { name, lend: false }).then(() => { setId(''); setName(''); })}>{t('gpu.fleet.addPool')}</Button>
        </Group>
    );
}

export function GpuFleet() {
    const { t } = useTranslation();
    const { isAdmin } = useLlmMe();
    const api = useGpuApi();
    const qc = useQueryClient();
    const query = useQuery({ queryKey: gpuKeys.fleet(), queryFn: api.fleet, enabled: isAdmin, refetchInterval: 30000 });
    const [error, setError] = useState('');
    const done = (data) => { setError(''); qc.setQueryData(gpuKeys.fleet(), data); qc.invalidateQueries({ queryKey: gpuKeys.catalog() }); };
    const fail = (e) => setError(e?.message || String(e));
    const assign = useMutation({ mutationFn: ({ name, body }) => api.assignNode(name, body), onSuccess: done, onError: fail });
    const savePool = useMutation({ mutationFn: ({ id, body }) => api.savePool(id, body), onSuccess: done, onError: fail });
    const deletePool = useMutation({ mutationFn: (id) => api.deletePool(id), onSuccess: done, onError: fail });

    if (!isAdmin) return <Container size="md" py="md"><Alert color="gray" variant="light">{t('gpu.noAccess.page')}</Alert></Container>;
    if (query.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (query.isError) return <Container size="lg" py="md"><LoadError query={query} /></Container>;
    const { nodes = [], pools = [], tiers = [], classes = [], models = [], tier_models: tierModels = {} } = query.data ?? {};
    const usedPools = new Set(classes.map(c => c.pool));

    return (
        <Container size="lg" py="md">
            <Stack gap="md">
                <div>
                    <Title order={2}>{t('gpu.fleet.title')}</Title>
                    <Text size="sm" c="dimmed">{t('gpu.fleet.intro')}</Text>
                </div>
                {error && <Alert color="red" variant="light" withCloseButton onClose={() => setError('')}>{error}</Alert>}

                <Section title={t('gpu.fleet.classes')} hint={t('gpu.fleet.classesHint')}>
                    <Table>
                        <Table.Thead><Table.Tr>
                            <Table.Th>{t('gpu.fleet.class')}</Table.Th><Table.Th>{t('gpu.fleet.nodes')}</Table.Th><Table.Th>{t('gpu.fleet.gpusNow')}</Table.Th><Table.Th>{t('gpu.fleet.types')}</Table.Th><Table.Th>{t('gpu.fleet.resources')}</Table.Th>
                        </Table.Tr></Table.Thead>
                        <Table.Tbody>
                            {classes.map(c => (
                                <Table.Tr key={c.id}>
                                    <Table.Td><Badge variant="light" color="gray" size="lg" tt="none">{c.name}</Badge></Table.Td>
                                    <Table.Td>{c.nodes}</Table.Td>
                                    <Table.Td>{c.gpus}</Table.Td>
                                    <Table.Td><Text size="xs">{c.products || '—'}</Text></Table.Td>
                                    <Table.Td><Text size="xs" c="dimmed" ff="monospace">ws-gpus-{c.id}, ws-gpu-hours-{c.id}</Text></Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Section>

                <Section title={t('gpu.fleet.nodesTitle')} hint={t('gpu.fleet.nodesHint')}>
                    {nodes.length === 0 ? <Text size="sm" c="dimmed">{t('gpu.fleet.noNodes')}</Text> : (
                        <Table>
                            <Table.Thead><Table.Tr>
                                <Table.Th>{t('gpu.fleet.node')}</Table.Th><Table.Th>{t('gpu.fleet.state')}</Table.Th><Table.Th>{t('gpu.fleet.pool')}</Table.Th><Table.Th>{t('gpu.fleet.tier')}</Table.Th><Table.Th>{t('gpu.fleet.until')}</Table.Th><Table.Th>{t('gpu.fleet.gapModel')}</Table.Th><Table.Th />
                            </Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {nodes.map(n => (
                                    // Keyed by the saved assignment: after a save the row starts again from what is stored.
                                    <NodeRow key={`${n.name}:${n.assignment?.updated_at ?? ''}`} node={n} pools={pools} tiers={tiers} models={models} tierModels={tierModels} saving={assign.isPending && assign.variables?.name === n.name}
                                        onSave={(name, body) => assign.mutate({ name, body })} />
                                ))}
                            </Table.Tbody>
                        </Table>
                    )}
                </Section>

                <Section title={t('gpu.fleet.pools')} hint={t('gpu.fleet.poolsHint')}>
                    <Table>
                        <Table.Tbody>
                            {pools.map(p => (
                                <Table.Tr key={p.id}>
                                    <Table.Td><Text size="sm" fw={500}>{p.name}</Text></Table.Td>
                                    <Table.Td><Text size="xs" c="dimmed" ff="monospace">{p.id}</Text></Table.Td>
                                    <Table.Td>
                                        <Switch size="xs" checked={!!p.lend} label={t('gpu.fleet.lend')} disabled={savePool.isPending}
                                            onChange={e => savePool.mutate({ id: p.id, body: { name: p.name, lend: e.currentTarget.checked } })} />
                                    </Table.Td>
                                    <Table.Td align="right">
                                        {!usedPools.has(p.id) && p.id !== 'allgemein' && (
                                            <Button size="xs" variant="subtle" color="red" loading={deletePool.isPending && deletePool.variables === p.id}
                                                onClick={() => deletePool.mutate(p.id)}>{t('gpu.fleet.deletePool')}</Button>
                                        )}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                    <PoolForm saving={savePool.isPending} onSave={(id, body) => savePool.mutateAsync({ id, body })} />
                </Section>
            </Stack>
        </Container>
    );
}
