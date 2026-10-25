import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Box, Button, Code, Group, Paper, Progress, ScrollArea, Stack, Table, Text, Title } from '@mantine/core';
import { AlertCircle, ArrowLeft, WifiOff } from 'lucide-react';
import { isTransitional, statusColor } from './api.js';
import { AccessPanel } from './deployments.jsx';
import {
    useApps, useDeployment, useDeploymentLogs, useDeploymentStream, useDeploymentTasks,
} from './queries.jsx';
import { StateView } from './shared.jsx';

function StatusBadge({ status }) {
    const { t } = useTranslation();
    return (
        <Badge variant="light" color={statusColor(status)}>
            {status ? t(`appStore.statuses.${status}`, { defaultValue: status }) : t('appStore.statusUnknown')}
        </Badge>
    );
}

function formatTime(value, language) {
    return value ? new Date(value).toLocaleString(language) : '–';
}

// Where the deployment is: the step and a bar, from the latest task.
function Progression({ task, live }) {
    const { t } = useTranslation();
    const phase = live.phase ?? task?.current_phase;
    const percent = live.progress ?? task?.progress_pct;
    return (
        <Stack gap="xs">
            {typeof percent === 'number' && <Progress value={percent} color="blue" aria-label={t('appStore.detail.progressLabel')} animated />}
            {phase && <Text size="sm" c="dimmed">{t('appStore.detail.phase', { phase })}</Text>}
        </Stack>
    );
}

function Teams({ teams }) {
    const { t } = useTranslation();
    return (
        <Paper withBorder p="lg">
            <Stack gap="sm">
                <Title order={2} size="h4">{t('appStore.detail.teams')}</Title>
                {teams.length === 0 ? <Text size="sm" c="dimmed">{t('appStore.detail.noTeams')}</Text> : teams.map(team => (
                    <Box key={team.teamId}>
                        <Text fw={500} size="sm">{team.name}</Text>
                        <Text size="xs" c="dimmed">
                            {team.members.length === 0 ? '–' : team.members.map(m => m.email).join(', ')}
                        </Text>
                    </Box>
                ))}
            </Stack>
        </Paper>
    );
}

function TaskHistory({ tasks }) {
    const { t, i18n } = useTranslation();
    return (
        <Paper withBorder>
            <Table.ScrollContainer minWidth={480}>
                <Table aria-label={t('appStore.detail.tasks')} verticalSpacing="sm" horizontalSpacing="md">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t('appStore.detail.taskType')}</Table.Th>
                            <Table.Th>{t('appStore.detail.taskStatus')}</Table.Th>
                            <Table.Th>{t('appStore.detail.started')}</Table.Th>
                            <Table.Th>{t('appStore.detail.finished')}</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {tasks.map(task => (
                            <Table.Tr key={task.taskId}>
                                <Table.Td>{t(`appStore.detail.taskTypes.${task.type}`, { defaultValue: task.type })}</Table.Td>
                                <Table.Td><StatusBadge status={task.status} /></Table.Td>
                                <Table.Td>{formatTime(task.started_at ?? task.created_at, i18n.language)}</Table.Td>
                                <Table.Td>{formatTime(task.finished_at, i18n.language)}</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Paper>
    );
}

// The log: live while the task runs, afterwards loaded on request.
function LogPanel({ deploymentId, live, running }) {
    const { t } = useTranslation();
    const [loadFull, setLoadFull] = useState(false);
    const full = useDeploymentLogs(deploymentId, loadFull && !running);
    const text = running ? live.lines.join('\n') : full.data?.logs;
    return (
        <Paper withBorder p="lg">
            <Stack gap="sm">
                <Title order={2} size="h4">{t('appStore.detail.log')}</Title>
                {running && live.broken && (
                    <Alert color="yellow" icon={<AlertCircle size={18} />}>{t('appStore.detail.liveUnavailable')}</Alert>
                )}
                {running && live.overflow && <Text size="xs" c="dimmed">{t('appStore.detail.logOverflow')}</Text>}
                {!running && !loadFull && (
                    <Button variant="light" size="xs" w="fit-content" onClick={() => setLoadFull(true)}>
                        {t('appStore.detail.loadLog')}
                    </Button>
                )}
                {(running || loadFull) && (
                    <StateView query={running ? { isPending: false, isError: false } : full}>
                        <ScrollArea h={280} type="auto">
                            <Code block>{text || t(running ? 'appStore.detail.logWaiting' : 'appStore.detail.logEmpty')}</Code>
                        </ScrollArea>
                    </StateView>
                )}
            </Stack>
        </Paper>
    );
}

/**
 * DeploymentDetail is one deployment: status that follows the backend by
 * itself while something is moving, and what the role may see. A member (a
 * student) gets the status, a hint if it failed, and their own credentials. The
 * owner view adds teams, the task history and the live log (Server-Sent
 * Events, with the polled status as the fallback).
 */
export function DeploymentDetail({ params }) {
    const { t, i18n } = useTranslation();
    const query = useDeployment(params.id);
    const apps = useApps();
    const deployment = query.data;
    const permissions = deployment?.permissions ?? {};
    const ownerView = permissions.owner_view === true;
    const running = isTransitional(deployment?.status);
    const live = useDeploymentStream(params.id, ownerView && running);
    const tasks = useDeploymentTasks(params.id, ownerView, deployment?.status);

    // The page stands while a later poll fails; only a first failure is an error page.
    const view = deployment ? { ...query, isError: false } : query;
    const failed = deployment?.status?.endsWith('failed');
    const appName = deployment?.app?.name ?? apps.data?.find(app => app.appId === deployment?.appId)?.name;

    return (
        <Stack gap="lg">
            <Anchor component={Link} href="/deployments" size="sm">
                <Group gap={6}><ArrowLeft size={15} />{t('appStore.detail.back')}</Group>
            </Anchor>
            <StateView query={view} messages={{ forbidden: t('appStore.detail.forbidden'), notFound: t('appStore.detail.notFound') }}>
                {deployment && (
                    <>
                        <Group justify="space-between" align="flex-start">
                            <Box>
                                <Title order={1} size="h2">{deployment.name}</Title>
                                <Text c="dimmed" size="sm" mt={4}>
                                    {appName && `${appName} · `}{t('appStore.created')} {formatTime(deployment.created_at, i18n.language)}
                                </Text>
                            </Box>
                            <StatusBadge status={deployment.status} />
                        </Group>

                        {query.isError && (
                            <Alert color="yellow" icon={<WifiOff size={18} />} role="status">{t('appStore.detail.connection')}</Alert>
                        )}
                        {running && <Progression task={deployment.latest_task} live={live} />}
                        {running && !ownerView && <Text size="sm" c="dimmed">{t('appStore.detail.waitingStudent')}</Text>}
                        {failed && (
                            <Alert color="red" icon={<AlertCircle size={18} />} role="alert">
                                {t(ownerView ? 'appStore.detail.failedOwner' : 'appStore.detail.failedStudent')}
                            </Alert>
                        )}

                        {permissions.member && deployment.status === 'success' && (
                            <Paper withBorder p="lg">
                                <Stack gap="sm">
                                    <Title order={2} size="h4">{t('appStore.detail.credentials')}</Title>
                                    <AccessPanel deploymentId={params.id} />
                                </Stack>
                            </Paper>
                        )}

                        {ownerView && (
                            <>
                                <Teams teams={deployment.teams ?? []} />
                                {tasks.data?.length > 0 && <TaskHistory tasks={tasks.data} />}
                                <LogPanel deploymentId={params.id} live={live} running={running} />
                            </>
                        )}
                    </>
                )}
            </StateView>
        </Stack>
    );
}
