import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge, Code, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';

export const BUILD_COLOUR = { building: 'blue', ready: 'teal', failed: 'red' };

// useBuildLog follows the build of a project's environment: the log's tail and what its pod is doing, asked again every 3 s while it builds (a plain request through the client, like the rest of the page, instead of a stream past it).
export function useBuildLog(slug, building, enabled = true) {
    const api = useGpuApi();
    return useQuery({
        queryKey: [...gpuKeys.projects(false), 'build-log', slug],
        queryFn: () => api.projectImageLog(slug),
        enabled: enabled && !!slug,
        retry: false,
        refetchInterval: building ? 3000 : false,
    });
}

// BuildLogBody is the state of a build above its log: status, branch and commit, what the pod is doing and since when, the failure's reason; then the log, scrolled to its end.
export function BuildLogBody({ build, data, loading }) {
    const { t } = useTranslation();
    const end = useRef(null);
    const building = build?.status === 'building';
    useEffect(() => {
        end.current?.scrollIntoView({ block: 'nearest' });
    }, [data?.log]);
    return (
        <Stack gap="xs">
            {build && (
                <Group gap="xs">
                    {building && <Loader size={12} />}
                    <Badge variant="light" color={BUILD_COLOUR[build.status] ?? 'gray'} style={{ textTransform: 'none' }}>
                        {t(`gpu.projects.image.status.${build.status}`, { defaultValue: build.status })}
                    </Badge>
                    <Text size="xs" c="dimmed" ff="monospace">{(build.commit || '').slice(0, 12)}{build.branch ? ` (${build.branch})` : ''}</Text>
                    {building && <Text size="xs" c="dimmed">· {t('gpu.projects.image.live')}</Text>}
                </Group>
            )}
            {data?.state && (
                <Text size="sm">
                    <Text span fw={500}>{t('gpu.projects.image.state')}: </Text>{data.state}
                    {data.since && building ? ` (${t('gpu.projects.image.since', { time: new Date(data.since).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) })})` : ''}
                </Text>
            )}
            {build?.status === 'failed' && build.message && <Text size="sm" c="red">{build.message}</Text>}
            {loading ? <Loader size="sm" /> : (
                <Code block style={{ maxHeight: '60vh', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                    {data?.log || t('gpu.projects.image.logEmpty')}
                    <span ref={end} />
                </Code>
            )}
        </Stack>
    );
}

// BuildLogModal shows a project's build log in a dialog, following it while it builds.
export function BuildLogModal({ slug, build, opened, onClose }) {
    const { t } = useTranslation();
    const log = useBuildLog(slug, build?.status === 'building', opened);
    return (
        <Modal opened={opened} onClose={onClose} title={t('gpu.projects.image.log')} size={1000} centered>
            <BuildLogBody build={build} data={log.data} loading={log.isPending} />
            {log.isError && <Text size="sm" c="red">{log.error?.message}</Text>}
        </Modal>
    );
}
