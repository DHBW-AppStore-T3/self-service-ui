import { lazy, Suspense } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Container } from '@mantine/core';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { LlmOverview } from '/llm/overview.jsx';
import { LlmKeys } from '/llm/keys.jsx';
import { LlmUsage } from '/llm/usage.jsx';
import { NoProject } from '/projects/no-project.jsx';

const LlmFleet = lazy(() => import('/llm/fleet.jsx').then(m => ({ default: m.LlmFleet })));
const LlmApiSwagger = lazy(() => import('/swagger/swagger.jsx').then(m => ({ default: m.LlmApiSwagger })));

// The section exists in every deployment with an llmBaseUrl, but who may use
// it is the service's decision (LLM tokens through a project, see use-llm-me.jsx);
// without, it offers the way to a project. A route a
// role does not allow is not registered, so a bookmarked admin page reached
// without the role ends at "no access" rather than at a page of 403s.
export function LlmManagement() {
    const { t } = useTranslation();
    const { query, hasAccess, isFleetAdmin } = useLlmMe();

    if (query.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (query.isError) return <Container size="lg" py="md"><LoadError query={query} /></Container>;
    if (!hasAccess) {
        return <NoProject title={t('llm.noAccess.title')} text={t('llm.noAccess.text')} />;
    }

    return (
        <Suspense fallback={<Container size="lg" py="md"><Loading /></Container>}>
            <Switch>
                <Route path="/overview" component={LlmOverview} />
                <Route path="/keys" component={LlmKeys} />
                <Route path="/usage" component={LlmUsage} />
                {isFleetAdmin && <Route path="/fleet/:page?" component={LlmFleet} />}
                <Route path="/api-doc" component={LlmApiSwagger} />
                <Route path="/"><Redirect to="/overview" replace /></Route>
                <Route>
                    <Container size="md" py="md">
                        <Alert color="gray" variant="light">{t('llm.noAccess.page')}</Alert>
                    </Container>
                </Route>
            </Switch>
        </Suspense>
    );
}
