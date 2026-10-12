import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Badge, Button, Checkbox, Container, Group, Modal, MultiSelect, NumberInput, Paper, Progress, Select, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { startLink } from '/projects/start-link.js';
import { useConfirm } from '/providers/confirm.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { formatDate } from '/format-date.js';

// Projects (docs/plan-workspaces.md, W2): through a project people start workspaces; it says who (members), what (profiles, GPU classes, images) and how much at the same time (limits). Admins create and change projects; a project's managers change its description, members and images.
// A project from the budget tree (tree_node set) gets its name, members, end, GPUs per class and its budgets from the tree; here its managers set how it is used — profiles, images, limits per person, shares per person and shorter windows.

const EMPTY = {
    slug: '', name: '', description: '', members: [], profiles: ['cpu'], gpu_classes: [], images: [], free_images: false,
    limits: { servers_per_person: 2, cpu_per_person: 4, ram_gb_per_person: 16, gpus_per_person: 0 }, gpus_by_class: {}, budgets: [], ends_at: null,
};

export function WorkspaceProjects() {
    const { t } = useTranslation();
    const api = useGpuApi();
    const { me, isAdmin } = useLlmMe();
    const confirm = useConfirm();
    const [scope, setScope] = useState('mine');
    const [editing, setEditing] = useState(null); // { project, asAdmin }; projects themselves come only from the budget tree
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
                            {me?.jupyter_url && (
                                <Button size="xs" component="a" href={me.jupyter_url} target="_blank" rel="noreferrer" variant="light" rightSection={<ExternalLink size={14} />}>
                                    {t('gpu.envs.openHub')}
                                </Button>
                            )}
                        </Group>
                    </Group>
                </Paper>

                {projects.isPending ? <Loading /> : projects.isError ? <LoadError query={projects} /> : list.length === 0 ? (
                    <Alert color="gray" variant="light">
                        <Text size="sm">{t('gpu.projects.none')}</Text>
                        <Button size="xs" mt="sm" component="a" href={startLink('aiaas')}>{t('gpu.projects.getOne')}</Button>
                    </Alert>
                ) : (
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {list.map(p => (
                            <Paper key={p.slug} p="md" radius="md" withBorder>
                                <Group justify="space-between" align="flex-start" wrap="nowrap">
                                    <div style={{ minWidth: 0 }}>
                                        <Group gap={6}>
                                            <Title order={5}>{p.name}</Title>
                                            {p.tree_node && <Badge size="xs" variant="light" color="blue" style={{ textTransform: 'none' }}>{t('gpu.projects.managed')}</Badge>}
                                        </Group>
                                        <Text size="xs" c="dimmed" ff="monospace">{p.slug}</Text>
                                    </div>
                                    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                                        <Badge variant="light" color={p.role === 'manager' ? 'blue' : p.role === 'admin' ? 'grape' : 'gray'} style={{ textTransform: 'none' }}>
                                            {t(`gpu.projects.roles.${p.role}`, { defaultValue: p.role })}
                                        </Badge>
                                        {(isAdmin || p.role === 'manager') && (
                                            <ActionIcon variant="subtle" aria-label={t('gpu.projects.edit')}
                                                onClick={() => setEditing({ project: p, asAdmin: isAdmin })}><Pencil size={16} /></ActionIcon>
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
                                <Text size="xs" c="dimmed" mt="sm">{limitsText(t, p.limits, p.gpus_by_class)}</Text>
                                {(p.budget_status ?? []).length > 0 && (
                                    <Stack gap={6} mt="sm">
                                        {p.budget_status.map((b, i) => <BudgetBar key={i} b={b} />)}
                                    </Stack>
                                )}
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

const UNITS = ['vcpu_hours', 'ram_gb_hours', 'gpu_hours', 'server_hours'];
const WINDOWS = ['24h', '7d', '30d', 'total'];

export function budgetText(t, b) {
    const unit = t(`gpu.projects.budget.units.${b.unit}`) + (b.unit === 'gpu_hours' && b.gpu_class ? ` (${b.gpu_class})` : '');
    return t('gpu.projects.budget.line', { amount: b.amount, unit, window: t(`gpu.projects.budget.windows.${b.window}`),
        who: t(b.per_person ? 'gpu.projects.budget.perPerson' : 'gpu.projects.budget.wholeProject') });
}

// One budget with what is used of it — the person's own use for a budget per person. Orange from 80 %, red when used up: the warning before servers are ended.
function BudgetBar({ b }) {
    const { t } = useTranslation();
    const ratio = b.amount > 0 ? b.used / b.amount : 0;
    const color = b.exhausted ? 'red' : ratio >= 0.8 ? 'orange' : 'teal';
    return (
        <div>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs">{budgetText(t, b)}</Text>
                <Text size="xs" c={b.exhausted ? 'red' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>
                    {t('gpu.projects.budget.used', { used: Math.round(b.used * 10) / 10, amount: b.amount })}
                </Text>
            </Group>
            <Progress value={Math.min(100, ratio * 100)} color={color} size="sm" mt={2} />
        </div>
    );
}

export function limitsText(t, l = {}, gpusByClass = {}) {
    const parts = [];
    if (l.servers_per_person) parts.push(t('gpu.projects.limit.servers', { count: l.servers_per_person }));
    if (l.cpu_per_person) parts.push(t('gpu.projects.limit.cpu', { value: l.cpu_per_person }));
    if (l.ram_gb_per_person) parts.push(t('gpu.projects.limit.ram', { value: l.ram_gb_per_person }));
    parts.push(l.gpus_per_person ? t('gpu.projects.limit.gpus', { count: l.gpus_per_person }) : t('gpu.projects.limit.noGpu'));
    const project = Object.entries(gpusByClass || {}).filter(([, n]) => n > 0)
        .map(([c, n]) => t('gpu.projects.limit.projectGpusClass', { count: n, class: c }));
    const text = `${t('gpu.projects.limit.perPerson')}: ${parts.join(' · ')}`;
    return project.length ? `${text} · ${t('gpu.projects.limit.project')}: ${project.join(' · ')}` : text;
}

function ProjectEditor({ project, asAdmin, catalog, onClose }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const [p, setP] = useState(() => ({ ...EMPTY, ...project, limits: { ...EMPTY.limits, ...(project.limits ?? {}) }, gpus_by_class: { ...(project.gpus_by_class ?? {}) } }));
    const set = (k, v) => setP(cur => ({ ...cur, [k]: v }));
    const setLimit = (k, v) => setP(cur => ({ ...cur, limits: { ...cur.limits, [k]: Number(v) || 0 } }));
    const save = useApiMutation({
        mutationFn: () => {
            const { role: _role, budget_status: _status, ...body } = p; // view fields, not part of the project
            return api.updateProject(body);
        },
        invalidates: [['gpu', 'projects']],
        reportErrors: 'inline',
        onSuccess: onClose,
    });
    // From the tree: the tree owns name, members, end, GPUs per class and its budgets; managers set the rest.
    // Otherwise managers change description, members and images only.
    const managed = !!p.tree_node;
    const locked = managed ? false : !asAdmin;
    const treeLocked = managed || !asAdmin;
    const setClassGpus = (c, v) => setP(cur => ({ ...cur, gpus_by_class: { ...cur.gpus_by_class, [c]: Number(v) || 0 } }));

    const members = p.members ?? [];
    const images = p.images ?? [];
    const budgets = p.budgets ?? [];
    const setBudget = (i, patch) => set('budgets', budgets.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    return (
        <Modal opened onClose={onClose} size="lg" centered title={t('gpu.projects.editTitle', { name: project.name })}>
            <Stack gap="sm">
                {managed && <Alert color="blue" variant="light">{t('gpu.projects.managedHint')}</Alert>}
                <Group grow>
                    <TextInput label={t('gpu.projects.slug')} disabled value={p.slug} />
                    <TextInput label={t('gpu.projects.name')} disabled={treeLocked} value={p.name} onChange={e => set('name', e.currentTarget.value)} />
                </Group>
                <Textarea label={t('gpu.projects.description')} autosize minRows={2} value={p.description} onChange={e => set('description', e.currentTarget.value)} />

                <Text size="sm" fw={600}>{t('gpu.projects.members')}</Text>
                {members.map((m, i) => (
                    <Group key={i} gap="xs" wrap="nowrap">
                        <TextInput style={{ flex: 1 }} placeholder="group:wwi23seb · user:a@dhbw.de" value={m.token} disabled={managed}
                            onChange={e => set('members', members.map((x, j) => (j === i ? { ...x, token: e.currentTarget.value.trim() } : x)))} />
                        <Select w={150} allowDeselect={false} value={m.role || 'member'} disabled={managed}
                            data={[{ value: 'member', label: t('gpu.projects.roles.member') }, { value: 'manager', label: t('gpu.projects.roles.manager') }]}
                            onChange={v => set('members', members.map((x, j) => (j === i ? { ...x, role: v } : x)))} />
                        {!managed && <ActionIcon variant="subtle" color="red" aria-label={t('gpu.projects.remove')} onClick={() => set('members', members.filter((_, j) => j !== i))}><X size={16} /></ActionIcon>}
                    </Group>
                ))}
                {!managed && (
                    <Button size="xs" variant="subtle" leftSection={<Plus size={14} />} w="fit-content"
                        onClick={() => set('members', [...members, { token: '', role: 'member' }])}>{t('gpu.projects.addMember')}</Button>
                )}

                <MultiSelect label={t('gpu.projects.profiles')} disabled={locked} value={p.profiles ?? []} onChange={v => set('profiles', v)}
                    data={(catalog?.profiles ?? []).map(x => ({ value: x.slug, label: x.gpu_class ? `${x.name} · ${x.gpu_class}` : x.name }))} />
                <MultiSelect label={t('gpu.projects.gpuClasses')} disabled={treeLocked} value={p.gpu_classes ?? []} onChange={v => set('gpu_classes', v)}
                    data={catalog?.gpuClasses ?? []} />
                <Checkbox label={t('gpu.projects.freeImagesLabel')} description={t('gpu.projects.freeImagesHint')} disabled={locked}
                    checked={!!p.free_images} onChange={e => set('free_images', e.currentTarget.checked)} />

                <Text size="sm" fw={600}>{t('gpu.projects.limits')}</Text>
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                    <NumberInput label={t('gpu.projects.limit.serversShort')} min={0} disabled={locked} value={p.limits.servers_per_person} onChange={v => setLimit('servers_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.cpuShort')} min={0} decimalScale={1} disabled={locked} value={p.limits.cpu_per_person} onChange={v => setLimit('cpu_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.ramShort')} min={0} disabled={locked} value={p.limits.ram_gb_per_person} onChange={v => setLimit('ram_gb_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.gpusShort')} min={0} disabled={locked} value={p.limits.gpus_per_person} onChange={v => setLimit('gpus_per_person', v)} />
                </SimpleGrid>
                {(catalog?.gpuClasses ?? []).length > 0 && (
                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                        {(catalog?.gpuClasses ?? []).map(c => (
                            <NumberInput key={c} label={t('gpu.projects.limit.projectGpusClassShort', { class: c })} min={0} disabled={treeLocked}
                                value={p.gpus_by_class?.[c] ?? 0} onChange={v => setClassGpus(c, v)} />
                        ))}
                    </SimpleGrid>
                )}
                <Text size="xs" c="dimmed">{t('gpu.projects.limitsHint')}</Text>

                <Text size="sm" fw={600}>{t('gpu.projects.budgets')}</Text>
                {budgets.map((b, i) => (
                    <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
                        <NumberInput w={110} min={0} disabled={locked || b.tree} label={i === 0 ? t('gpu.projects.budget.amount') : undefined} value={b.amount}
                            onChange={v => setBudget(i, { amount: Number(v) || 0 })} />
                        <Select w={170} allowDeselect={false} disabled={locked || b.tree} label={i === 0 ? t('gpu.projects.budget.unit') : undefined} value={b.unit}
                            data={UNITS.map(u => ({ value: u, label: t(`gpu.projects.budget.units.${u}`) }))} onChange={v => setBudget(i, { unit: v })} />
                        {b.unit === 'gpu_hours' && (
                            <Select w={110} disabled={locked || b.tree} clearable label={i === 0 ? t('gpu.projects.budget.class') : undefined} value={b.gpu_class || null}
                                placeholder={t('gpu.projects.budget.allClasses')} data={catalog?.gpuClasses ?? []} onChange={v => setBudget(i, { gpu_class: v || '' })} />
                        )}
                        <Select w={130} allowDeselect={false} disabled={locked || b.tree} label={i === 0 ? t('gpu.projects.budget.window') : undefined} value={b.window}
                            data={WINDOWS.map(w => ({ value: w, label: t(`gpu.projects.budget.windows.${w}`) }))} onChange={v => setBudget(i, { window: v })} />
                        {b.tree
                            ? <Badge size="sm" variant="light" color="blue" mb={8} style={{ textTransform: 'none' }}>{t('gpu.projects.budget.fromTree')}</Badge>
                            : <Checkbox disabled={locked} label={t('gpu.projects.budget.perPerson')} checked={!!b.per_person} mb={8}
                                onChange={e => setBudget(i, { per_person: e.currentTarget.checked })} />}
                        {!locked && !b.tree && <ActionIcon variant="subtle" color="red" mb={4} aria-label={t('gpu.projects.remove')} onClick={() => set('budgets', budgets.filter((_, j) => j !== i))}><X size={16} /></ActionIcon>}
                    </Group>
                ))}
                {!locked && (
                    <Button size="xs" variant="subtle" leftSection={<Plus size={14} />} w="fit-content"
                        onClick={() => set('budgets', [...budgets, { unit: 'vcpu_hours', window: '30d', amount: 40, per_person: true }])}>{t('gpu.projects.addBudget')}</Button>
                )}
                <Text size="xs" c="dimmed">{t('gpu.projects.budgetsHint')}</Text>

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

                <TextInput type="date" label={t('gpu.projects.endsAtLabel')} disabled={treeLocked} w={200}
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
