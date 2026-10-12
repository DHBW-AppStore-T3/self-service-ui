import { Badge, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { COLOR, UNLIMITED_QUOTA, USAGE_COLOR, isAvailability, resourceSummaryText, usageLevel, measuredUse, openstackSide, resourceLabel, windowName } from './util-project.jsx';

// ProjectResources: what a project was granted and, where the reconciler has
// measured it, how much of that is in use right now — a bar per quantity, the
// VMs among them, and per availability whether anything uses it. The
// measurement is refreshed on every reconciler pass, so it is minutes old at
// most. Before the first measurement it is the plain summary line.

export function ProjectResources({ node, resources, quota, size = 'xs' }) {
    const { t } = useTranslation();
    const inUse = measuredUse(node);
    if (!inUse) {
        const text = resourceSummaryText(resources, quota);
        return text ? <Text size={size}>{text}</Text> : null;
    }

    const granted = (resources || []).filter(r => !isAvailability(r) && (quota?.[r.id] ?? 0) !== 0);
    // An amount per window is consumed rather than held: its bar has its own tooltip.
    const quantities = granted.filter(r => !r.window);
    const consumed = granted.filter(r => r.window);
    const os = openstackSide(node);
    const grantUse = os.grant_use;
    // Granted ones, and any that is used without being granted: that is the
    // one a reader most needs to see.
    const availabilities = (resources || []).filter(r => isAvailability(r) && (quota?.[r.id] === 1 || (grantUse?.[r.id] ?? 0) > 0));
    const servers = os.facts?.servers;

    return (
        <Stack gap={6}>
            <Tooltip label={t('projects.resources.usedOfGranted')} openDelay={600}>
                <Stack gap={6}>
                    {quantities.map(r => (
                        <UsageMeter key={r.id} label={resourceLabel(t, r)}
                            used={inUse[r.id]} limit={quota[r.id]} />
                    ))}
                    {typeof servers === 'number' && (
                        <UsageMeter label={t('projects.resources.vms')} used={servers} limit={os.facts?.server_limit} />
                    )}
                </Stack>
            </Tooltip>
            {consumed.map(r => (
                <Tooltip key={r.id} label={t('projects.resources.consumedOfGranted', { window: windowName(t, r.window) })} openDelay={600}>
                    <div>
                        <UsageMeter label={resourceLabel(t, r)} used={inUse[r.id]} limit={quota[r.id]} />
                    </div>
                </Tooltip>
            ))}
            {availabilities.length > 0 && (
                <Group gap={4} wrap="wrap">
                    {availabilities.map(r => (
                        <GrantUseBadge key={r.id} resource={r} granted={quota?.[r.id] === 1} count={grantUse?.[r.id]} />
                    ))}
                </Group>
            )}
        </Stack>
    );
}

// UsageMeter is one quantity: what is in use of what is granted, as a bar. An
// unmeasured value shows the limit alone; no limit (or none known) leaves the
// bar out. Coloured by usageLevel, like the table: a hint from 80 %, a warning
// when everything is in use — or more, which OpenStack allows after a quota
// was lowered below what is running.
// Without a label it is the line under an input field; for an amount per window
// that line says it was consumed in the window.
export function UsageMeter({ label, used, limit, window }) {
    const { t } = useTranslation();
    const measured = typeof used === 'number';
    const capped = typeof limit === 'number' && limit !== UNLIMITED_QUOTA && limit >= 0;
    const limitText = capped ? limit : '∞';
    const pct = capped && measured ? (limit > 0 ? (used / limit) * 100 : (used > 0 ? 100 : 0)) : 0;
    const level = usageLevel(used, capped ? limit : null);
    const color = level && USAGE_COLOR[level];
    const text = measured
        ? (label ? `${used} / ${limitText}` : (window ? t('projects.resources.consumedOf', { used, limit: limitText, window: windowName(t, window) }) : t('projects.resources.usedOf', { used, limit: limitText })))
        : (label ? `${limitText}` : null);
    if (!label && !measured) return null;

    return (
        <Stack gap={2}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                {label && <Text size="xs">{label}</Text>}
                {text && <Text size="xs" c={color ? `${color}.8` : 'dimmed'} fw={color ? 600 : undefined}>{text}</Text>}
            </Group>
            {capped && measured && (
                <Progress size="xs" value={Math.min(pct, 100)} color={color || COLOR.info} />
            )}
        </Stack>
    );
}

// grantUseText says what uses an availability: servers for a flavour or an
// image, devices — servers, routers, load balancers — for a network. null
// while it has not been measured.
export function grantUseText(t, resource, count) {
    if (typeof count !== 'number') return null;
    if (count === 0) return t('projects.resources.grantUnused');
    return resource?.grant_type === 'network'
        ? t('projects.resources.grantDevices', { count })
        : t('projects.resources.grantServers', { count });
}

// GrantUseBadge is one availability on a card: in use (with how many), granted
// but unused (outlined), or in use WITHOUT being granted (red) — the state in
// which the reconciler tries to take something away that is still attached.
function GrantUseBadge({ resource, granted, count }) {
    const { t } = useTranslation();
    const measured = typeof count === 'number';
    const used = measured && count > 0;
    const color = !granted ? COLOR.negative : used ? COLOR.info : 'gray';
    const tip = !granted ? t('projects.resources.grantUsedNotGranted') : grantUseText(t, resource, count);
    const badge = (
        <Badge size="xs" variant={measured && !used ? 'outline' : 'light'} color={color}>
            {used ? `${resource.name} · ${count}` : resource.name}
        </Badge>
    );
    return tip ? <Tooltip label={tip}>{badge}</Tooltip> : badge;
}
