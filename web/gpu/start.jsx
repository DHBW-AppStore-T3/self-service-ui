import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Button, Code, Collapse, Container, Group, Loader, Paper, Progress, Radio, Select, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { ChevronDown, ChevronRight, Copy, Play } from 'lucide-react';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { profileLabel } from '/gpu/profiles.js';

// Starting a server (Workspaces → Server → Server starten): the hub has no start form of its own any more, its start page leads here. The choice is in the URL (?project=<slug>&env=<profile>&gpu_class=<class>), so a link to this page with a project and an environment can go out to a course; the page offers only what the person's projects allow and starts through llm-management-api, where the hub checks the start as every start. While the server starts the page waits, then opens it in this tab.

const SPLIT_PROFILE = 'cpu-gpukernel';

// startLink is this page with a choice, for others to follow.
export function startLink(base, { project, env, gpuClass }) {
    const q = new URLSearchParams();
    if (project) q.set('project', project);
    if (env) q.set('env', env);
    if (gpuClass) q.set('gpu_class', gpuClass);
    const url = new URL(base);
    url.search = q.toString();
    return url.toString();
}

// envsOf are the profiles a project offers, in the catalogue's order; the split profile needs an environment built on one of our bases.
export function envsOf(project, profiles) {
    if (!project) return [];
    return profiles.filter(p => project.profiles?.includes(p.slug) && (p.slug !== SPLIT_PROFILE || project.image_derived));
}

// limitsText are the runtime limits of a profile (what JupyterHub enforces), after its description.
function limitsText(p, t) {
    if (!p.idle_minutes || !p.max_hours) return '';
    const idle = p.idle_minutes % 60 === 0 ? `${p.idle_minutes / 60} h` : `${p.idle_minutes} min`;
    return ' ' + t('gpu.start.limits', { idle, max: p.max_hours });
}

function day(iso) {
    return iso ? new Date(iso).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '';
}

export function GpuStart() {
    const { t } = useTranslation();
    const api = useGpuApi();
    const params = new URLSearchParams(useSearch());
    const clipboard = useClipboard({ timeout: 1500 });
    const options = useQuery({ queryKey: gpuKeys.startOptions(), queryFn: () => api.startOptions() });

    const projects = options.data?.projects ?? [];
    const profiles = options.data?.profiles ?? [];
    const [projectSlug, setProjectSlug] = useState(params.get('project') || '');
    const [env, setEnv] = useState(params.get('env') || '');
    const [gpuClass, setGpuClass] = useState(params.get('gpu_class') || '');

    const project = projects.find(p => p.slug === projectSlug) ?? projects[0];
    const envs = envsOf(project, profiles);
    const profile = envs.find(p => p.slug === env) ?? envs[0];
    const classes = profile?.gpu ? (project?.gpu_classes ?? []) : [];
    const chosenClass = classes.find(c => c.id === gpuClass) ?? classes.find(c => c.available) ?? classes[0];
    // What the URL asked for and this person cannot start, said once above the form.
    const unknownProject = !!params.get('project') && !!options.data && !projects.some(p => p.slug === params.get('project'));
    const unknownEnv = !unknownProject && !!params.get('env') && !!project && !envs.some(p => p.slug === params.get('env'));

    // startedAt: a server list from before the start must not count as "no longer there".
    const [startedAt, setStartedAt] = useState(0);
    const start = useMutation({ mutationFn: (body) => api.startServer(body), onSuccess: () => setStartedAt(Date.now()) });
    const started = start.data;
    // While it starts: poll the servers, open it once it is ready.
    const servers = useQuery({ queryKey: gpuKeys.servers(), queryFn: () => api.listServers(), enabled: !!started, refetchInterval: 3000 });
    const live = started && servers.data?.find(s => s.name === started.name);
    // The hub's event log of the start (as on the hub's own page); asked again until it ended.
    const progress = useQuery({
        queryKey: gpuKeys.progress(started?.name),
        queryFn: () => api.serverProgress(started.name),
        enabled: !!started,
        refetchInterval: (q) => (q.state.data?.ready || q.state.data?.failed ? false : 2500),
    });
    useEffect(() => {
        if (live?.ready && live.url) window.location.assign(live.url);
    }, [live?.ready, live?.url]);

    if (options.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (options.isError) return <Container size="lg" py="md"><LoadError query={options} /></Container>;

    const choice = { project: project?.slug, env: profile?.slug, gpuClass: classes.length > 1 ? chosenClass?.id : '' };
    const link = startLink(window.location.href, choice);

    if (started) {
        const p = progress.data;
        // Ended without becoming ready: the hub's reason when it has one, else the hub has nothing starting and a server list fetched after the start no longer has it.
        const failed = !!p?.failed;
        const gone = failed || (!!p && !p.starting && !p.ready && servers.dataUpdatedAt > startedAt && servers.data && !live);
        const events = p?.events ?? [];
        const last = events[events.length - 1];
        return (
            <Container size="md" py="md">
                <Paper p="lg" radius="md" withBorder>
                    <Stack gap="sm">
                        <Title order={3}>{t('gpu.start.startingTitle', { name: projects.find(x => x.slug === started.project)?.name || started.project || started.name })}</Title>
                        {gone ? (
                            <Alert color="red" variant="light" title={failed ? t('gpu.start.failedTitle') : undefined}>
                                {failed && p.message ? p.message : t('gpu.start.gone')}
                            </Alert>
                        ) : (
                            <>
                                <Group gap="sm" wrap="nowrap">
                                    <Loader size="sm" />
                                    <Text size="sm">{last?.message || (profile?.gpu ? t('gpu.start.waitingGpu') : t('gpu.start.waiting'))}</Text>
                                </Group>
                                <Progress value={last?.progress ?? 0} size="sm" animated />
                            </>
                        )}
                        <StartLog events={events} open={failed} />
                        <Anchor component={Link} href="/servers" size="sm">{t('gpu.start.toServers')}</Anchor>
                    </Stack>
                </Paper>
            </Container>
        );
    }

    return (
        <Container size="lg" py="md">
            <Paper p="lg" radius="md" withBorder>
                <Stack gap="md">
                    <div>
                        <Title order={3}>{t('gpu.start.title')}</Title>
                        <Text size="sm" c="dimmed" mt={4}>{t('gpu.start.intro')}</Text>
                    </div>
                    {unknownProject && <Alert color="orange" variant="light">{t('gpu.start.unknownProject', { project: params.get('project') })}</Alert>}
                    {unknownEnv && <Alert color="orange" variant="light">{t('gpu.start.unknownEnv', { env: profileLabel(params.get('env'), t) })}</Alert>}
                    {projects.length === 0 ? (
                        <Alert color="gray" variant="light">{t('gpu.start.noProject')}</Alert>
                    ) : (
                        <>
                            <Stack gap={6}>
                                <Title order={5}>{t('gpu.start.project')}</Title>
                                {projects.length > 1 ? (
                                    <Select allowDeselect={false} value={project.slug} onChange={setProjectSlug} maw={480}
                                        data={projects.map(p => ({ value: p.slug, label: p.name || p.slug }))} />
                                ) : (
                                    <Text fw={600}>{project.name || project.slug}</Text>
                                )}
                                <Text size="xs" c="dimmed">
                                    {t('gpu.start.booked')}{project.image_label ? ' ' + t('gpu.start.image', { image: project.image_label }) : ''}
                                </Text>
                                {project.storage_gb > 0
                                    ? <Text size="xs" c="dimmed">{t('gpu.start.storage', { gb: project.storage_gb })}</Text>
                                    : <Text size="xs" c="red">{t('gpu.start.noStorage')}</Text>}
                                {project.ends_at && (
                                    <Text size="xs" c="orange">
                                        {t('gpu.start.ends', { date: day(project.ends_at) })}
                                        {project.delete_at ? ' ' + t('gpu.start.deletes', { date: day(project.delete_at) }) : ''}
                                    </Text>
                                )}
                            </Stack>

                            <Stack gap={6}>
                                <Title order={5}>{t('gpu.start.env')}</Title>
                                {envs.length === 0 ? (
                                    <Text size="sm" c="dimmed">{t('gpu.start.noEnv')}</Text>
                                ) : (
                                    <Radio.Group value={profile.slug} onChange={setEnv}>
                                        <SimpleGrid cols={{ base: 1, sm: Math.min(envs.length, 3) }} spacing="sm">
                                            {envs.map(p => (
                                                <Radio.Card key={p.slug} value={p.slug} radius="md" p="md" withBorder
                                                    style={p.slug === profile.slug ? { borderColor: 'var(--mantine-primary-color-filled)' } : undefined}>
                                                    <Group gap="xs" wrap="nowrap" align="flex-start">
                                                        <Radio.Indicator />
                                                        <div>
                                                            <Group gap={6}>
                                                                <Text fw={600}>{profileLabel(p.slug, t)}</Text>
                                                                {p.gpu && <Badge size="xs" variant="light" color="grape">GPU</Badge>}
                                                            </Group>
                                                            <Text size="xs" c="dimmed" mt={4}>{t(`gpu.start.envs.${p.slug}`, { defaultValue: '' })}{limitsText(p, t)}</Text>
                                                        </div>
                                                    </Group>
                                                </Radio.Card>
                                            ))}
                                        </SimpleGrid>
                                    </Radio.Group>
                                )}
                                {classes.length > 1 && (
                                    <Select label={t('gpu.start.gpuClass')} allowDeselect={false} maw={480} value={chosenClass?.id} onChange={setGpuClass}
                                        data={classes.map(c => ({ value: c.id, label: c.available ? c.name : t('gpu.start.noGpuNow', { name: c.name }) }))} />
                                )}
                            </Stack>

                            {start.isError && <Alert color="red" variant="light">{start.error?.message}</Alert>}
                            <Group gap="sm">
                                <Button leftSection={<Play size={16} />} disabled={!profile} loading={start.isPending}
                                    onClick={() => start.mutate({ project: project.slug, profile: profile.slug, gpu_class: profile.gpu ? chosenClass?.id ?? '' : '' })}>
                                    {t('gpu.start.start')}
                                </Button>
                                <Button variant="subtle" leftSection={<Copy size={16} />} disabled={!profile} onClick={() => clipboard.copy(link)}>
                                    {clipboard.copied ? t('gpu.start.copied') : t('gpu.start.copyLink')}
                                </Button>
                            </Group>
                            <Text size="xs" c="dimmed">{t('gpu.start.linkHint')}</Text>
                        </>
                    )}
                </Stack>
            </Paper>
        </Container>
    );
}

// StartLog is the hub's event log of a start, folded away until asked for; open from the start when the start failed.
export function StartLog({ events, open: openFromStart }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    // A click flips what the start chose, so a failed start's open log can be folded too.
    const shown = openFromStart ? !open : open;
    return (
        <div>
            <UnstyledButton onClick={() => setOpen(o => !o)}>
                <Group gap={4}>
                    {shown ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Text size="sm" c="dimmed">{shown ? t('gpu.start.hideLog') : t('gpu.start.showLog')}</Text>
                </Group>
            </UnstyledButton>
            <Collapse in={shown}>
                {events.length === 0 ? (
                    <Text size="xs" c="dimmed" mt={6}>{t('gpu.start.noEvents')}</Text>
                ) : (
                    <Code block mt={6} style={{ maxHeight: 300, overflow: 'auto' }}>
                        {events.map(e => `${String(e.progress).padStart(3)} %  ${e.message}`).join('\n')}
                    </Code>
                )}
            </Collapse>
        </div>
    );
}
