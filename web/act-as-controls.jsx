import { useState } from 'react';
import { ActionIcon, Alert, Button, Group, Loader, Popover, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActAs } from '/providers/act-as.jsx';

// ActAsButton sits in the header, left of the account: one click to act on behalf of somebody, and back. Drawn only for people who may (an admin of at least one service) or while acting, so nobody else sees it at all. While acting it is filled orange — together with the banner the state can never go unnoticed.
export function ActAsButton() {
    const { t } = useTranslation();
    const ctx = useActAs();
    const [open, setOpen] = useState(false);
    if (!ctx.mayActAs && !ctx.actingAs) return null;
    const { actingAs, query, setQuery, matches, hasMore, searching, submitTarget, actAs, stop } = ctx;

    return (
        <Popover opened={open} onChange={setOpen} position="bottom-end" width={340} shadow="md" trapFocus>
            <Popover.Target>
                <Tooltip label={actingAs ? t('actAs.actingAs', { name: actingAs }) : t('actAs.button')} disabled={open}>
                    <ActionIcon size="lg" mr="xs" aria-label={t('actAs.button')}
                        variant={actingAs ? 'filled' : 'subtle'} color={actingAs ? 'orange' : 'gray'}
                        onClick={() => setOpen(o => !o)}>
                        <UserCog size="18" />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="xs">
                    <Text size="sm" fw={600}>{actingAs ? t('actAs.actingAs', { name: actingAs }) : t('actAs.title')}</Text>
                    <Text size="xs" c="dimmed">{t('actAs.explain')}</Text>
                    <TextInput size="sm" data-autofocus placeholder={t('actAs.searchPlaceholder')}
                        value={query} onChange={(e) => setQuery(e.currentTarget.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && submitTarget) actAs(submitTarget); }}
                        rightSection={searching ? <Loader size="xs" /> : null} />
                    {matches.map(email => (
                        <UnstyledButton key={email} onClick={() => actAs(email)} px="xs" py={4}
                            style={{ borderRadius: 4 }} className="act-as-pick">
                            <Text size="sm">{email}</Text>
                        </UnstyledButton>
                    ))}
                    {hasMore && <Text size="xs" c="dimmed">{t('actAs.moreMatches')}</Text>}
                    {query.trim() && !searching && matches.length === 0 && (
                        <Text size="xs" c="dimmed">{t('actAs.noMatch')}</Text>
                    )}
                    <Group justify="space-between" mt="xs">
                        {actingAs
                            ? <Button size="xs" variant="light" color="orange" onClick={stop}>{t('actAs.stop')}</Button>
                            : <span />}
                        <Button size="xs" disabled={!submitTarget} onClick={() => actAs(submitTarget)}>{t('actAs.start')}</Button>
                    </Group>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
}

// ActAsBanner heads every page while acting for somebody: whom, what that means, the way back — and which service refused, if one did.
export function ActAsBanner() {
    const { t } = useTranslation();
    const { actingAs, refused, stop } = useActAs();
    if (!actingAs) return null;
    return (
        <Alert color="orange" variant="light" mb="md" radius={0} style={{ position: 'sticky', top: 0, zIndex: 50 }}>
            <Group justify="space-between" wrap="nowrap" gap="md">
                <div>
                    <Text size="sm" fw={600}>{t('actAs.actingAs', { name: actingAs })}</Text>
                    <Text size="xs">{t('actAs.bannerExplain')}</Text>
                    {refused.length > 0 && (
                        <Text size="xs" c="red.8" mt={4}>
                            {t('actAs.refused', { services: refused.map(id => t(`actAs.service.${id}`)).join(', ') })}
                        </Text>
                    )}
                </div>
                <Button size="xs" color="orange" onClick={stop} style={{ flexShrink: 0 }}>{t('actAs.stop')}</Button>
            </Group>
        </Alert>
    );
}
