import { cloudProjectsEnabled, cloudProjectsMcpUrl, dnsZonesEnabled, dnsZonesMcpUrl, llmEnabled } from '/features.js';

// The token scopes, in one place because two callers need the same list: the
// header renders them as the second-level tabs, the page as its routes. Kept
// apart if they disagreed, a tab would lead to a page that is not there.
//
// `id` is also the path segment, so /tokens/dns and /tokens/projects follow
// from this list rather than being spelled out again.
//
// Pure data on purpose: nav.jsx imports it, and nav.jsx is in the main bundle.
// The API adapters live in the page, where the hooks are. That is also why the
// three texts are translation KEYS rather than sentences: this module is
// imported from everywhere and must not pull in the i18n instance. Whoever
// renders one holds a `t` already (see the helpers at the bottom).
//
// `mcpUrl` is empty where this deployment has not been given an address for that
// API's MCP endpoint, and the panel then renders nothing about MCP — so a scope
// whose backend is too old to speak it simply stays silent rather than handing
// out an address that answers 404. `mcpSubjectKey` names what an assistant would
// be working on, and exists because that sentence has to name it.
export const TOKEN_SCOPES = [
    dnsZonesEnabled && {
        id: 'dns',
        labelKey: 'tokens.scopes.dns.label',
        prefix: 'dynz_token_',
        descriptionKey: 'tokens.scopes.dns.description',
        mcpUrl: dnsZonesMcpUrl,
        mcpServerName: 'dhbw-cloud-dns',
        mcpSubjectKey: 'tokens.scopes.dns.mcpSubject',
    },
    cloudProjectsEnabled && {
        id: 'projects',
        labelKey: 'tokens.scopes.projects.label',
        prefix: 'os_mgt_',
        descriptionKey: 'tokens.scopes.projects.description',
        mcpUrl: cloudProjectsMcpUrl,
        mcpServerName: 'dhbw-cloud-projects',
        mcpSubjectKey: 'tokens.scopes.projects.mcpSubject',
    },
    // The management API of the AI service (workspaces, GPU servers, models). Its tokens are not the LLM keys: those call the models on the OpenAI-compatible API and live in the LLM area. No MCP endpoint yet. "Never expires" only for a read-only token or an admin's (allowNever: 'readOnlyOrAdmin', matching the service; `isAdmin` comes from the page), so the choice is not offered where the server would refuse it. `noteKey` is the sentence that keeps the two credentials apart on the page itself.
    llmEnabled && {
        id: 'ai',
        labelKey: 'tokens.scopes.ai.label',
        prefix: 'aiaas_',
        descriptionKey: 'tokens.scopes.ai.description',
        noteKey: 'tokens.scopes.ai.note',
        allowNever: 'readOnlyOrAdmin',
        mcpUrl: '',
    },
].filter(Boolean);

export const tokenScopePath = (scope) => `/tokens/${scope.id}`;

// The three texts of a scope, each taking the caller's `t`. Written here rather
// than spelled out at every call site so a renamed key is one edit.
export const tokenScopeLabel = (scope, t) => t(scope.labelKey);
export const tokenScopeDescription = (scope, t) => t(scope.descriptionKey);
// A scope assembled by a test or an older caller may carry no subject; the
// sentence still has to name something.
export const tokenScopeMcpSubject = (scope, t) => (
    scope.mcpSubjectKey ? t(scope.mcpSubjectKey) : t('tokens.mcp.defaultSubject')
);
