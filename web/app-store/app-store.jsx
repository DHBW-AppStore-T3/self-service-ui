import { useState } from 'react';
import { Link, Redirect, Route, Switch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Box, Button, Card, Container, Group, Image, Loader, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { AlertCircle, ArrowLeft, ArrowRight, ExternalLink, Package, RefreshCw, Search, Server } from 'lucide-react';
import { useAppStoreQuery } from './queries.jsx';
import { frontendLink } from './api.js';

function LegacyLink({ path, children, ...props }) {
    const { t } = useTranslation();
    const href = frontendLink(window.appconfig?.appStoreFrontendUrl, path);
    return href ? <Button component="a" href={href} rightSection={<ExternalLink size={15} />} {...props}>{children}</Button>
        : <Text size="sm" c="dimmed">{t('appStore.missingLink')}</Text>;
}

function QueryState({ query, children }) {
    const { t } = useTranslation();
    if (query.isPending) return <Group role="status" py="xl"><Loader size="sm" /><Text>{t('appStore.loading')}</Text></Group>;
    if (query.isError) {
        const key = { 401: 'unauthorized', 403: 'forbidden', 404: 'notFound' }[query.error?.status] || 'errorMessage';
        return <Alert color="red" title={t('appStore.error')} icon={<AlertCircle size={18} />} role="alert">
            <Stack gap="sm"><Text size="sm">{t(`appStore.${key}`)}</Text><Button variant="light" size="xs" w="fit-content" onClick={() => query.refetch()} loading={query.isFetching}>{t('appStore.retry')}</Button></Stack>
        </Alert>;
    }
    return children;
}

function AppIcon({ app, size = 48 }) {
    return app.image ? <Image src={app.image} alt="" w={size} h={size} fit="contain" radius="sm" />
        : <ThemeIcon size={size} variant="light" radius="md"><Package size={size / 2} /></ThemeIcon>;
}

function Empty({ title, description, children }) {
    return <Paper withBorder p="xl"><Stack align="center" gap="sm" py="xl">
        <ThemeIcon size={48} variant="light" color="gray"><Package size={24} /></ThemeIcon>
        <Title order={3}>{title}</Title><Text c="dimmed" ta="center">{description}</Text>{children}
    </Stack></Paper>;
}

export function Catalog() {
    const { t, i18n } = useTranslation();
    const query = useAppStoreQuery('apps');
    const [search, setSearch] = useState('');
    const [visibility, setVisibility] = useState('all');
    const [sort, setSort] = useState('name');
    const apps = (query.data || []).filter(app => {
        const matchesText = `${app.name} ${app.description || ''}`.toLocaleLowerCase(i18n.language).includes(search.trim().toLocaleLowerCase(i18n.language));
        return matchesText && (visibility === 'all' || app.is_private === (visibility === 'private'));
    }).sort((a, b) => sort === 'newest' ? Date.parse(b.created_at) - Date.parse(a.created_at) : a.name.localeCompare(b.name, i18n.language));
    return <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
            <Box><Title order={1} size="h2">{t('appStore.title')}</Title><Text c="dimmed" mt={6}>{t('appStore.intro')}</Text></Box>
            <LegacyLink path="/apps" variant="default">{t('appStore.manage')}</LegacyLink>
        </Group>
        <Paper withBorder p="md">
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <TextInput label={t('appStore.search')} placeholder={t('appStore.searchPlaceholder')} leftSection={<Search size={17} />} value={search} onChange={e => setSearch(e.currentTarget.value)} />
                <Select label={t('appStore.visibility')} value={visibility} onChange={v => setVisibility(v || 'all')} allowDeselect={false} data={['all', 'public', 'private'].map(value => ({ value, label: t(`appStore.${value}`) }))} />
                <Select label={t('appStore.sort')} value={sort} onChange={v => setSort(v || 'name')} allowDeselect={false} data={['name', 'newest'].map(value => ({ value, label: t(`appStore.${value}`) }))} />
            </SimpleGrid>
        </Paper>
        <QueryState query={query}>
            <Text c="dimmed" size="sm" role="status">{t('appStore.results', { count: apps.length })}</Text>
            {apps.length ? <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                {apps.map(app => <Card key={app.appId} withBorder padding="lg" component="article">
                    <Group justify="space-between" mb="md"><AppIcon app={app} /><Badge variant="light" color={app.is_private ? 'gray' : 'dhbw'}>{t(app.is_private ? 'appStore.private' : 'appStore.public')}</Badge></Group>
                    <Title order={2} size="h4">{app.name}</Title>
                    <Text size="sm" c="dimmed" mt="xs" lineClamp={3} style={{ flex: 1, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{app.description || t('appStore.noDescription')}</Text>
                    <Group justify="space-between" mt="xl" gap="xs"><Text size="xs" c="dimmed">{t('appStore.version')} {app.releaseTag || '–'}</Text>
                        <Button component={Link} href={`/apps/${encodeURIComponent(app.appId)}`} variant="light" size="xs" rightSection={<ArrowRight size={14} />}>{t('appStore.details')}</Button>
                    </Group>
                </Card>)}
            </SimpleGrid> : <Empty title={t(query.data?.length ? 'appStore.noResults' : 'appStore.empty')} description={t(query.data?.length ? 'appStore.noResultsHint' : 'appStore.emptyHint')}>
                {(search || visibility !== 'all') && <Button variant="subtle" onClick={() => { setSearch(''); setVisibility('all'); }}>{t('appStore.reset')}</Button>}
            </Empty>}
        </QueryState>
    </Stack>;
}

export function AppDetail({ params }) {
    const { t } = useTranslation();
    const query = useAppStoreQuery('app', params.id);
    const app = query.data;
    const repository = app?.git_link && /^https?:\/\//i.test(app.git_link) ? app.git_link : null;
    return <Stack gap="lg">
        <Anchor component={Link} href="/apps" size="sm"><Group gap={6}><ArrowLeft size={15} />{t('appStore.back')}</Group></Anchor>
        <QueryState query={query}>{app && <Paper withBorder p="xl"><Stack gap="lg">
            <Group><AppIcon app={app} size={64} /><Box><Title order={1} size="h2">{app.name}</Title><Group mt="xs"><Badge variant="light">{t('appStore.version')} {app.releaseTag || '–'}</Badge><Badge color="gray" variant="light">{t(app.is_private ? 'appStore.private' : 'appStore.public')}</Badge></Group></Box></Group>
            <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{app.description || t('appStore.noDescription')}</Text>
            {repository && <Anchor href={repository} target="_blank" rel="noopener noreferrer" size="sm">{t('appStore.repository')} ↗</Anchor>}
            <Box><LegacyLink path={`/apps/${encodeURIComponent(app.appId)}`}>{t('appStore.openApp')}</LegacyLink><Text size="sm" c="dimmed" mt="sm">{t('appStore.handoff')}</Text></Box>
        </Stack></Paper>}</QueryState>
    </Stack>;
}

export function Deployments() {
    const { t, i18n } = useTranslation();
    const query = useAppStoreQuery('deployments');
    const statusColor = status => status === 'success' ? 'green' : status.includes('failed') ? 'red' : 'gray';
    return <Stack gap="lg">
        <Group justify="space-between"><Box><Title order={1} size="h2">{t('appStore.deployments')}</Title><Text c="dimmed" mt={6}>{t('appStore.deploymentIntro')}</Text></Box>
            <Button variant="default" leftSection={<RefreshCw size={16} />} onClick={() => query.refetch()} loading={query.isFetching}>{t('appStore.refresh')}</Button></Group>
        <QueryState query={query}>
            {query.data?.length ? <Paper withBorder><Table.ScrollContainer minWidth={660}><Table verticalSpacing="md" horizontalSpacing="md">
                <Table.Thead><Table.Tr>{['deploymentName', 'status', 'created'].map(k => <Table.Th key={k}>{t(`appStore.${k}`)}</Table.Th>)}<Table.Th><span className="app-store-sr-only">{t('appStore.openDeployment')}</span></Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{query.data.map(d => <Table.Tr key={d.deploymentId}>
                    <Table.Td><Group gap="sm"><Server size={18} /><Text size="sm" fw={500}>{d.name}</Text></Group></Table.Td>
                    <Table.Td><Badge variant="light" color={statusColor(d.status)}>{t(`appStore.statuses.${d.status}`, { defaultValue: d.status })}</Badge></Table.Td>
                    <Table.Td>{new Date(d.created_at).toLocaleDateString(i18n.language)}</Table.Td>
                    <Table.Td><LegacyLink path={`/deployments/${encodeURIComponent(d.deploymentId)}`} size="xs" variant="subtle">{t('appStore.openDeployment')}</LegacyLink></Table.Td>
                </Table.Tr>)}</Table.Tbody>
            </Table></Table.ScrollContainer></Paper> : <Empty title={t('appStore.noDeployments')} description={t('appStore.noDeploymentsHint')}><Button component={Link} href="/apps" variant="light">{t('appStore.catalog')}</Button></Empty>}
        </QueryState>
    </Stack>;
}

export function AppStore() {
    const { t } = useTranslation();
    return <Container size="xl" py="lg"><Switch>
        <Route path="/"><Redirect to="/apps" replace /></Route>
        <Route path="/apps" component={Catalog} />
        <Route path="/apps/:id" component={AppDetail} />
        <Route path="/deployments" component={Deployments} />
        <Route><Stack><Title order={2}>{t('app.notFound')}</Title><Anchor component={Link} href="/apps">{t('appStore.back')}</Anchor></Stack></Route>
    </Switch></Container>;
}
