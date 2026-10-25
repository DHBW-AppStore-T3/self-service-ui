import { Redirect } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Box, Paper, Stack, Switch, Text, Title } from '@mantine/core';
import { useAdminViewSwitch, useMe, useRole } from './queries.jsx';
import { StateView } from './shared.jsx';

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
                </Stack>
            ) : <Redirect to="/apps" replace />}
        </StateView>
    );
}
