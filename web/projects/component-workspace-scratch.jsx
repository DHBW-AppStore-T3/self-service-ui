import { NumberInput, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { MAX_WORKSPACE_SCRATCH_GB } from './util-workspace-scratch.js';

// WorkspaceScratchInput edits a budget's local storage per workspace ("Lokaler Speicher je Workspace"): empty sets nothing here, so the budgets above decide it, shown as placeholder; without a value above, the AI service's default applies. inherited: the smallest value of the budgets above (inherited_workspace_scratch_gb). onChange(value) with null to clear.
export function WorkspaceScratchInput({ value, inherited, error, onChange, disabled = false }) {
    const { t } = useTranslation();
    const above = inherited ?? null;
    return (
        <Stack gap={4}>
            <div>
                <Text fw={600} size="sm">{t('projects.workspaceScratch.title')}</Text>
                <Text size="xs" c="dimmed">{t('projects.workspaceScratch.hint')}</Text>
            </div>
            <NumberInput
                size="xs"
                maw={260}
                label={t('projects.workspaceScratch.label')}
                min={1}
                max={above ?? MAX_WORKSPACE_SCRATCH_GB}
                allowDecimal={false}
                allowNegative={false}
                value={value ?? ''}
                disabled={disabled}
                placeholder={above === null ? t('projects.workspaceScratch.standard') : t('projects.workspaceScratch.fromAbove', { value: above })}
                error={error}
                onChange={v => onChange(v === '' ? null : v)}
            />
        </Stack>
    );
}
