import { Link } from 'wouter';
import { Trans, useTranslation } from 'react-i18next';
import { ActionIcon, Button, Code, Container, CopyButton, Group, Paper, Stack, Text, Title, Tooltip } from '@mantine/core';
import { ArrowRight, Check, Copy, MessageSquare, ShieldCheck } from 'lucide-react';
import { ExternalLink } from '/helper/external-link.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { LITELLM_CLIENT_DOCS, STABLE_MODELS, TOOLS } from '/llm/tools.js';

// What the LLM service is and what a tool needs to use it: the chat, a key, the base URL and the stable model names.
export function LlmOverview() {
    const { t } = useTranslation();
    const { me } = useLlmMe();
    const apiUrl = me?.api_url || '';
    const chatUrl = me?.chat_url || '';

    return (
        <Container size="lg" py="md">
            <Stack gap="md">
                <Paper p="lg" radius="md" withBorder>
                    <Stack gap="sm">
                        <Title order={2}>{t('llm.overview.title')}</Title>
                        <Text c="dimmed" maw={780}>{t('llm.overview.intro')}</Text>
                        <Group gap="xs" wrap="nowrap" align="flex-start" maw={780}>
                            <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--mantine-color-teal-7)' }} />
                            <Text size="sm">{t('llm.overview.promise')}</Text>
                        </Group>
                        <Group mt={4}>
                            {chatUrl && (
                                <Button component="a" href={chatUrl} target="_blank" leftSection={<MessageSquare size={18} />}>
                                    {t('llm.overview.openChat')}
                                </Button>
                            )}
                            <Button component={Link} to="/keys" variant={chatUrl ? 'light' : 'filled'} rightSection={<ArrowRight size={18} />}>
                                {t('llm.overview.createKey')}
                            </Button>
                        </Group>
                    </Stack>
                </Paper>

                <Paper p="lg" radius="md" withBorder>
                    <Stack gap="xs">
                        <Title order={4}>{t('llm.overview.connect')}</Title>
                        {apiUrl && (
                            <Group gap="xs" wrap="nowrap">
                                <Text size="sm" w={110}>{t('llm.overview.baseUrl')}</Text>
                                <Code>{apiUrl}</Code>
                                <CopyButton value={apiUrl} timeout={1500}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? t('llm.overview.copied') : t('llm.overview.copy')} withArrow>
                                            <ActionIcon variant="subtle" color="gray" size="sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}</ActionIcon>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                            </Group>
                        )}
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                            <Text size="sm" w={110} style={{ flexShrink: 0 }}>{t('llm.overview.models')}</Text>
                            <div>
                                <Group gap={6}>{STABLE_MODELS.map(m => <Code key={m}>{m}</Code>)}</Group>
                                <Text size="xs" c="dimmed" mt={4}>{t('llm.overview.modelsHint')}</Text>
                            </div>
                        </Group>
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                            <Text size="sm" w={110} style={{ flexShrink: 0 }}>{t('llm.overview.tools')}</Text>
                            <Text size="sm">
                                {TOOLS.map((tool, i) => <span key={tool.id}>{i > 0 && ' · '}<ExternalLink href={tool.url}>{tool.name}</ExternalLink></span>)}
                                {' · '}
                                <Trans i18nKey="llm.overview.ownCode" components={{ 1: <ExternalLink href={LITELLM_CLIENT_DOCS} /> }} />
                            </Text>
                        </Group>
                    </Stack>
                </Paper>
            </Stack>
        </Container>
    );
}
