import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Box, Button, Group, List, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { AlertCircle, CheckCircle2, FileCode, Upload, X } from 'lucide-react';
import { useConfirm } from '/providers/confirm.jsx';
import { cloudNames, credentialState, safeNextPath } from './api.js';
import {
    useCredentials, useDeleteCredential, useSaveCredential, useTestCredential,
} from './queries.jsx';
import { StateView } from './shared.jsx';

// The backend takes up to 64 KiB of clouds.yaml.
const MAX_BYTES = 65536;
const ACCEPT = {
    'application/x-yaml': ['.yaml', '.yml'],
    'application/yaml': ['.yaml', '.yml'],
    'text/yaml': ['.yaml', '.yml'],
    'text/plain': ['.yaml', '.yml'],
};

const STATE_COLOR = { valid: 'green', invalid: 'red', unverified: 'yellow' };

function CredentialRow({ credential }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const test = useTestCredential();
    const remove = useDeleteCredential();
    const state = credentialState(credential);
    const project = credential.project_name || credential.project_id || '–';
    const locked = credential.active_deployments > 0;

    async function askAndDelete() {
        const ok = await confirm({
            title: t('appStore.credentials.deleteTitle'),
            message: t('appStore.credentials.deleteMessage', { project }),
            confirmLabel: t('appStore.credentials.delete'),
        });
        if (ok) remove.mutate(credential.credentialId);
    }

    return (
        <Paper withBorder p="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4}>
                    <Group gap="xs">
                        <Text fw={500} size="sm">{t('appStore.credentials.project', { project })}</Text>
                        <Badge variant="light" color={STATE_COLOR[state]}>{t(`appStore.credentials.states.${state}`)}</Badge>
                    </Group>
                    <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{credential.auth_url}</Text>
                    {state === 'unverified' && <Text size="xs" c="dimmed">{t('appStore.credentials.unverifiedHint')}</Text>}
                    {state === 'invalid' && <Text size="xs" c="dimmed">{credential.last_validation_error}</Text>}
                    {locked && <Text size="xs" c="dimmed">{t('appStore.credentials.activeDeployments', { count: credential.active_deployments })}</Text>}
                </Stack>
                <Group gap="xs" wrap="nowrap">
                    <Button size="xs" variant="light" loading={test.isPending} onClick={() => test.mutate(credential.credentialId)}>
                        {t('appStore.credentials.test')}
                    </Button>
                    <Button size="xs" variant="subtle" color="red" disabled={locked} loading={remove.isPending} onClick={askAndDelete}>
                        {t('appStore.credentials.delete')}
                    </Button>
                </Group>
            </Group>
        </Paper>
    );
}

// What went wrong with a save, in words: Keystone's refusal names its cause.
function SaveError({ error }) {
    const { t } = useTranslation();
    const message = error.reason === 'openstack_credentials_invalid'
        ? t('appStore.credentials.errors.invalid', { cause: error.detail?.cause ?? error.status })
        : t('appStore.credentials.errors.generic', { message: error.message });
    return <Alert color="red" icon={<AlertCircle size={18} />} role="alert">{message}</Alert>;
}

/**
 * Credentials is where a lecturer hands over their OpenStack access: a
 * clouds.yaml is dropped (or pasted), the backend checks it against Keystone
 * and stores it. With nothing stored yet a dropped file is saved at once; to
 * replace what exists, the person confirms with the button, as before.
 * `?next=/apps/<id>` is where to go after saving (see safeNextPath).
 */
export function Credentials() {
    const { t } = useTranslation();
    const [, navigate] = useLocation();
    const next = safeNextPath(new URLSearchParams(useSearch()).get('next'));
    const stored = useCredentials();
    const [yaml, setYaml] = useState('');
    const [fileName, setFileName] = useState(null);
    const [cloud, setCloud] = useState(null);
    const [readError, setReadError] = useState(false);
    const [saved, setSaved] = useState(null);

    const save = useSaveCredential({
        onSuccess: credential => {
            setSaved(credential);
            setYaml('');
            setFileName(null);
            setCloud(null);
            if (next) navigate(next);
        },
    });

    const names = cloudNames(yaml);
    const severalClouds = names.length > 1;
    const chosenCloud = severalClouds ? (cloud ?? names[0]) : null;
    const none = stored.isSuccess && stored.data.length === 0;

    function submit(text = yaml, cloudName = chosenCloud) {
        setSaved(null);
        save.mutate({ yaml: text, cloudName });
    }

    async function readFile([file]) {
        setReadError(false);
        let text;
        try {
            text = await file.text();
        } catch {
            setReadError(true);
            return;
        }
        setYaml(text);
        setFileName(file.name);
        setCloud(null);
        // Nothing to replace and nothing to choose: no reason to ask.
        if (none && cloudNames(text).length <= 1) submit(text, null);
    }

    return (
        <Stack gap="lg" maw={760}>
            <Box>
                <Title order={1} size="h2">{t('appStore.credentials.title')}</Title>
                <Text c="dimmed" mt={6}>{t('appStore.credentials.intro')}</Text>
            </Box>

            <StateView query={stored}>
                <Stack gap="sm">
                    {stored.data?.length > 0 ? (
                        <>
                            <Title order={2} size="h4">{t('appStore.credentials.stored')}</Title>
                            {stored.data.map(c => <CredentialRow key={c.credentialId} credential={c} />)}
                        </>
                    ) : (
                        <Paper withBorder p="lg">
                            <Text fw={500}>{t('appStore.credentials.none')}</Text>
                            <Text size="sm" c="dimmed" mt={4}>{t('appStore.credentials.noneHint')}</Text>
                        </Paper>
                    )}
                </Stack>
            </StateView>

            <Stack gap="md">
                <Dropzone onDrop={readFile} onReject={() => setReadError(true)} maxSize={MAX_BYTES} accept={ACCEPT} multiple={false}>
                    <Group justify="center" gap="md" mih={96} style={{ pointerEvents: 'none' }}>
                        <Dropzone.Accept><Upload size={36} strokeWidth={1.5} /></Dropzone.Accept>
                        <Dropzone.Reject><X size={36} strokeWidth={1.5} /></Dropzone.Reject>
                        <Dropzone.Idle><FileCode size={36} strokeWidth={1.5} /></Dropzone.Idle>
                        <div>
                            <Text size="md">{t('appStore.credentials.dropTitle')}</Text>
                            <Text size="xs" c="dimmed">{t('appStore.credentials.dropHint')}</Text>
                        </div>
                    </Group>
                </Dropzone>
                {readError && <Alert color="red" icon={<AlertCircle size={18} />} role="alert">
                    {t('appStore.credentials.errors.unreadable')} {t('appStore.credentials.dropReject')}
                </Alert>}
                {fileName && <Text size="sm" c="dimmed">{t('appStore.credentials.chosenFile', { name: fileName })}</Text>}

                <Textarea label={t('appStore.credentials.pasteLabel')} value={yaml} autosize minRows={4} maxRows={12}
                    onChange={e => { setYaml(e.currentTarget.value); setFileName(null); setCloud(null); }}
                    styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-sm)' } }} />

                {severalClouds && (
                    <Stack gap="xs">
                        <Text size="sm">{t('appStore.credentials.chooseCloud')}</Text>
                        <Select label={t('appStore.credentials.cloud')} data={names} value={chosenCloud} allowDeselect={false}
                            onChange={setCloud} maw={320} />
                    </Stack>
                )}

                {save.error && <SaveError error={save.error} />}
                {saved && (
                    <Alert color="green" icon={<CheckCircle2 size={18} />} role="status">
                        {t('appStore.credentials.saved', { project: saved.project_name || saved.project_id || '–' })}
                    </Alert>
                )}

                <Group>
                    <Button disabled={yaml.trim() === ''} loading={save.isPending} onClick={() => submit()}>
                        {t('appStore.credentials.save')}
                    </Button>
                </Group>
            </Stack>

            <Paper withBorder p="md">
                <Text fw={500} size="sm" mb="xs">{t('appStore.credentials.guideTitle')}</Text>
                <List type="ordered" size="sm" spacing={4} c="dimmed">
                    {[1, 2, 3].map(n => <List.Item key={n}>{t(`appStore.credentials.guide${n}`)}</List.Item>)}
                </List>
            </Paper>
        </Stack>
    );
}
