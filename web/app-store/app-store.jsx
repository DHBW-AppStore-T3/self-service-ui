import { Link, Redirect, Route, Switch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Anchor, Container, Stack, Title } from '@mantine/core';
import { AppDetail } from './app-detail.jsx';
import { Catalog } from './catalog.jsx';
import { Credentials } from './credentials.jsx';
import { DeploymentDetail } from './deployment-detail.jsx';
import { Deployments } from './deployments.jsx';
import { Help } from './help.jsx';
import { Settings } from './settings.jsx';

// The App Store section, mounted under /app-store (nested router, so the
// paths below are relative to it). What it covers and what it hands over to
// the existing App Store frontend is described in claude_docs/app-store.md.
export function AppStore() {
    const { t } = useTranslation();
    return (
        <Container size="xl" py="lg">
            <Switch>
                <Route path="/"><Redirect to="/apps" replace /></Route>
                <Route path="/apps" component={Catalog} />
                <Route path="/apps/:id" component={AppDetail} />
                <Route path="/deployments" component={Deployments} />
                <Route path="/deployments/:id" component={DeploymentDetail} />
                <Route path="/credentials" component={Credentials} />
                <Route path="/help" component={Help} />
                <Route path="/settings" component={Settings} />
                <Route>
                    <Stack>
                        <Title order={2}>{t('app.notFound')}</Title>
                        <Anchor component={Link} href="/apps">{t('appStore.back')}</Anchor>
                    </Stack>
                </Route>
            </Switch>
        </Container>
    );
}
