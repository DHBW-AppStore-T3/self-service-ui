import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Button, Group, PasswordInput, Stack, Table, Text, TextInput } from '@mantine/core';
import { Plus, Trash2 } from 'lucide-react';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { formatDate } from '/format-date.js';

// ProjectCredentials is a project's access to private repositories and registries (workspace settings): per host a user name and token, used for the material from Git, the check of an existing image and on the nodes as the project's pull secret. The token goes in once and is never shown again; a host's access is replaced by setting it again. Saved at once, apart from the dialog's Save button.
export function ProjectCredentials({ slug }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const queryClient = useQueryClient();
    const key = ['gpu', 'credentials', slug];
    const list = useQuery({ queryKey: key, queryFn: () => api.listCredentials(slug), enabled: !!slug });
    const [form, setForm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const run = async (fn) => {
        setBusy(true); setError('');
        try {
            await fn();
            await queryClient.invalidateQueries({ queryKey: key });
            await queryClient.invalidateQueries({ queryKey: ['gpu', 'projects'] });
            return true;
        } catch (e) {
            setError(e.message);
            return false;
        } finally {
            setBusy(false);
        }
    };
    const save = async () => {
        if (await run(() => api.setCredential(slug, form))) setForm(null);
    };
    const items = list.data ?? [];
    return (
        <Stack gap="xs">
            {items.length > 0 && (
                <Table withRowBorders={false} verticalSpacing={4} fz="sm">
                    <Table.Tbody>
                        {items.map(c => (
                            <Table.Tr key={c.host}>
                                <Table.Td ff="monospace">{c.host}</Table.Td>
                                <Table.Td>{c.username}</Table.Td>
                                <Table.Td c="dimmed" fz="xs">{t('gpu.projects.credentials.setBy', { who: c.created_by || '—', when: formatDate(c.updated_at) })}</Table.Td>
                                <Table.Td w={40}>
                                    <ActionIcon variant="subtle" color="red" aria-label={t('gpu.projects.remove')} disabled={busy} onClick={() => run(() => api.deleteCredential(slug, c.host))}><Trash2 size={14} /></ActionIcon>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}
            {form ? (
                <Stack gap={6}>
                    <Group gap="xs" wrap="wrap" align="flex-end">
                        <TextInput w={200} label={t('gpu.projects.credentials.host')} placeholder="gitlab.dhbw.de" value={form.host} onChange={e => setForm({ ...form, host: e.currentTarget.value.trim() })} />
                        <TextInput w={200} label={t('gpu.projects.credentials.username')} value={form.username} onChange={e => setForm({ ...form, username: e.currentTarget.value.trim() })} />
                        <PasswordInput style={{ flex: 1, minWidth: 200 }} label={t('gpu.projects.credentials.token')} value={form.token} onChange={e => setForm({ ...form, token: e.currentTarget.value.trim() })} autoComplete="new-password" />
                    </Group>
                    <Text size="xs" c="dimmed">{t('gpu.projects.credentials.providers')}</Text>
                    <Group gap="xs">
                        <Button size="xs" loading={busy} disabled={!form.host || !form.username || !form.token} onClick={save}>{t('gpu.projects.credentials.save')}</Button>
                        <Button size="xs" variant="subtle" onClick={() => { setForm(null); setError(''); }}>{t('gpu.projects.cancel')}</Button>
                    </Group>
                </Stack>
            ) : (
                <Button size="xs" variant="subtle" leftSection={<Plus size={14} />} w="fit-content" onClick={() => setForm({ host: '', username: '', token: '' })}>{t('gpu.projects.credentials.add')}</Button>
            )}
            {error && <Text size="xs" c="red">{error}</Text>}
        </Stack>
    );
}
