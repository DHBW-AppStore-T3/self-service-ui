import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Container, Divider, Group, Paper, Progress, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { formatDateTime } from '/format-date.js';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { barColour, percent, units } from '/llm/format.js';
import { keyLabel } from '/llm/keys.jsx';
import { LlmPoolWarnings } from '/projects/component-llm-limits.jsx';

export function LlmUsage() {
    const { t, i18n } = useTranslation();
    const api = useLlmApi();
    const usage = useQuery({ queryKey: llmKeys.usage(), queryFn: () => api.getUsage() });
    const setDefault = useApiMutation({
        mutationFn: (slug) => api.setDefaultProject(slug),
        invalidates: [llmKeys.usage()],
    });

    if (usage.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (usage.isError) return <Container size="lg" py="md"><LoadError query={usage} /></Container>;

    const u = usage.data ?? {};
    const keys = u.keys ?? [];
    const projects = u.projects ?? [];
    const num = (n) => Number(n).toLocaleString(i18n.resolvedLanguage);

    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <LlmPoolWarnings projects={projects} />
                {/* One pool per project, shared by all its members: what the
                    project has used of it together, not what this person used. */}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                    {projects.map(pr => {
                        const pp = percent(pr.spend, pr.budget);
                        return (
                            <Paper key={pr.slug} p="lg" radius="md" withBorder>
                                <Group justify="space-between" wrap="nowrap" align="flex-start">
                                    <div>
                                        <Text fw={600}>{pr.name || pr.slug}</Text>
                                        <Text size="xs" c="dimmed">{t('llm.usage.pool', { mtokens: num(pr.mtokens) })}</Text>
                                    </div>
                                    <Group gap={6} wrap="nowrap">
                                        {pr.default && <Badge variant="light" color="teal">{t('llm.usage.default')}</Badge>}
                                        <Badge variant="default">{pr.budget_duration || '—'}</Badge>
                                    </Group>
                                </Group>
                                <Group align="baseline" gap={6} mt="sm">
                                    <Text fz={30} fw={650} lh={1}>{units(pr.spend)}</Text>
                                    <Text c="dimmed">{t('llm.usage.of', { budget: units(pr.budget) })}</Text>
                                </Group>
                                {pr.budget > 0 && <Progress value={pp} color={barColour(pp)} size="md" mt="sm" />}
                                <Text size="sm" c="dimmed" mt="xs">
                                    {t('llm.usage.resetAt', { date: pr.reset_at ? formatDateTime(pr.reset_at) : '—' })}
                                </Text>
                                {/* Rate limits and models are the project's too, for all its members together — set in the budget tree like the pool. */}
                                <Divider my="sm" />
                                <Text size="sm">
                                    {[pr.rpm > 0 && t('llm.usage.rpm', { n: num(pr.rpm) }), pr.tpm > 0 && t('llm.usage.tpm', { n: num(pr.tpm) })].filter(Boolean).join(' · ')}
                                </Text>
                                <Group gap={6} mt={6}>
                                    {(pr.models ?? []).map(m => (
                                        <Badge key={m} variant="light" color="gray" style={{ textTransform: 'none' }}>{m}</Badge>
                                    ))}
                                </Group>
                                {!pr.default && projects.length > 1 && (
                                    <Button size="xs" variant="subtle" mt="xs" px={0}
                                        loading={setDefault.isPending && setDefault.variables === pr.slug}
                                        onClick={() => setDefault.mutate(pr.slug)}>
                                        {t('llm.usage.makeDefault')}
                                    </Button>
                                )}
                            </Paper>
                        );
                    })}
                </SimpleGrid>
                <Text size="xs" c="dimmed" mt={-8}>{t('llm.usage.perProjectHint')} {t('llm.usage.defaultHint')} {t('llm.usage.live')}</Text>

                <Paper p="lg" radius="md" withBorder>
                    <Text fw={600}>{t('llm.usage.perKey')}</Text>
                    <Text size="xs" c="dimmed" mb="sm">{t('llm.usage.perKeyHint')}</Text>
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('llm.keys.name')}</Table.Th>
                                <Table.Th>{t('llm.keys.project')}</Table.Th>
                                <Table.Th>{t('llm.usage.shortTerm')}</Table.Th>
                                <Table.Th>{t('llm.usage.period')}</Table.Th>
                                <Table.Th>{t('llm.keys.reset')}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {keys.length === 0 && (
                                <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">{t('llm.keys.none')}</Text></Table.Td></Table.Tr>
                            )}
                            {keys.map(k => {
                                const kp = percent(k.spend, k.budget);
                                return (
                                    <Table.Tr key={k.id}>
                                        <Table.Td>{keyLabel(k, t)}</Table.Td>
                                        <Table.Td>{k.project_name || '—'}</Table.Td>
                                        <Table.Td>
                                            <Text size="sm">{units(k.spend, 4)} / {units(k.budget)}</Text>
                                            {k.budget > 0 && <Progress value={kp} color={barColour(kp)} size="xs" mt={4} />}
                                        </Table.Td>
                                        <Table.Td>{k.budget_duration || '—'}</Table.Td>
                                        <Table.Td>{k.reset_at ? formatDateTime(k.reset_at) : '—'}</Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </Paper>

                <Alert variant="light" color="gray" title={t('llm.usage.explainTitle')}>
                    {['units', 'monthly', 'shortTerm'].map(k => (
                        <Text key={k} size="sm" mt={k === 'units' ? 0 : 'xs'}>
                            <Trans i18nKey={`llm.usage.explain.${k}`} components={{ 1: <b /> }} />
                        </Text>
                    ))}
                </Alert>
            </Stack>
        </Container>
    );
}
