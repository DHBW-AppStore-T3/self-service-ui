import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, Group, NativeSelect, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { buildDraftValues, isScoped } from './variables.js';
import { networkValue, visibleNetworkKeys } from './payload.js';

const show = value => (Array.isArray(value) ? value.join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));

function Row({ label, children }) {
    return (
        <Table.Tr>
            <Table.Th w={160} fw={500}>{label}</Table.Th>
            <Table.Td>{children}</Table.Td>
        </Table.Tr>
    );
}

export function SummaryStep({
    app, name, version, teams, studentCount, defs, isMultiImage, values, files, runtime, network, workloads, resourceChanged,
    needsCredential, usableCredentials, credentialId, setCredentialId, credentialsReady, appId,
}) {
    const { t } = useTranslation();
    const { changed } = buildDraftValues(defs, values, isMultiImage);
    const changes = defs.filter(def => !(def.osType === 'file') && changed[def.name] !== undefined);
    const networkState = { choices: runtime?.network, selection: network, workloads };
    const networkChanges = visibleNetworkKeys(networkState).filter(key => networkValue(networkState, key) !== !!runtime.network[key].default);
    const fileList = Object.entries(files).flatMap(([varName, slots]) => Object.entries(slots).filter(([, f]) => f?.content_b64).map(([slot, f]) => `${varName} · ${slot}: ${f.name}`));
    const credentialOptions = usableCredentials.map(c => ({ value: c.credentialId, label: t('appStore.wizard.summary.projectOption', { project: c.project_name || c.project_id }) }));

    return (
        <Stack gap="lg">
            <Title order={3} size="h5">{t('appStore.wizard.summary.title')}</Title>
            <Paper withBorder>
                <Table verticalSpacing="sm" horizontalSpacing="md">
                    <Table.Tbody>
                        <Row label={t('appStore.wizard.summary.name')}>{name}</Row>
                        <Row label={t('appStore.wizard.summary.app')}>{app.name}</Row>
                        <Row label={t('appStore.wizard.summary.version')}>{version}</Row>
                        <Row label={t('appStore.wizard.summary.access')}>
                            {studentCount === 0 ? t('appStore.wizard.summary.nobody') : (
                                <Stack gap={4}>
                                    <Text size="sm">{t('appStore.wizard.summary.teams', { count: teams.length })} · {t('appStore.wizard.summary.members', { count: studentCount })}</Text>
                                    {teams.map(team => (
                                        <Text key={team.name} size="xs" c="dimmed">{team.name}: {team.members.map(m => m.username).join(', ')}</Text>
                                    ))}
                                </Stack>
                            )}
                        </Row>
                    </Table.Tbody>
                </Table>
            </Paper>

            <Box>
                <Text fw={500} size="sm" mb={4}>{t('appStore.wizard.summary.changes')}</Text>
                {changes.length === 0 && networkChanges.length === 0 && !resourceChanged && fileList.length === 0
                    ? <Text size="sm" c="dimmed">{t('appStore.wizard.summary.noChanges')}</Text>
                    : (
                        <Stack gap={2}>
                            {changes.map(def => (
                                <Text key={def.name} size="sm">
                                    <b>{def.name}</b>: {isScoped(def) ? show(changed[def.name]) : show(changed[def.name])}
                                </Text>
                            ))}
                            {networkChanges.map(key => (
                                <Text key={key} size="sm"><b>{t(`appStore.wizard.variables.${key}`)}</b>: {String(networkValue(networkState, key))}</Text>
                            ))}
                            {fileList.map(line => <Text key={line} size="sm"><b>{t('appStore.wizard.summary.files')}</b>: {line}</Text>)}
                        </Stack>
                    )}
            </Box>

            {needsCredential && (
                <Stack gap="xs">
                    <Text fw={500} size="sm">{t('appStore.wizard.summary.credential')}</Text>
                    {credentialsReady && usableCredentials.length === 0 ? (
                        <Alert color="yellow" icon={<AlertCircle size={18} />}>
                            <Stack gap="sm" align="flex-start">
                                <Text size="sm">{t('appStore.wizard.summary.credentialNone')}</Text>
                                <Button component={Link} href={`/credentials?next=${encodeURIComponent(`/apps/${appId}/deploy`)}`} size="xs" variant="light">
                                    {t('appStore.wizard.summary.credentialAdd')}
                                </Button>
                            </Stack>
                        </Alert>
                    ) : (
                        <Group>
                            <NativeSelect aria-label={t('appStore.wizard.summary.credentialPick')} maw={360} w="100%"
                                data={[{ value: '', label: t('appStore.wizard.summary.credentialPick') }, ...credentialOptions]}
                                value={credentialId ?? ''} onChange={e => setCredentialId(e.currentTarget.value || null)} />
                        </Group>
                    )}
                </Stack>
            )}
        </Stack>
    );
}
