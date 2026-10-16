import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { Button, Container, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { BookOpen, KeyRound } from 'lucide-react';
import { cloudProjectsEnabled, dnsZonesEnabled, llmEnabled } from '/features.js';

// Developer (/developer, from the account menu): the API tokens and the API documentation of the services, out of the areas' navigation — they are for scripts and integrations, not for the everyday flow. The pages themselves stay where they were (/cloud/tokens, /dyndns/api-doc, …), so links to them keep working. The LLM API keys are not here: they are the LLM area's product, used with the models.
export function Developer() {
    const { t } = useTranslation();
    const services = [
        cloudProjectsEnabled && { id: 'cloud', tokens: '/cloud/tokens', docs: '/cloud/api-doc' },
        dnsZonesEnabled && { id: 'dns', tokens: '/dyndns/tokens', docs: '/dyndns/api-doc' },
        llmEnabled && { id: 'llm', docs: '/llm/api-doc' },
    ].filter(Boolean);
    return (
        <Container size="lg" py="md">
            <Stack gap="md">
                <div>
                    <Title order={2}>{t('developer.title')}</Title>
                    <Text c="dimmed" size="sm">{t('developer.intro')}</Text>
                </div>
                <SimpleGrid cols={{ base: 1, sm: services.length }} spacing="md">
                    {services.map(s => (
                        <Paper key={s.id} withBorder radius="md" p="md">
                            <Stack gap="xs" h="100%">
                                <Text fw={700}>{t(`developer.${s.id}.title`)}</Text>
                                <Text size="sm" c="dimmed" style={{ flex: 1 }}>{t(`developer.${s.id}.text`)}</Text>
                                <Group gap="xs">
                                    {s.tokens && <Button component={Link} href={s.tokens} size="xs" variant="light" leftSection={<KeyRound size={14} />}>{t('nav.apiTokens')}</Button>}
                                    <Button component={Link} href={s.docs} size="xs" variant="subtle" leftSection={<BookOpen size={14} />}>{t('nav.apiDocumentation')}</Button>
                                </Group>
                            </Stack>
                        </Paper>
                    ))}
                </SimpleGrid>
            </Stack>
        </Container>
    );
}
