import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Autocomplete, Badge, Button, Checkbox, Group, MultiSelect, NumberInput, Progress, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { Plus, X } from 'lucide-react';
import { llmEnabled } from '/features.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';

// How a Lab/KI project's workspaces are used — profiles, images, limits and shares per person, shorter windows. Everything else about the project (name, members, end, quotas) is the project's own and edited in its dialog; this is the one part only the AI service knows, so it is a tab of the project's edit dialog (modal-project-form.jsx) instead of a second list of the same projects.

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

// useWorkspaceSettings is the draft of a project's workspace settings for its edit dialog (modal-project-form.jsx), next to the tree's own fields: available once the AI service knows the project and the caller manages it there; changed and save() let the dialog's one Save button apply it like its other parts — at once, it needs no approval.
export function useWorkspaceSettings(nodeId, active) {
    const api = useGpuApi();
    const queryClient = useQueryClient();
    const { isAdmin } = useLlmMe();
    const projects = useQuery({
        queryKey: gpuKeys.projects(false),
        queryFn: () => api.listProjects(false),
        enabled: llmEnabled && active && !!nodeId,
        staleTime: 60 * 1000,
    });
    const project = (projects.data ?? []).find(p => p.tree_node === nodeId) ?? null;
    const available = !!project && (isAdmin || project.role === 'manager' || project.role === 'admin');
    const [draft, setDraft] = useState(null);
    const initial = project ? editable(project) : null;
    const current = draft ?? initial;
    return {
        available,
        project,
        value: current,
        update: (fn) => setDraft(fn(current)),
        changed: available && draft !== null && JSON.stringify(draft) !== JSON.stringify(initial),
        save: async () => {
            await api.updateProject({ ...editable(project), ...draft });
            await queryClient.invalidateQueries({ queryKey: ['gpu', 'projects'] });
        },
    };
}

// The part of a workspace project its settings change; the rest (name, members, end, quotas) belongs to the tree and is sent back as it is.
function editable(project) {
    const { role: _role, budget_status: _status, ...rest } = project;
    return { ...rest, limits: { ...DEFAULT_LIMITS, ...(project.limits ?? {}) } };
}

// WorkspaceSettingsPanel is the dialog's "Workspaces" tab.
export function WorkspaceSettingsPanel({ draft }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const catalog = useQuery({ queryKey: gpuKeys.catalog(), queryFn: () => api.catalog(), staleTime: 10 * 60 * 1000 });
    // The caller's course images built from Git (Workspaces → Umgebungen), offered for the course image.
    const envs = useQuery({ queryKey: gpuKeys.environments(), queryFn: () => api.listEnvironments(), staleTime: 60 * 1000 });
    const courseImages = [...new Set((envs.data ?? []).filter(e => e.base && e.status === 'ready').map(e => e.image))];
    const p = draft.value;
    if (!p) return null;
    const set = (k, v) => draft.update(cur => ({ ...cur, [k]: v }));
    const setLimit = (k, v) => draft.update(cur => ({ ...cur, limits: { ...cur.limits, [k]: Number(v) || 0 } }));

    const images = p.images ?? [];
    const budgets = p.budgets ?? [];
    const firstOwn = budgets.findIndex(b => !b.tree);
    // The project's own quotas show their use under their fields already; here only the shares this part sets.
    const status = (draft.project?.budget_status ?? []).filter(b => !b.tree);
    const setBudget = (i, patch) => set('budgets', budgets.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    return (
        <Stack gap="sm">
            {status.length > 0 && <Stack gap={6}>{status.map((b, i) => <BudgetBar key={i} b={b} />)}</Stack>}

            <MultiSelect label={t('gpu.projects.profiles')} description={t('gpu.projects.profilesHint')} value={p.profiles ?? []} onChange={v => set('profiles', v)}
                data={(catalog.data?.profiles ?? []).map(x => ({ value: x.slug, label: x.gpu_class ? `${x.name} · ${x.gpu_class}` : x.name }))} />
            <Checkbox label={t('gpu.projects.freeImagesLabel')} description={t('gpu.projects.freeImagesHint')}
                checked={!!p.free_images} onChange={e => set('free_images', e.currentTarget.checked)} />
            <Autocomplete label={t('gpu.projects.kernelImageLabel')} description={t('gpu.projects.kernelImageHint')} placeholder="ghcr.io/…/kurs:2026"
                data={courseImages} value={p.kernel_image ?? ''} onChange={v => set('kernel_image', v.trim())} />

            <Text size="sm" fw={600}>{t('gpu.projects.limits')}</Text>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                <NumberInput label={t('gpu.projects.limit.serversShort')} min={0} value={p.limits.servers_per_person} onChange={v => setLimit('servers_per_person', v)} />
                <NumberInput label={t('gpu.projects.limit.cpuShort')} min={0} decimalScale={1} value={p.limits.cpu_per_person} onChange={v => setLimit('cpu_per_person', v)} />
                <NumberInput label={t('gpu.projects.limit.ramShort')} min={0} value={p.limits.ram_gb_per_person} onChange={v => setLimit('ram_gb_per_person', v)} />
                <NumberInput label={t('gpu.projects.limit.gpusShort')} min={0} value={p.limits.gpus_per_person} onChange={v => setLimit('gpus_per_person', v)} />
            </SimpleGrid>
            <Text size="xs" c="dimmed">{t('gpu.projects.limitsHint')}</Text>

            <Text size="sm" fw={600}>{t('gpu.projects.budgets')}</Text>
            {/* The project's own quotas arrive here as budgets too (tree); they are edited in the quotas tab, so only the limits set here are listed — the others are kept and sent back as they are. */}
            {budgets.map((b, i) => (b.tree ? null : (
                <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
                    <NumberInput w={110} min={0} label={i === firstOwn ? t('gpu.projects.budget.amount') : undefined} value={b.amount}
                        onChange={v => setBudget(i, { amount: Number(v) || 0 })} />
                    <Select w={170} allowDeselect={false} label={i === firstOwn ? t('gpu.projects.budget.unit') : undefined} value={b.unit}
                        data={UNITS.map(u => ({ value: u, label: t(`gpu.projects.budget.units.${u}`) }))} onChange={v => setBudget(i, { unit: v })} />
                    {b.unit === 'gpu_hours' && (
                        <Select w={110} clearable label={i === firstOwn ? t('gpu.projects.budget.class') : undefined} value={b.gpu_class || null}
                            placeholder={t('gpu.projects.budget.allClasses')} data={catalog.data?.gpuClasses ?? []} onChange={v => setBudget(i, { gpu_class: v || '' })} />
                    )}
                    <Select w={130} allowDeselect={false} label={i === firstOwn ? t('gpu.projects.budget.window') : undefined} value={b.window}
                        data={WINDOWS.map(w => ({ value: w, label: t(`gpu.projects.budget.windows.${w}`) }))} onChange={v => setBudget(i, { window: v })} />
                    <Checkbox label={t('gpu.projects.budget.perPerson')} checked={!!b.per_person} mb={8}
                        onChange={e => setBudget(i, { per_person: e.currentTarget.checked })} />
                    <ActionIcon variant="subtle" color="red" mb={4} aria-label={t('gpu.projects.remove')} onClick={() => set('budgets', budgets.filter((_, j) => j !== i))}><X size={16} /></ActionIcon>
                </Group>
            )))}
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
        </Stack>
    );
}
