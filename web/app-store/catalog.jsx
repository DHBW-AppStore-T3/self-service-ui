import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Badge, Box, Button, Card, Chip, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { ArrowRight, Search } from 'lucide-react';
import { DEPARTMENTS, activeCatalogFilter, filterApps, plainSummary } from './api.js';
import { useApps, useRole } from './queries.jsx';
import { AppIcon, EmptyState, LegacyLink, StateView } from './shared.jsx';

function AppCard({ app }) {
    const { t } = useTranslation();
    return (
        <Card withBorder padding="lg" component="article">
            <Group justify="space-between" mb="md">
                <AppIcon app={app} />
                <Badge variant="light" color={app.is_private ? 'gray' : 'dhbw'}>
                    {t(app.is_private ? 'appStore.private' : 'appStore.public')}
                </Badge>
            </Group>
            <Title order={2} size="h4">{app.name}</Title>
            <Text size="sm" c="dimmed" mt="xs" lineClamp={3} style={{ flex: 1, overflowWrap: 'anywhere' }}>
                {plainSummary(app.description) || t('appStore.noDescription')}
            </Text>
            <Group justify="space-between" mt="xl" gap="xs">
                <Text size="xs" c="dimmed">{app.releaseTag ? `${t('appStore.version')} ${app.releaseTag}` : ''}</Text>
                <Button component={Link} href={`/apps/${encodeURIComponent(app.appId)}`} variant="light" size="xs"
                    rightSection={<ArrowRight size={14} />}>
                    {t('appStore.details')}
                </Button>
            </Group>
        </Card>
    );
}

export function Catalog() {
    const { t, i18n } = useTranslation();
    const query = useApps();
    const { staff, isAdminView } = useRole();
    const [search, setSearch] = useState('');
    const [visibility, setVisibility] = useState('all');
    const [sort, setSort] = useState('name');
    // null until a chip is clicked: then the default applies (activeCatalogFilter).
    const [selected, setSelected] = useState(null);

    const all = query.data ?? [];
    const filter = activeCatalogFilter(selected, all);
    // Visibility only matters to whoever manages apps: private ones are the
    // owner's and the admin's business, a lecturer's catalog has no use for it.
    const effectiveVisibility = isAdminView ? visibility : 'all';
    const rules = { search, visibility: effectiveVisibility, sort };
    const apps = filterApps(all, { ...rules, filter }, i18n.language);
    const hasRecommended = all.some(app => app.recommended === true);
    const chips = [...(hasRecommended ? ['recommended'] : []), 'all', ...DEPARTMENTS];
    const filtered = search.trim() !== '' || effectiveVisibility !== 'all' || filter !== 'all';
    const departmentEmpty = DEPARTMENTS.includes(filter) && search.trim() === '' && effectiveVisibility === 'all';

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
                <Box>
                    <Title order={1} size="h2">{t('appStore.title')}</Title>
                    <Text c="dimmed" mt={6}>{t(staff ? 'appStore.introStaff' : 'appStore.introStudent')}</Text>
                </Box>
                {staff && <LegacyLink path="/apps" variant="default">{t('appStore.manage')}</LegacyLink>}
            </Group>

            <Paper withBorder p="md">
                <Stack gap="md">
                    <SimpleGrid cols={{ base: 1, sm: isAdminView ? 3 : 2 }}>
                        <TextInput label={t('appStore.search')} placeholder={t('appStore.searchPlaceholder')}
                            leftSection={<Search size={17} />} value={search} onChange={e => setSearch(e.currentTarget.value)} />
                        {isAdminView && (
                            <Select label={t('appStore.visibility')} value={visibility} allowDeselect={false}
                                onChange={v => setVisibility(v || 'all')}
                                data={['all', 'public', 'private'].map(value => ({ value, label: t(`appStore.${value}`) }))} />
                        )}
                        <Select label={t('appStore.sort')} value={sort} allowDeselect={false}
                            onChange={v => setSort(v || 'name')}
                            data={['name', 'newest'].map(value => ({ value, label: t(`appStore.${value}`) }))} />
                    </SimpleGrid>
                    <Chip.Group multiple={false} value={filter} onChange={setSelected}>
                        <Group gap="xs" role="group" aria-label={t('appStore.filterLabel')}>
                            {chips.map(key => (
                                <Chip key={key} value={key} variant="outline" size="sm">
                                    {t(`appStore.categories.${key}`)} ({filterApps(all, { ...rules, filter: key }, i18n.language).length})
                                </Chip>
                            ))}
                        </Group>
                    </Chip.Group>
                </Stack>
            </Paper>

            <StateView query={query}>
                <Text c="dimmed" size="sm" role="status">{t('appStore.results', { count: apps.length })}</Text>
                {apps.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                        {apps.map(app => <AppCard key={app.appId} app={app} />)}
                    </SimpleGrid>
                ) : (
                    <EmptyState
                        title={t(all.length ? 'appStore.noResults' : 'appStore.empty')}
                        description={departmentEmpty
                            ? t('appStore.noAppsInDepartment', { department: t(`appStore.categories.${filter}`) })
                            : t(all.length ? 'appStore.noResultsHint' : 'appStore.emptyHint')}>
                        {filtered && (
                            <Button variant="subtle" onClick={() => { setSearch(''); setVisibility('all'); setSelected('all'); }}>
                                {t('appStore.reset')}
                            </Button>
                        )}
                    </EmptyState>
                )}
            </StateView>
        </Stack>
    );
}
