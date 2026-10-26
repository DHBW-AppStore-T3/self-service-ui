import { Redirect } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Box, Group, Paper, Stack, Switch, Text, Title } from '@mantine/core';
import { useAdminViewSwitch, useApps, useMe, useRole, useSetRecommended } from './queries.jsx';
import { AppIcon, StateView } from './shared.jsx';

function AdminViewSwitch() {
    const { t } = useTranslation();
    const [on, setOn] = useAdminViewSwitch();
    return (
        <Paper withBorder p="lg">
            <Switch checked={on} onChange={e => setOn(e.currentTarget.checked)}
                label={t('appStore.settings.adminView')} description={t('appStore.settings.adminViewHint')} />
        </Paper>
    );
}

// One switch per app. While a save is under way the switch already shows the
// new value: the list is refetched afterwards, and until then it would jump back.
function RecommendedApps() {
    const { t, i18n } = useTranslation();
    const query = useApps();
    const save = useSetRecommended();
    const apps = [...(query.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
    return (
        <Paper withBorder p="lg">
            <Stack gap="md">
                <Box>
                    <Title order={2} size="h4">{t('appStore.recommendedSettings.title')}</Title>
                    <Text size="sm" c="dimmed" mt={4}>{t('appStore.recommendedSettings.description')}</Text>
                </Box>
                <StateView query={query}>
                    {apps.length === 0 ? <Text size="sm" c="dimmed">{t('appStore.recommendedSettings.empty')}</Text> : (
                        <Stack gap="sm">
                            {apps.map(app => {
                                const saving = save.isPending && save.variables?.appId === app.appId;
                                return (
                                    <Group key={app.appId} justify="space-between" wrap="nowrap">
                                        <Group gap="sm" wrap="nowrap">
                                            <AppIcon app={app} size={32} />
                                            <Text size="sm">{app.name}</Text>
                                        </Group>
                                        <Switch checked={saving ? save.variables.recommended : app.recommended === true}
                                            disabled={saving}
                                            aria-label={t('appStore.recommendedSettings.switchLabel', { name: app.name })}
                                            onChange={e => save.mutate({ appId: app.appId, recommended: e.currentTarget.checked })} />
                                    </Group>
                                );
                            })}
                        </Stack>
                    )}
                </StateView>
            </Stack>
        </Paper>
    );
}

// Settings of the App Store section. Admins only: anyone else is sent back to
// the catalog once the role is known (the menu does not offer the page to them
// either; this is for someone who types the address).
export function Settings() {
    const { t } = useTranslation();
    const me = useMe();
    const { admin } = useRole();
    return (
        <StateView query={me}>
            {admin ? (
                <Stack gap="lg">
                    <Box>
                        <Title order={1} size="h2">{t('appStore.settings.title')}</Title>
                        <Text c="dimmed" mt={6}>{t('appStore.settings.intro')}</Text>
                    </Box>
                    <AdminViewSwitch />
                    <RecommendedApps />
                </Stack>
            ) : <Redirect to="/apps" replace />}
        </StateView>
    );
}
