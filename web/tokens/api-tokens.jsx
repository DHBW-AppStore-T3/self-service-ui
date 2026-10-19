import { Trans, useTranslation } from 'react-i18next';
import { Alert, Container, Stack, Text, Title } from '@mantine/core';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { useNodesApi } from '/projects/api-nodes.jsx';
import { projectKeys } from '/projects/query-keys.js';
import { TOKEN_SCOPES } from '/tokens/scopes.js';
import { TokenScopePanel } from '/tokens/token-scope-panel.jsx';

// The API tokens of one API, in the section of the menu that API belongs to,
// next to its documentation: Cloud for the projects API, DNS for the zones API.
// `scope` is the scope id (see scopes.js).
//
// What this page must NOT suggest is one credential. The tokens are not
// interchangeable: different prefixes, different databases, different issuers,
// and the two services do not even agree on which claim identifies their owner.
// Each section shows its own, with its own prefix.
export function ApiTokens({ scope: scopeId }) {
    const { t } = useTranslation();
    // Both hooks run unconditionally — hooks cannot be called behind a
    // condition, and neither one talks to a server until a query does.
    // useNodesApi returns null where the projects API is not configured.
    const zonesApi = useZonesApi();
    const nodesApi = useNodesApi();
    // Always an object; whether the AI service exists in this deployment is the scope list's question (llmEnabled).
    const llmApi = useLlmApi();
    // Admins of the AI service may issue tokens without expiry there (and anyone a read-only one).
    const { isAdmin: llmAdmin } = useLlmMe();

    // The API adapter per scope id. Kept next to the hooks rather than in
    // scopes.js, which nav.jsx imports and which therefore has to stay free of
    // anything that touches an SDK.
    const adapters = {
        dns: zonesApi && {
            queryKey: dyndnsKeys.tokens(),
            api: {
                list: () => zonesApi.listTokens(),
                create: (opts) => zonesApi.createToken(opts),
                remove: (id) => zonesApi.deleteToken(id),
            },
        },
        projects: nodesApi && {
            queryKey: projectKeys.apiTokens(),
            api: {
                list: () => nodesApi.listApiTokens(),
                create: (opts) => nodesApi.createApiToken(opts),
                remove: (id) => nodesApi.deleteApiToken(id),
            },
        },
        ai: {
            isAdmin: llmAdmin,
            queryKey: llmKeys.apiTokens(),
            api: {
                list: () => llmApi.listApiTokens(),
                create: (opts) => llmApi.createApiToken(opts),
                remove: (id) => llmApi.deleteApiToken(id),
            },
        },
    };

    const scope = TOKEN_SCOPES.find(s => s.id === scopeId && adapters[s.id]);

    return (
        <Container size="lg" py="xl">
            <Stack gap="md">
                <Title order={2}>{t('tokens.page.title')}</Title>

                <Text size="sm" c="dimmed">
                    {/* The header is a code sample, so it stays out of the
                        translations and is passed in as a value. */}
                    <Trans i18nKey="tokens.page.intro"
                        values={{ header: 'Authorization: Bearer <token>' }}
                        components={{ 1: <Text span inherit ff="monospace" /> }} />
                </Text>

                {!scope ? (
                    // Reachable only by typing the URL: the menu entry is gated
                    // on the API being configured.
                    <Alert color="yellow" title={t('tokens.page.noApiTitle')}>
                        {t('tokens.page.noApiMessage')}
                    </Alert>
                ) : (
                    <TokenScopePanel scope={{ ...scope, ...adapters[scope.id] }} />
                )}
            </Stack>
        </Container>
    );
}
