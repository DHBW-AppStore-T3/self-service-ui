import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Badge, Button, Checkbox, Group, Modal, MultiSelect, NumberInput, Progress, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { Plus, SlidersHorizontal, X } from 'lucide-react';
import { useApiMutation } from '/helper/query-state.jsx';
import { llmEnabled } from '/features.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';

// How a Lab/KI project's workspaces are used — profiles, images, limits and shares per person, shorter windows. Everything else about the project (name, members, end, quotas) is the project's own and edited in its dialog; this is the one part only the AI service knows, so it opens from the project card (card-project.jsx) instead of a second list of the same projects.

const UNITS = ['vcpu_hours', 'ram_gb_hours', 'gpu_hours', 'server_hours'];
const WINDOWS = ['24h', '7d', '30d', 'total'];
const DEFAULT_LIMITS = { servers_per_person: 2, cpu_per_person: 4, ram_gb_per_person: 16, gpus_per_person: 0 };

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

// WorkspaceSettingsButton sits among a project card's actions. It draws nothing unless the AI service knows the project (a Lab/KI project with workspaces) and the caller manages it there.
export function WorkspaceSettingsButton({ nodeId }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const { isAdmin } = useLlmMe();
    const [open, setOpen] = useState(false);
    const projects = useQuery({
        queryKey: gpuKeys.projects(false),
        queryFn: () => api.listProjects(false),
        enabled: llmEnabled,
        staleTime: 60 * 1000,
    });
    const project = (projects.data ?? []).find(p => p.tree_node === nodeId);
    if (!project || !(isAdmin || project.role === 'manager' || project.role === 'admin')) return null;
    return (
        <>
            <Button variant="light" size="xs" onClick={() => setOpen(true)}>
                <SlidersHorizontal size="13" style={{ marginRight: 4 }} />{t('gpu.projects.settings')}
            </Button>
            {open && <WorkspaceSettings key={project.slug} project={project} onClose={() => setOpen(false)} />}
        </>
    );
}

function WorkspaceSettings({ project, onClose }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const catalog = useQuery({ queryKey: gpuKeys.catalog(), queryFn: () => api.catalog(), staleTime: 10 * 60 * 1000 });
    const [p, setP] = useState(() => ({ ...project, limits: { ...DEFAULT_LIMITS, ...(project.limits ?? {}) } }));
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

    const images = p.images ?? [];
    const budgets = p.budgets ?? [];
    const status = project.budget_status ?? [];
    const setBudget = (i, patch) => set('budgets', budgets.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    return (
        <Modal opened onClose={onClose} size="lg" centered title={t('gpu.projects.editTitle', { name: project.name })}>
            <Stack gap="sm">
                <Text size="sm" c="dimmed">{t('gpu.projects.settingsIntro')}</Text>
                {status.length > 0 && <Stack gap={6}>{status.map((b, i) => <BudgetBar key={i} b={b} />)}</Stack>}

                <MultiSelect label={t('gpu.projects.profiles')} value={p.profiles ?? []} onChange={v => set('profiles', v)}
                    data={(catalog.data?.profiles ?? []).map(x => ({ value: x.slug, label: x.gpu_class ? `${x.name} · ${x.gpu_class}` : x.name }))} />
                <Checkbox label={t('gpu.projects.freeImagesLabel')} description={t('gpu.projects.freeImagesHint')}
                    checked={!!p.free_images} onChange={e => set('free_images', e.currentTarget.checked)} />

                <Text size="sm" fw={600}>{t('gpu.projects.limits')}</Text>
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                    <NumberInput label={t('gpu.projects.limit.serversShort')} min={0} value={p.limits.servers_per_person} onChange={v => setLimit('servers_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.cpuShort')} min={0} decimalScale={1} value={p.limits.cpu_per_person} onChange={v => setLimit('cpu_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.ramShort')} min={0} value={p.limits.ram_gb_per_person} onChange={v => setLimit('ram_gb_per_person', v)} />
                    <NumberInput label={t('gpu.projects.limit.gpusShort')} min={0} value={p.limits.gpus_per_person} onChange={v => setLimit('gpus_per_person', v)} />
                </SimpleGrid>
                <Text size="xs" c="dimmed">{t('gpu.projects.limitsHint')}</Text>

                <Text size="sm" fw={600}>{t('gpu.projects.budgets')}</Text>
                {budgets.map((b, i) => (
                    <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
                        <NumberInput w={110} min={0} disabled={b.tree} label={i === 0 ? t('gpu.projects.budget.amount') : undefined} value={b.amount}
                            onChange={v => setBudget(i, { amount: Number(v) || 0 })} />
                        <Select w={170} allowDeselect={false} disabled={b.tree} label={i === 0 ? t('gpu.projects.budget.unit') : undefined} value={b.unit}
                            data={UNITS.map(u => ({ value: u, label: t(`gpu.projects.budget.units.${u}`) }))} onChange={v => setBudget(i, { unit: v })} />
                        {b.unit === 'gpu_hours' && (
                            <Select w={110} disabled={b.tree} clearable label={i === 0 ? t('gpu.projects.budget.class') : undefined} value={b.gpu_class || null}
                                placeholder={t('gpu.projects.budget.allClasses')} data={catalog.data?.gpuClasses ?? []} onChange={v => setBudget(i, { gpu_class: v || '' })} />
                        )}
                        <Select w={130} allowDeselect={false} disabled={b.tree} label={i === 0 ? t('gpu.projects.budget.window') : undefined} value={b.window}
                            data={WINDOWS.map(w => ({ value: w, label: t(`gpu.projects.budget.windows.${w}`) }))} onChange={v => setBudget(i, { window: v })} />
                        {b.tree
                            ? <Badge size="sm" variant="light" color="blue" mb={8} style={{ textTransform: 'none' }}>{t('gpu.projects.budget.fromTree')}</Badge>
                            : <Checkbox label={t('gpu.projects.budget.perPerson')} checked={!!b.per_person} mb={8}
                                onChange={e => setBudget(i, { per_person: e.currentTarget.checked })} />}
                        {!b.tree && <ActionIcon variant="subtle" color="red" mb={4} aria-label={t('gpu.projects.remove')} onClick={() => set('budgets', budgets.filter((_, j) => j !== i))}><X size={16} /></ActionIcon>}
                    </Group>
                ))}
                <Button size="xs" variant="subtle" leftSection={<Plus size={14} />} w="fit-content"
                    onClick={() => set('budgets', [...budgets, { unit: 'vcpu_hours', window: '30d', amount: 40, per_person: true }])}>{t('gpu.projects.addBudget')}</Button>
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

                {save.error && <Alert color="red" variant="light">{save.error.message}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>{t('gpu.projects.cancel')}</Button>
                    <Button loading={save.isPending} onClick={() => save.mutate()}>{t('gpu.projects.save')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
