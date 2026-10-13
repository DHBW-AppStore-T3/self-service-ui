import { Plus } from 'lucide-react';
import { Button, Group, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';

// NewProjectButton starts a new project of one kind, picked here before the
// dialog opens, so the dialog is about one kind from its title on: one button
// per kind ("+ Cloud project", "+ Lab/AI project"). A kind no budget in reach
// offers stays visible but disabled, with the reason on hover — first-time
// users should see that it exists. onPick(kind) gets the kind ('openstack',
// 'aiaas', see PROJECT_KINDS), or null when the catalogue has no kinds to tell
// apart (then it is the one "New project" button of before).
//
// available: the kinds a budget in reach offers; omitted = all of `kinds`.
export function NewProjectButton({ kinds, available = null, onPick, size = 'sm' }) {
    const { t } = useTranslation();
    if (!kinds || kinds.length < 2) {
        return (
            <Button size={size} leftSection={<Plus size="16" />} onClick={() => onPick(kinds?.[0] ?? null)}>
                {t('projects.actions.newProject')}
            </Button>
        );
    }
    return (
        <Group gap="xs" wrap="nowrap">
            {kinds.map(k => {
                const enabled = !available || available.includes(k);
                const button = (
                    <Button size={size} leftSection={<Plus size="16" />} disabled={!enabled} onClick={() => onPick(k)}>
                        {t(`projects.kind.${k}Project`)}
                    </Button>
                );
                return enabled
                    ? <Tooltip key={k} label={t(`projects.kind.${k}Hint`)} multiline w={280} openDelay={400}>{button}</Tooltip>
                    // A disabled button fires no mouse events; the span carries the tooltip.
                    : <Tooltip key={k} label={t('projects.kind.noBudget')} multiline w={280}><span>{button}</span></Tooltip>;
            })}
        </Group>
    );
}
