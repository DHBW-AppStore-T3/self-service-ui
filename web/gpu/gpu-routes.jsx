import { Route, Switch, Redirect } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Container } from '@mantine/core';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { hasWorkspaces } from '/gpu/access.js';
import { GpuServers } from '/gpu/servers.jsx';
import { GpuUsage } from '/gpu/usage.jsx';
import { GpuFleet } from '/gpu/fleet.jsx';
import { NoProject } from '/projects/no-project.jsx';

// Workspaces (docs/plan-workspaces.md): running servers and usage. A project's workspace settings open from its card under Projects (gpu/workspace-settings.jsx). Served by llm-management-api; who may use it is its decision: a member of a project (workspace_projects in /v1/me); admins always, they manage the projects. Without a project it offers the way to one.
export function GpuManagement() {
    const { t } = useTranslation();
    const { query, me, isAdmin } = useLlmMe();

    if (query.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (query.isError) return <Container size="lg" py="md"><LoadError query={query} /></Container>;
    if (!hasWorkspaces(me, isAdmin)) {
        return <NoProject title={t('gpu.noAccess.title')} text={t('gpu.noAccess.text')} />;
    }
    return (
        <Switch>
            {/* The project list moved to Projects; old links land there. */}
            <Route path="/projects"><Redirect to="~/projects/projects?kind=aiaas" replace /></Route>
            <Route path="/servers" component={GpuServers} />
            <Route path="/usage" component={GpuUsage} />
            <Route path="/gpus" component={GpuFleet} />
            <Route path="/"><Redirect to="/servers" replace /></Route>
            <Route>
                <Container size="md" py="md">
                    <Alert color="gray" variant="light">{t('gpu.noAccess.page')}</Alert>
                </Container>
            </Route>
        </Switch>
    );
}
