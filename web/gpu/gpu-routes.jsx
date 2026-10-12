import { Route, Switch, Redirect } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Container } from '@mantine/core';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { hasWorkspaces } from '/gpu/access.js';
import { GpuEnvironments } from '/gpu/environments.jsx';
import { GpuServers } from '/gpu/servers.jsx';
import { GpuUsage } from '/gpu/usage.jsx';
import { WorkspaceProjects } from '/gpu/projects.jsx';
import { NoProject } from '/projects/no-project.jsx';

// Workspaces (docs/plan-workspaces.md): projects, environments from Git repositories, running servers and usage. Served by llm-management-api; who may use it is its decision: a member of a project (workspace_projects in /v1/me); admins always, they manage the projects. Without a project it offers the way to one.
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
            <Route path="/projects" component={WorkspaceProjects} />
            <Route path="/environments" component={GpuEnvironments} />
            <Route path="/servers" component={GpuServers} />
            <Route path="/usage" component={GpuUsage} />
            <Route path="/"><Redirect to="/projects" replace /></Route>
            <Route>
                <Container size="md" py="md">
                    <Alert color="gray" variant="light">{t('gpu.noAccess.page')}</Alert>
                </Container>
            </Route>
        </Switch>
    );
}
