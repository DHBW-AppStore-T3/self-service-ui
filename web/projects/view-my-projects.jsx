import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ArrowUpDown } from 'lucide-react';
import { useLocalStorage } from '@mantine/hooks';
import { Alert, Divider, Group, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { ProjectCard } from './card-project.jsx';
import { BudgetOffers } from './component-budget-offers.jsx';
import { NewProjectButton } from './component-new-project-button.jsx';
import { BudgetFormModal } from './modal-budget-form.jsx';
import { ProjectFormModal } from './modal-project-form.jsx';
import { NodeInspectModal } from './modal-inspect.jsx';
import { RetireModal } from './modal-retire.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { useCloudStatus } from './cloud-status.jsx';
import { useTranslation } from 'react-i18next';
import { COLOR, PROJECT_SORTS, budgetKinds, getAuthUserEmail, ownerEmail, projectKinds, resourcesOfKinds, sortProjects, pollWhileDeleting } from './util-project.jsx';

// MyProjectsView lists the projects of one area (cloud, workspaces, llm) the
// signed-in user owns or shares, and lets them request new ones, propose changes
// and release finished projects; below them the budgets offering that area.
// Each section of the menu shows its own (see nav.jsx). A project of several
// areas appears in each, its card showing only that area's resources; the
// dialogs keep the whole project.
export function MyProjectsView({ area = 'cloud' }) {
    const { t } = useTranslation();
    // The order the viewer picked last; anything the browser kept that is no
    // longer an option falls back to the name.
    const [storedSort, setSort] = useLocalStorage({
        key: 'self-service.my-projects.sort',
        defaultValue: PROJECT_SORTS[0],
        getInitialValueInEffect: false,
    });
    const sort = PROJECT_SORTS.includes(storedSort) ? storedSort : PROJECT_SORTS[0];
    const api = useNodesApi();
    const config = useProjectConfig();
    const { user } = useAuth();
    const cloudStatus = useCloudStatus();
    // The new-project dialog: null = closed, otherwise its kind and the budget
    // to preselect ('' = none, when opened from the page header).
    const [newProject, setNewProject] = useState(null);
    // The budget a sub-budget is being requested from, or null.
    const [budgetRequestFrom, setBudgetRequestFrom] = useState(null);
    const dlg = useNodeDialog();

    // Three lists, one screen. useQueries keeps them independent (a failing
    // eligible-budget lookup does not blank out the projects) while still
    // giving one place to ask "are we still loading".
    const [projectsQuery, myBudgetsQuery, eligibleQuery] = useQueries({
        queries: [
            { queryKey: projectKeys.mine(), queryFn: () => api.listMine(), enabled: !!api, refetchInterval: pollWhileDeleting },
            { queryKey: projectKeys.myBudgets(), queryFn: () => api.listMyBudgets(), enabled: !!api },
            { queryKey: projectKeys.eligibleForMe(), queryFn: () => api.listEligibleForMe(), enabled: !!api },
        ],
    });

    const handleAction = (action, node) => dlg.open(action, node);

    if (!api || !config || projectsQuery.isPending) return <Loading />;
    if (projectsQuery.isError) return <LoadError query={projectsQuery} title={t('projects.myProjects.loadError')} />;

    const resources = config.resources || [];
    const projects = projectsQuery.data ?? { items: [], total: 0 };
    // The projects of this area. One that holds nothing yet belongs to every
    // area, so it never goes missing.
    const kinds = [area];
    const ofKind = (n) => projectKinds(n, resources).length === 0 || projectKinds(n, resources).includes(area);
    const shown = projects.items.filter(ofKind);
    const areaResources = resourcesOfKinds(resources, kinds);
    const myBudgets = myBudgetsQuery.data?.items ?? [];
    const eligibleBudgets = eligibleQuery.data?.items ?? [];
    // A project can be started where a budget in reach offers the area: one the
    // viewer manages or may request from.
    const offersArea = (b) => budgetKinds(b, resources).includes(area);
    const availableKinds = [...myBudgets, ...eligibleBudgets].some(offersArea) ? kinds : [];
    // The list also holds projects the viewer only administers. What counts
    // against a per-person share is what they OWN — the server sums by owner —
    // so only those go into the arithmetic below.
    const me = getAuthUserEmail(user).toLowerCase();
    const ownProjects = projects.items.filter(n => ownerEmail(n).toLowerCase() === me);
    const canRequest = myBudgets.length > 0 || eligibleBudgets.length > 0;
    // The offers are what the user may REQUEST from; budgets they manage live
    // in "My Budgets" and would only repeat themselves here.
    const managedIds = new Set(myBudgets.map(b => b.id));
    const offers = eligibleBudgets.filter(b => !managedIds.has(b.id) && offersArea(b));
    const budgetRequestTargets = offers.filter(b => b.allow_sub_budget_requests !== false);

    return (
        <Stack>
            {/* Two sections, the projects first: they are what this page is
                about, and the budgets below are where more of them come from.
                Before, the budget cards came first under a small caption and the
                project cards followed without one, so the two read as one list. */}
            <Stack gap="xs">
                {/* One row: the heading, the order, and the way to a new one at its end. */}
                <Group justify="space-between" align="center" gap="sm">
                    <Stack gap={0}>
                        <Title order={4}>{t(`projects.kind.heading_${area}`)}</Title>
                        <Text size="xs" c="dimmed">{t(`projects.kind.${area}Hint`)}</Text>
                    </Stack>
                    <Group gap="sm" align="center" ml="auto">
                        {shown.length > 1 && (
                            <Select
                                size="xs"
                                w={190}
                                aria-label={t('projects.myProjects.sortLabel')}
                                leftSection={<ArrowUpDown size={14} />}
                                data={PROJECT_SORTS.map(k => ({ value: k, label: t(`projects.myProjects.sort_${k}`) }))}
                                value={sort}
                                onChange={v => v && setSort(v)}
                                allowDeselect={false}
                            />
                        )}
                        <NewProjectButton kinds={kinds} available={availableKinds} label={t(`projects.kind.${area}Project`)} onPick={(k) => setNewProject({ budget: '', kind: k })} />
                    </Group>
                </Group>

            {/* One person's own projects fit in one request. If that ever stops
                being true, say it — a missing project is worse than a long list. */}
            {projects.items.length < projects.total && (
                <Alert color={COLOR.attention} variant="light">
                    {t('projects.myProjects.shown', { shown: projects.items.length, total: projects.total })}
                </Alert>
            )}

            {shown.length === 0 && (
                canRequest ? (
                    <Alert color={COLOR.info} variant="light">
                        {t('projects.myProjects.noneCanRequest')}
                    </Alert>
                ) : (
                    <Alert color={COLOR.attention} variant="light">
                        {t('projects.myProjects.none')}
                    </Alert>
                )
            )}

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {/* Own projects first, the shared ones after them. */}
                {[...sortProjects(ownProjects.filter(ofKind), sort), ...sortProjects(shown.filter(n => !ownProjects.includes(n)), sort)].map(node => (
                    <ProjectCard
                        key={node.id}
                        node={node}
                        resources={areaResources}
                        parentName={node.parent_name}
                        perspective="owner"
                        onAction={handleAction}
                    />
                ))}
            </SimpleGrid>
            </Stack>

            {offers.length > 0 && <Divider my="sm" />}

            <BudgetOffers
                budgets={offers}
                resources={resources}
                myProjects={ownProjects}
                kinds={kinds}
                onNewProject={(b, k) => setNewProject({ budget: b.id, kind: k })}
                onRequestBudget={(b) => setBudgetRequestFrom(b)}
            />

            {/* ── Dialogs (one instance per view) ────────────────────────── */}
            <ProjectFormModal
                key={newProject === null ? 'new-closed' : `new:${newProject.kind}:${newProject.budget}`}
                opened={newProject !== null}
                onClose={() => setNewProject(null)}
                resources={resources}
                openstackRoles={config.openstackRoles}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={ownProjects}
                initialBudgetId={newProject?.budget || null}
                initialKind={newProject?.kind ?? null}
            />
            {/* The budgets go in here too: they are how the dialog knows what
                the project's budget approves on its own. */}
            <ProjectFormModal
                key={`change:${dlg.key}`}
                opened={dlg.is('change')}
                onClose={dlg.close}
                resources={resources}
                openstackRoles={config.openstackRoles}
                node={dlg.node}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={ownProjects}
            />
            <BudgetFormModal
                key={`budget-request:${budgetRequestFrom?.id ?? 'closed'}`}
                opened={!!budgetRequestFrom}
                onClose={() => setBudgetRequestFrom(null)}
                onDone={cloudStatus.refresh}
                resources={resources}
                mode="request"
                parent={budgetRequestFrom}
                eligibleBudgets={budgetRequestTargets}
                currentUserEmail={getAuthUserEmail(user)}
            />
            {/* History is a tab in here, not a button of its own outside. */}
            <NodeInspectModal key={`inspect:${dlg.key}`} opened={dlg.is('details')}
                onClose={dlg.close} node={dlg.node} resources={resources} />
            <RetireModal key={`retire:${dlg.key}`} opened={dlg.is('release') || dlg.is('delete-for-good')}
                mode={dlg.is('delete-for-good') ? 'delete' : 'release'} onClose={dlg.close} node={dlg.node} />
        </Stack>
    );
}
