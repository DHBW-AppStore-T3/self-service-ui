import { useState } from 'react';
import { Badge, Button, Group, Select, Text, Stack } from '@mantine/core';
import { ListPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PrincipalImportModal } from './modal-principal-import.jsx';
import { tokenDisplay, useTokenLabels } from './token-labels.jsx';
import { COLOR, formatRoleLabel } from './util-project.jsx';
import { SearchableItemSelector } from './component-searchable-item-selector.jsx';

export function TokenRoleEditor({
    label,
    description,
    authorizedUsers,
    onAddToken,
    onRemoveToken,
    onOpenstackRoleChange,
    searchResults,
    isSearching,
    onSearch,
    roles,
    defaultOpenstackRole = 'member',
    error,
    emptyMessage,
    isActive = true,
    onFocus = null,
    readOnly = false,
}) {
    const { t } = useTranslation();
    const [importing, setImporting] = useState(false);
    const labels = useTokenLabels((authorizedUsers || []).map(a => a.token));
    const noUsers = emptyMessage ?? t('projects.memberEditor.empty');
    const renderSearchResult = (item, onAdd, buttonLabel) => (
        <Group justify="space-between" key={item}>
            <Text size="sm">{item}</Text>
            <Button
                size="xs"
                variant="light"
                onClick={() => onAdd(item, defaultOpenstackRole)}
            >
                {buttonLabel}
            </Button>
        </Group>
    );

    const renderItem = (auth, onRemove) => {
        if (!auth) return null;
        return (
            <Group justify="space-between" key={auth.token} align="center" wrap="nowrap">
                <Text size="sm">{tokenDisplay(auth.token, labels[auth.token])}</Text>
                <Group gap="xs">
                    <Text size="xs" c="dimmed">{t('projects.memberEditor.openstackRole')}</Text>
                    <Select
                        size="xs"
                        value={auth.openstack_role}
                        onChange={(newRole) => { if (newRole) onOpenstackRoleChange(auth.token, newRole); }}
                        data={roles.map(role => ({ value: role, label: formatRoleLabel(role) }))}
                        w={130}
                    />
                    <Button
                        size="xs"
                        color={COLOR.negative}
                        variant="light"
                        onClick={() => onRemove(auth.token)}
                    >
                        {t('projects.forms.remove')}
                    </Button>
                </Group>
            </Group>
        );
    };

    if (readOnly) {
        const users = authorizedUsers || [];
        return (
            <Stack gap="xs">
                {label && <Text size="sm" fw={600}>{label}</Text>}
                {users.length === 0
                    ? <Text size="xs" c="dimmed">{noUsers}</Text>
                    : users.map(auth => (
                        <Group key={auth.token} gap="xs">
                            <Text size="sm">{auth.token}</Text>
                            <Badge size="xs" variant="outline" color="gray">
                                {formatRoleLabel(auth.openstack_role)}
                            </Badge>
                        </Group>
                    ))
                }
            </Stack>
        );
    }

    return (
        <>
        <SearchableItemSelector
            label={label}
            selectedItems={authorizedUsers}
            onAdd={onAddToken}
            onRemove={onRemoveToken}
            searchResults={searchResults}
            isSearching={isSearching}
            onSearch={onSearch}
            placeholder={t('projects.memberEditor.placeholder')}
            searchDescription={description ?? t('projects.memberEditor.searchHint')}
            emptyMessage={noUsers}
            buttonLabel={t('projects.forms.add')}
            renderItem={renderItem}
            renderSearchResult={renderSearchResult}
            error={error}
            isActive={isActive}
            onFocus={onFocus}
            searchAction={
                <Button variant="default" leftSection={<ListPlus size={16} />} onClick={() => setImporting(true)}>
                    {t('projects.principalImport.open')}
                </Button>
            }
        />
        {importing && (
            <PrincipalImportModal
                existing={(authorizedUsers || []).map(a => a.token)}
                roles={roles}
                defaultRole={defaultOpenstackRole}
                onImport={(entries) => entries.forEach(e => onAddToken(e.token, e.role))}
                onClose={() => setImporting(false)}
            />
        )}
        </>
    );
}
