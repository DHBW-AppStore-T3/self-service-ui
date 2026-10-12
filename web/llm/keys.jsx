import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Container, Group, Modal, Paper, Progress, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { Plus, Trash2 } from 'lucide-react';
import { formatDateTime } from '/format-date.js';
import { CodeBlock } from '/helper/codeblock.jsx';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { NoProject } from '/projects/no-project.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { barColour, percent, units } from '/llm/format.js';
import { VscodeSetup } from '/llm/vscode-setup.jsx';

// Names that contain at least one letter or digit, as the API requires.
const NAME_OK = /[\p{L}\p{N}]/u;

export function keyLabel(k, t) {
    return k.chat ? t('llm.keys.chatKey') : (k.name || t('llm.keys.unnamed'));
}

export function LlmKeys() {
    const { t } = useTranslation();
    const api = useLlmApi();
    const confirm = useConfirm();
    const { me } = useLlmMe();
    const [name, setName] = useState('');
    // The project the next key draws from; null = the default project.
    const [project, setProject] = useState(null);
    const [fresh, setFresh] = useState(null);

    const usage = useQuery({ queryKey: llmKeys.usage(), queryFn: () => api.getUsage() });

    const create = useApiMutation({
        mutationFn: () => api.createKey(name.trim(), project),
        invalidates: [llmKeys.usage()],
        onSuccess: (created) => { setFresh(created?.key ?? null); setName(''); },
    });
    const remove = useApiMutation({
        mutationFn: (id) => api.deleteKey(id),
        invalidates: [llmKeys.usage()],
    });

    async function onDelete(k) {
        const ok = await confirm({
            title: t('llm.keys.deleteTitle'),
            confirmLabel: t('llm.keys.deleteConfirm'),
            message: k.chat ? t('llm.keys.deleteChatMessage') : t('llm.keys.deleteMessage', { name: keyLabel(k, t) }),
        });
        if (ok) remove.mutate(k.id);
    }

    if (usage.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    // No LLM tokens through any project: the way to get some, instead of an error.
    if (usage.isError && usage.error?.status === 403) {
        return <NoProject title={t('llm.noAccess.title')} text={t('llm.noAccess.text')} />;
    }
    if (usage.isError) return <Container size="lg" py="md"><LoadError query={usage} /></Container>;

    const u = usage.data ?? {};
    const keys = u.keys ?? [];
    // Every key spends from one project's pool. The picker only where there is
    // something to pick; its first choice is the default project.
    const projects = u.projects ?? [];
    const defaultProject = projects.find(p => p.default) ?? projects[0];
    const chosenProject = project ?? defaultProject?.slug ?? null;
    const own = u.own_keys ?? keys.filter(k => !k.chat).length;
    const full = u.max_keys > 0 && own >= u.max_keys;
    const apiUrl = me?.api_url || '';
    const env = `export OPENAI_BASE_URL=${apiUrl}\nexport OPENAI_API_KEY=${fresh ?? ''}`;

    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <Paper p="lg" radius="md" withBorder>
                    <Group justify="space-between" align="flex-end" wrap="wrap">
                        <div>
                            <Title order={3}>{t('llm.keys.title')}</Title>
                            <Text size="xs" c="dimmed">
                                {t('llm.keys.count', { own, max: u.max_keys })}
                                {own < keys.length && <> · {t('llm.keys.chatNotCounted')}</>}
                            </Text>
                        </div>
                        <Group gap="xs" wrap="nowrap">
                            {projects.length > 1 && (
                                <Select w={220} aria-label={t('llm.keys.project')} allowDeselect={false}
                                    value={chosenProject} onChange={setProject}
                                    data={projects.map(p => ({ value: p.slug, label: p.name || p.slug }))} />
                            )}
                            <TextInput w={260} maxLength={40} value={name}
                                placeholder={t('llm.keys.namePlaceholder')}
                                onChange={e => setName(e.currentTarget.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && NAME_OK.test(name) && !full) create.mutate(); }} />
                            <Button leftSection={<Plus size={16} />} loading={create.isPending}
                                disabled={full || !NAME_OK.test(name)} onClick={() => create.mutate()}>
                                {t('llm.keys.create')}
                            </Button>
                        </Group>
                    </Group>
                    {full && <Text size="xs" c="orange" mt="xs">{t('llm.keys.full')}</Text>}

                    {/* What actually caps the keys: the pool of their project,
                        shared with its members. The column below is only each
                        key's own short-term budget on top of it. */}
                    {projects.length > 0 && (
                        <SimpleGrid cols={{ base: 1, sm: Math.min(projects.length, 3) }} spacing="sm" mt="md">
                            {projects.map(p => {
                                const pp = percent(p.spend, p.budget);
                                return (
                                    <Paper key={p.slug} p="sm" radius="md" withBorder>
                                        <Group justify="space-between" wrap="nowrap">
                                            <Text size="sm" fw={600} truncate>{p.name || p.slug}</Text>
                                            <Text size="xs" c="dimmed">{t('llm.keys.poolPer', { window: p.budget_duration || '—' })}</Text>
                                        </Group>
                                        <Text size="sm">{t('llm.keys.poolUsed', { spend: units(p.spend), budget: units(p.budget) })}</Text>
                                        {p.budget > 0 && <Progress value={pp} color={barColour(pp)} size="sm" mt={4} />}
                                    </Paper>
                                );
                            })}
                        </SimpleGrid>
                    )}

                    <Table striped highlightOnHover mt="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('llm.keys.name')}</Table.Th>
                                <Table.Th>{t('llm.keys.project')}</Table.Th>
                                <Table.Th>{t('llm.keys.shortTerm')}</Table.Th>
                                <Table.Th>{t('llm.keys.reset')}</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {keys.length === 0 && (
                                <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">{t('llm.keys.none')}</Text></Table.Td></Table.Tr>
                            )}
                            {keys.map(k => (
                                <Table.Tr key={k.id}>
                                    <Table.Td>{keyLabel(k, t)}</Table.Td>
                                    <Table.Td>{k.project_name || <Text span size="sm" c="dimmed">{t('llm.keys.noProject')}</Text>}</Table.Td>
                                    <Table.Td>{units(k.spend, 4)} / {units(k.budget)}{k.budget_duration && <Text span size="xs" c="dimmed"> {t('llm.keys.per', { window: k.budget_duration })}</Text>}</Table.Td>
                                    <Table.Td>{k.reset_at ? formatDateTime(k.reset_at) : '—'}</Table.Td>
                                    <Table.Td align="right">
                                        <Button size="xs" variant="subtle" color="red" leftSection={<Trash2 size={14} />}
                                            loading={remove.isPending && remove.variables === k.id} onClick={() => onDelete(k)}>
                                            {t('llm.keys.delete')}
                                        </Button>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Paper>
            </Stack>

            <Modal opened={!!fresh} onClose={() => setFresh(null)} title={t('llm.keys.newTitle')} size={900} centered>
                <Alert color="dhbw" variant="light" title={t('llm.keys.onceTitle')} mb="sm">
                    {t('llm.keys.onceText')}
                </Alert>
                <CodeBlock language="plaintext" code={fresh ?? ''} />

                {apiUrl && (
                    <>
                        <Text size="sm" fw={600} mt="lg">{t('llm.keys.shellTitle')}</Text>
                        <Text size="xs" c="dimmed" mb={4}>{t('llm.keys.shellHint')}</Text>
                        <CodeBlock language="bash" code={env} />
                        <VscodeSetup apiUrl={apiUrl} />
                    </>
                )}

                <Group mt="lg" justify="flex-end">
                    <Button variant="default" onClick={() => setFresh(null)}>{t('llm.keys.close')}</Button>
                </Group>
            </Modal>
        </Container>
    );
}
