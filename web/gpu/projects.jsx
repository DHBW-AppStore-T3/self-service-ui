import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Badge, Button, Checkbox, Container, Group, Modal, MultiSelect, NumberInput, Paper, Select, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { formatDate } from '/format-date.js';

// Projects (docs/plan-workspaces.md, W2): through a project people start workspaces; it says who (members), what (profiles, GPU classes, images) and how much at the same time (limits). Admins create and change projects; a project's managers change its description, members and images.

const EMPTY = {
    slug: '', name: '', description: '', members: [], profiles: ['cpu'], gpu_classes: [], images: [], free_images: false,
    limits: { servers_per_person: 2, cpu_per_person: 4, ram_gb_per_person: 16, gpus_per_person: 0, gpus: 0 }, budgets: [], ends_at: null,
};

export function WorkspaceProjects() {
    const { t } = useTranslation();
    const api = useGpuApi();
    const { me, isAdmin } = useLlmMe();
    const confirm = useConfirm();
    const [scope, setScope] = useState('mine');
    const [editing, setEditing] = useState(null); // { project, isNew, asAdmin }
    const all = isAdmin && scope === 'all';

    const projects = useQuery({ queryKey: gpuKeys.projects(all), queryFn: () => api.listProjects(all) });
    const catalog = useQuery({ queryKey: gpuKeys.catalog(), queryFn: () => api.catalog(), staleTime: 10 * 60 * 1000 });
    const remove = useApiMutation({ mutationFn: (slug) => api.deleteProject(slug), invalidates: [['gpu', 'projects']] });

    async function onDelete(p) {
        const ok = await confirm({
            title: t('gpu.projects.deleteTitle'),
            confirmLabel: t('gpu.projects.deleteConfirm'),
            message: t('gpu.projects.deleteMessage', { name: p.name }),
        });
        if (ok) remove.mutate(p.slug);
    }

    const profileName = (slug) => catalog.data?.profiles?.find(p => p.slug === slug)?.name ?? slug;
    const list = projects.data ?? [];

    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <Paper p="lg" radius="md" withBorder>
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                        <div style={{ maxWidth: 640 }}>
                            <Title order={3}>{t('gpu.projects.title')}</Title>
                            <Text size="sm" c="dimmed" mt={4}>{t('gpu.projects.intro')}</Text>
                        </div>
                        <Group gap="xs">
                            {isAdmin && (
                                <SegmentedControl size="xs" value={scope} onChange={setScope}
                                    data={[{ value: 'mine', label: t('gpu.projects.mine') }, { value: 'all', label: t('gpu.projects.all') }]} />
                            )}
                            {isAdmin && (
                                <Button size="xs" leftSection={<Plus size={14} />} onClick={() => setEditing({ project: EMPTY, isNew: true, asAdmin: true })}>
                                    {t('gpu.projects.new')}
                                </Button>
                            )}
                            {me?.jupyter_url && (
                                <Button size="xs" component="a" href={me.jupyter_url} target="_blank" rel="noreferrer" variant="light" rightSection={<ExternalLink size={14} />}>
                                    {t('gpu.envs.openHub')}
                                </Button>
                            )}
                        </Group>
                    </Group>
                </Paper>

                {projects.isPending ? <Loading /> : projects.isError ? <LoadError query={projects} /> : list.length === 0 ? (
                    <Alert color="gray" variant="light">{t(isAdmin ? 'gpu.projects.noneAdmin' : 'gpu.projects.none')}</Alert>
                ) : (
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {list.map(p => (
                            <Paper key={p.slug} p="md" radius="md" withBorder>
                                <Group justify="space-between" align="flex-start" wrap="nowrap">
                                    <div>
                                        <Title order={5}>{p.name}</Title>
                                        <Text size="xs" c="dimmed" ff="monospace">{p.slug}</Text>
                                    </div>
                                    <Group gap={4} wrap="nowrap">
                                        <Badge variant="light" color={p.role === 'manager' ? 'blue' : p.role === 'admin' ? 'grape' : 'gray'} style={{ textTransform: 'none' }}>
                                            {t(`gpu.projects.roles.${p.role}`, { defaultValue: p.role })}
                                        </Badge>
                                        {(isAdmin || p.role === 'manager') && (
                                            <ActionIcon variant="subtle" aria-label={t('gpu.projects.edit')}
                                                onClick={() => setEditing({ project: p, isNew: false, asAdmin: isAdmin })}><Pencil size={16} /></ActionIcon>
                                        )}
                                        {isAdmin && (
                                            <ActionIcon variant="subtle" color="red" aria-label={t('gpu.projects.delete')} onClick={() => onDelete(p)}><Trash2 size={16} /></ActionIcon>
                                        )}
                                    </Group>
                                </Group>
                                {p.description && <Text size="sm" mt="xs">{p.description}</Text>}
                                <Group gap={4} mt="sm">
                                    {(p.profiles ?? []).map(s => <Badge key={s} variant="outline" color="gray" size="sm" style={{ textTransform: 'none' }}>{profileName(s)}</Badge>)}
                                    {(p.gpu_classes ?? []).map(c => <Badge key={c} variant="light" color="grape" size="sm" style={{ textTransform: 'none' }}>GPU {c}</Badge>)}
                                    {p.free_images && <Badge variant="light" color="orange" size="sm" style={{ textTransform: 'none' }}>{t('gpu.projects.freeImages')}</Badge>}
                                </Group>
                                <Text size="xs" c="dimmed" mt="sm">{limitsText(t, p.limits)}</Text>
                                {(p.images ?? []).length > 0 && (
                                    <Text size="xs" c="dimmed" mt={4}>{t('gpu.projects.imagesCount', { count: p.images.length })}</Text>
                                )}
                                <Text size="xs" c="dimmed" mt={4}>
                                    {t('gpu.projects.membersCount', { count: (p.members ?? []).length })}
                                    {p.ends_at && <> · {t('gpu.projects.endsAt', { date: formatDate(p.ends_at) })}</>}
                                </Text>
                            </Paper>
                        ))}
                    </SimpleGrid>
                )}
            </Stack>

            {editing && (
                <ProjectEditor key={editing.project.slug || 'new'} {...editing} catalog={catalog.data} onClose={() => setEditing(null)} />
            )}
        </Container>
    );
}

export function limitsText(t, l = {}) {
    const parts = [];
    if (l.servers_per_person) parts.push(t('gpu.projects.limit.servers', { count: l.servers_per_person }));
    if (l.cpu_per_person) parts.push(t('gpu.projects.limit.cpu', { value: l.cpu_per_person }));
    if (l.ram_gb_per_person) parts.push(t('gpu.projects.limit.ram', { value: l.ram_gb_per_person }));
    parts.push(l.gpus_per_person ? t('gpu.projects.limit.gpus', { count: l.gpus_per_person }) : t('gpu.projects.limit.noGpu'));
    if (l.gpus) parts.push(t('gpu.projects.limit.projectGpus', { count: l.gpus }));
    return `${t('gpu.projects.limit.perPerson')}: ${parts.join(' · ')}`;
}

function ProjectEditor({ project, isNew, asAdmin, catalog, onClose }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const [p, setP] = useState(() => ({ ...EMPTY, ...project, limits: { ...EMPTY.limits, ...(project.limits ?? {}) } }));
    const set = (k, v) => setP(cur => ({ ...cur, [k]: v }));
    const setLimit = (k, v) => setP(cur => ({ ...cur, limits: { ...cur.limits, [k]: Number(v) || 0 } }));
    const save = useApiMutation({
        mutationFn: () => (isNew ? api.createProject(p) : api.updateProject(p)),
        invalidates: [['gpu', 'projects']],
        reportErrors: 'inline',
        onSuccess: onClose,
    });
    const locked = !asAdmin; // managers: description, members, images only

    const members = p.members ?? [];
    const images = p.images ?? [];
    return (
        <Modal opened onClose={onClose} size="lg" centered title={isNew ? t('gpu.projects.new') : t('gpu.projects.editTitle', { name: project.name })}>
            <Stack gap="sm">
                <Group grow>
                    <TextInput label={t('gpu.projects.slug')} description={t('gpu.projects.slugHint')} disabled={!isNew}
                        value={p.slug} onChange={e => set('slug', e.currentTarget.value.toLowerCase())} />
                    <TextInput label={t('gpu.projects.name')} disabled={locked} value={p.name} onChange={e => set('name', e.currentTarget.value)} />
                </Group>
                <Textarea label={t('gpu.projects.description')} autosize minRows={2} value={p.description} onChange={e => set('description', e.currentTarget.value)} />

                <Text size="sm" fw={600}>{t('gpu.projects.members')}</Text>
                {members.map((m, i) => (
                    <Group key={i} gap="xs" wrap="nowrap">
                        <TextInput style={{ flex: 1 }} placeholder="group:wwi23seb · user:a@dhbw.de" value={m.token}
                            onChange={e => set('members', members.map((x, j) => (j === i ? { ...x, token: e.currentTarget.value.trim() } : x)))} />
                        <Select w={150} allowDeselect={false} value={m.role || 'member'}
                            data={[{ value: 'member', label: t('gpu.projects.roles.member') }, { value: 'manager', label: t('gpu.projects.roles.manager') }]}
                            onChange={v => set('members', members.map((x, j) => (j === i ? { ...x, role: v } : x)))} />
                        <ActionIcon variant="subtle" color="red" aria-label={t('gpu.projects.remove')} onClick={() => set('members', members.filter((_, j) => j !== i))}><X size={16} /></ActionIcon>
                    </Group>
                ))}
                <Button size="xs" variant="subtle" leftSection={<Plus size={14} />} w="fit-content"
                    onClick={() => set('members', [...members, { token: '', role: 'member' }])}>{t('gpu.projects.addMember')}</Button>

                <MultiSelect label={t('gpu.projects.profiles')} disabled={locked} value={p.profiles ?? []} onChange={v => set('profiles', v)}
                    data={(catalog?.profiles ?? []).map(x => ({ value: x.slug, label: x.gpu_class ? `${x.name} · ${x.gpu_class}` : x.name }))} />
                <MultiSelect label={t('gpu.projects.gpuClasses')} disabled={locked} value={p.gpu_classes ?? []} onChange={v => set('gpu_classes', v)}
                    data={catalog?.gpuClasses ?? []} />
                <Checkbox label={t('gpu.projects.freeImagesLabel')} description={t('gpu.projects.freeImagesHint')} disabled={locked}
                    checked={!!p.free_images} onChange={e => set('free_images', e.currentTarget.checked)} />

                <Text size="sm" fw={600}>{t('gpu.projects.limits')}</Text>
                <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="xs">
                    <NumberInput label={t('gpu.projects.limit.serversShort')} min={0} disabled={locked} value={p.limits.servers_per_person} onChange={v => setLimit('servers_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.cpuShort')} min={0} decimalScale={1} disabled={locked} value={p.limits.cpu_per_person} onChange={v => setLimit('cpu_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.ramShort')} min={0} disabled={locked} value={p.limits.ram_gb_per_person} onChange={v => setLimit('ram_gb_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.gpusShort')} min={0} disabled={locked} value={p.limits.gpus_per_person} onChange={v => setLimit('gpus_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.projectGpusShort')} min={0} disabled={locked} value={p.limits.gpus} onChange={v => setLimit('gpus', v)} />
                </SimpleGrid>
                <Text size="xs" c="dimmed">{t('gpu.projects.limitsHint')}</Text>

                <Text size="sm" fw={600}>{t('gpu.projects.images')}</Text>
                {images.map((im, i) => (
                    <Group key={i} gap="xs" wrap="nowrap">
                        <TextInput w={180} placeholder={t('gpu.projects.imageName')} value={im.name}
                            onChange={e => set('images', images.map((x, j) => (j === i ? { ...x, name: e.currentTarget.value } : x)))} />
                        <TextInput style={{ flex: 1 }} placeholder="registry.gpu.services.dhbw.cloud/envs/…:…" value={im.image}
                            onChange={e => set('images', images.map((x, j) => (j === i ? { ...x, image: e.currentTarget.value.trim() } : x)))} />
                        <ActionIcon variant="subtle" color="red" aria-label={t('gpu.projects.remove')} onClick={() => set('images', images.filter((_, j) => j !== i))}><X size={16} /></ActionIcon>
                    </Group>
                ))}
                <Button size="xs" variant="subtle" leftSection={<Plus size={14} />} w="fit-content"
                    onClick={() => set('images', [...images, { name: '', image: '' }])}>{t('gpu.projects.addImage')}</Button>

                <TextInput type="date" label={t('gpu.projects.endsAtLabel')} disabled={locked} w={200}
                    value={p.ends_at ? p.ends_at.slice(0, 10) : ''} onChange={e => set('ends_at', e.currentTarget.value ? `${e.currentTarget.value}T00:00:00Z` : null)} />

                {save.error && <Alert color="red" variant="light">{save.error.message}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>{t('gpu.projects.cancel')}</Button>
                    <Button loading={save.isPending} disabled={!p.slug} onClick={() => save.mutate()}>{t('gpu.projects.save')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
