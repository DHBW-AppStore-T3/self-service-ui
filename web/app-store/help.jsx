import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Anchor, Box, List, Paper, Stack, Text, Title } from '@mantine/core';

// Short on purpose: the steps of a deployment and the three things that go
// wrong most often. Blue for the pointers, never red — that colour is for errors.
export function Help() {
    const { t } = useTranslation();
    const steps = t('appStore.help.steps', { returnObjects: true });
    const problems = t('appStore.help.problems', { returnObjects: true });
    return (
        <Stack gap="lg" maw={760}>
            <Box>
                <Title order={1} size="h2">{t('appStore.help.title')}</Title>
                <Text c="dimmed" mt={6}>{t('appStore.help.intro')}</Text>
            </Box>
            <Paper withBorder p="lg">
                <Stack gap="sm">
                    <Title order={2} size="h4">{t('appStore.help.stepsTitle')}</Title>
                    <List type="ordered" spacing="xs">
                        {steps.map(step => <List.Item key={step}>{step}</List.Item>)}
                    </List>
                </Stack>
            </Paper>
            <Paper withBorder p="lg">
                <Stack gap="sm">
                    <Title order={2} size="h4">{t('appStore.help.problemsTitle')}</Title>
                    <List spacing="xs">
                        {problems.map(problem => <List.Item key={problem}>{problem}</List.Item>)}
                    </List>
                    <Anchor component={Link} href="/credentials" size="sm" c="blue">
                        {t('appStore.help.credentialsLink')}
                    </Anchor>
                </Stack>
            </Paper>
        </Stack>
    );
}
