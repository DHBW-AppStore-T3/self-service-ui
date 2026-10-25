import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Box, Button, Divider, Group, Loader, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { AlertCircle, ArrowLeft, Rocket } from 'lucide-react';
import {
    BAD_GATEWAY, CONFLICT, FORBIDDEN, NOT_FOUND, PRECONDITION_FAILED, approvedVersionOptions, deployTarget, deploymentPayload,
    quickDeployBlocker,
} from './api.js';
import {
    useApp, useAppVariables, useCreateDeployment, useRole, useSetDeployVersion, useVersionApprovals,
} from './queries.jsx';
import { AppDescription } from './markdown.jsx';
import { AppIcon, LegacyLink, StateView } from './shared.jsx';

// What a failed create means for the user, and where they can fix it.
function DeployError({ error, appId }) {
    const { t } = useTranslation();
    if (error.status === PRECONDITION_FAILED && error.reason === 'openstack_credentials_missing') {
        return (
            <Alert color="yellow" icon={<AlertCircle size={18} />} title={t('appStore.deploy.credentialsMissingTitle')}>
                <Stack gap="sm">
                    <Text size="sm">{t('appStore.deploy.credentialsMissing')}</Text>
                    <Button component={Link} href={`/credentials?next=${encodeURIComponent(`/apps/${appId}`)}`}
                        size="xs" variant="light" w="fit-content">
                        {t('appStore.deploy.openCredentials')}
                    </Button>
                </Stack>
            </Alert>
        );
    }
    const message = error.status === FORBIDDEN ? t('appStore.deploy.forbidden') : error.message;
    return <Alert color="red" icon={<AlertCircle size={18} />} title={t('appStore.deploy.failed')}>{message}</Alert>;
}

/**
 * DeployPanel creates a deployment of this app without teams or inputs.
 *
 * A lecturer chooses no version: they get the one an admin fixed (see
 * deployTarget). Whether that is enough depends on the version: its variables
 * are read from the app's repository, and anything that needs a value hands
 * over to the existing App Store's wizard, which can collect it. Students never
 * see this panel — creating environments is staff work, and the backend refuses it.
 */
function DeployPanel({ app }) {
    const { t } = useTranslation();
    const [, navigate] = useLocation();
    const { version } = deployTarget(app);
    const [name, setName] = useState(app.name);
    const variables = useAppVariables(app.appId, version);
    const create = useCreateDeployment({ onSuccess: () => navigate('/deployments') });

    // No version is either "nothing approved yet" or the backend failing to
    // reach the repository (it logs that and answers []). The UI cannot tell
    // which, so it says both and offers the wizard, which can.
    if (!version) {
        return (
            <Stack gap="sm" align="flex-start">
                <Text size="sm" c="dimmed">{t('appStore.deploy.noVersions')}</Text>
                <LegacyLink path={`/apps/${encodeURIComponent(app.appId)}`} size="xs" variant="light">
                    {t('appStore.deploy.openWizard')}
                </LegacyLink>
            </Stack>
        );
    }

    const blocker = variables.isSuccess ? quickDeployBlocker(variables.data) : null;
    const ready = variables.isSuccess && !blocker && name.trim() !== '';

    return (
        <Stack gap="md">
            <TextInput label={t('appStore.deploy.name')} value={name} required
                onChange={e => setName(e.currentTarget.value)} />

            {variables.isPending && (
                <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">{t('appStore.deploy.checking')}</Text></Group>
            )}
            {variables.isError && (
                <Text size="sm" c="red">{t('appStore.deploy.variablesFailed')}</Text>
            )}
            {blocker === 'inputs' && (
                <Alert color="blue" icon={<AlertCircle size={18} />}>
                    <Stack gap="sm">
                        <Text size="sm">{t('appStore.deploy.needsInputs')}</Text>
                        <LegacyLink path={`/apps/${encodeURIComponent(app.appId)}`} size="xs" variant="light">
                            {t('appStore.deploy.openWizard')}
                        </LegacyLink>
                    </Stack>
                </Alert>
            )}
            {create.error && <DeployError error={create.error} appId={app.appId} />}

            <Group>
                <Button leftSection={<Rocket size={16} />} disabled={!ready} loading={create.isPending}
                    onClick={() => create.mutate(deploymentPayload({ name, appId: app.appId, releaseTag: version }))}>
                    {t('appStore.deploy.submit')}
                </Button>
                <Text size="xs" c="dimmed">{t('appStore.deploy.hint')}</Text>
            </Group>
        </Stack>
    );
}

// Why fixing a version was refused, in the words of the cause.
function versionError(error, t) {
    if (error.status === CONFLICT && error.reason) {
        return t(`appStore.deploy.errors.${error.reason}`, { defaultValue: error.message });
    }
    if (error.status === NOT_FOUND) return t('appStore.deploy.errors.notFound');
    if (error.status === BAD_GATEWAY) return t('appStore.deploy.errors.badGateway');
    if (error.status === FORBIDDEN) return t('appStore.deploy.forbidden');
    return error.message;
}

/**
 * AdminVersionPanel is what the admin view shows instead of the deploy form:
 * which version lecturers deploy, and the means to change it. Only approved
 * versions are offered; the backend refuses the rest as well. Approving and
 * rejecting versions stays in the existing App Store.
 */
function AdminVersionPanel({ app }) {
    const { t } = useTranslation();
    const approvals = useVersionApprovals(app.appId, true);
    const save = useSetDeployVersion();
    const options = approvedVersionOptions(app.versions, approvals.data);
    const [chosen, setChosen] = useState(null);
    const wanted = chosen ?? app.deploy_version;
    const value = options.some(option => option.value === wanted) ? wanted : (options[0]?.value ?? null);
    const target = deployTarget(app);

    return (
        <Stack gap="md" align="flex-start">
            <Text size="sm">
                {target.version
                    ? t(target.fixed ? 'appStore.deploy.versionFixed' : 'appStore.deploy.versionNotFixed', { version: target.version })
                    : t('appStore.deploy.noVersions')}
            </Text>
            {approvals.isPending && <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">{t('appStore.loading')}</Text></Group>}
            {approvals.isError && <Text size="sm" c="red">{t('appStore.errors.errorMessage')}</Text>}
            {approvals.isSuccess && options.length === 0 && <Text size="sm" c="dimmed">{t('appStore.deploy.versionNone')}</Text>}
            {options.length > 0 && (
                <Select label={t('appStore.deploy.version')} data={options} value={value} allowDeselect={false}
                    onChange={setChosen} maw={320} w="100%" />
            )}
            {save.error && (
                <Alert color="red" icon={<AlertCircle size={18} />} title={t('appStore.deploy.failed')} role="alert">
                    {versionError(save.error, t)}
                </Alert>
            )}
            <Group>
                <Button disabled={!value} loading={save.isPending && save.variables?.versionTag !== null}
                    onClick={() => save.mutate({ appId: app.appId, versionTag: value })}>
                    {t('appStore.deploy.setVersion')}
                </Button>
                <Button variant="subtle" color="gray" disabled={!app.deploy_version}
                    loading={save.isPending && save.variables?.versionTag === null}
                    onClick={() => save.mutate({ appId: app.appId, versionTag: null })}>
                    {t('appStore.deploy.clearVersion')}
                </Button>
                <LegacyLink path={`/apps/${encodeURIComponent(app.appId)}`} size="xs" variant="default">
                    {t('appStore.deploy.manageVersions')}
                </LegacyLink>
            </Group>
            <Text size="xs" c="dimmed">{t('appStore.deploy.setVersionHint')}</Text>
        </Stack>
    );
}

export function AppDetail({ params }) {
    const { t } = useTranslation();
    const query = useApp(params.id);
    const { staff, loaded, isAdminView } = useRole();
    const app = query.data;
    // Only http(s): the link is rendered as an anchor, and the field is
    // whatever the app's author typed.
    const repository = isAdminView && app?.git_link && /^https?:\/\//i.test(app.git_link) ? app.git_link : null;

    return (
        <Stack gap="lg">
            <Anchor component={Link} href="/apps" size="sm">
                <Group gap={6}><ArrowLeft size={15} />{t('appStore.back')}</Group>
            </Anchor>
            <StateView query={query}>
                {app && (
                    <Paper withBorder p="xl">
                        <Stack gap="lg">
                            <Group>
                                <AppIcon app={app} size={64} />
                                <Box>
                                    <Title order={1} size="h2">{app.name}</Title>
                                    <Group mt="xs">
                                        {app.releaseTag && <Badge variant="light">{t('appStore.version')} {app.releaseTag}</Badge>}
                                        {isAdminView && (
                                            <Badge color="gray" variant="light">
                                                {t('appStore.versionsAvailable', { count: app.versions?.length ?? 0 })}
                                            </Badge>
                                        )}
                                        <Badge color="gray" variant="light">
                                            {t(app.is_private ? 'appStore.private' : 'appStore.public')}
                                        </Badge>
                                    </Group>
                                </Box>
                            </Group>
                            {app.description
                                ? <AppDescription>{app.description}</AppDescription>
                                : <Text c="dimmed">{t('appStore.noDescription')}</Text>}
                            {repository && (
                                <Anchor href={repository} target="_blank" rel="noopener noreferrer" size="sm">
                                    {t('appStore.repository')} ↗
                                </Anchor>
                            )}

                            {/* Nothing until the role is known: a deploy form
                                that turns into a hint a moment later is worse
                                than either alone. */}
                            {loaded && (
                                <>
                                    <Divider />
                                    <Title order={2} size="h4">{t(isAdminView ? 'appStore.deploy.versionTitle' : 'appStore.deploy.title')}</Title>
                                    {isAdminView ? <AdminVersionPanel app={app} /> : staff ? <DeployPanel app={app} /> : (
                                        <Stack gap="xs">
                                            <Text size="sm">{t('appStore.deploy.studentHint')}</Text>
                                            <Anchor component={Link} href="/deployments" size="sm">
                                                {t('appStore.myEnvironments')}
                                            </Anchor>
                                        </Stack>
                                    )}
                                </>
                            )}
                        </Stack>
                    </Paper>
                )}
            </StateView>
        </Stack>
    );
}
