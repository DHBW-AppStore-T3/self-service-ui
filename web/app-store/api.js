// Client and pure rules for the DHBW App Store backend (FastAPI).
//
// Requests are same-origin and carry no token: in a deployment the oauth2-proxy
// in front injects the Keycloak bearer (see claude_docs/app-store.md). The dev login's
// dummy identity is NOT an App Store login — the backend only accepts a real
// access token, so in that mode every call answers 401.

import { departmentsForGitLink } from './departments.js';

export { DEPARTMENTS, departmentsForGitLink, normalizeGitLink } from './departments.js';

// HTTP statuses the views tell apart.
export const UNAUTHORIZED = 401;
export const FORBIDDEN = 403;
export const NOT_FOUND = 404;
export const CONFLICT = 409;
export const PRECONDITION_FAILED = 412;
export const BAD_GATEWAY = 502;

// The backend's page size limit; `list` walks pages of this size.
const PAGE_SIZE = 100;

/**
 * createAppStoreApi returns the backend calls this UI makes.
 *
 * `onUnauthorized` runs on every 401 — the caller decides whether that means
 * "session expired" (behind the proxy) or "not possible here" (dev login).
 * Errors carry `status` and, where the backend sends one, the structured
 * `reason` (e.g. `role_required`, `openstack_credentials_missing`).
 */
export function createAppStoreApi({ baseUrl, onUnauthorized = () => {}, fetchImpl = fetch }) {
    const root = baseUrl.replace(/\/$/, '');

    async function request(path, { method = 'GET', body, signal } = {}) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        // redirect: 'error' — a proxy answering an expired session with a
        // redirect to the login page must fail here, not hand that HTML page
        // to the JSON parser as if it were data.
        const response = await fetchImpl(`${root}${path}`, {
            method,
            credentials: 'same-origin',
            redirect: 'error',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
        });
        if (response.status === UNAUTHORIZED) onUnauthorized();
        if (!response.ok) throw await httpError(response);
        if (response.status === 204) return null;
        if (!response.headers.get('content-type')?.includes('application/json')) {
            throw new Error('App Store response is not JSON');
        }
        return response.json();
    }

    async function list(path, signal) {
        const result = [];
        for (let skip = 0; ; skip += PAGE_SIZE) {
            const page = await request(`${path}?skip=${skip}&limit=${PAGE_SIZE}`, { signal });
            if (!Array.isArray(page)) throw new Error('App Store response is not a list');
            result.push(...page);
            if (page.length < PAGE_SIZE) return result;
        }
    }

    const id = value => encodeURIComponent(value);

    return {
        me: signal => request('/users/me', { signal }),
        apps: signal => list('/apps/', signal),
        app: (appId, signal) => request(`/apps/${id(appId)}`, { signal }),
        appVariables: (appId, version, signal) =>
            request(`/apps/${id(appId)}/variables?version=${id(version)}`, { signal }),
        deployments: signal => list('/deployments/', signal),
        myAccess: (deploymentId, signal) => request(`/deployments/${id(deploymentId)}/my-access`, { signal }),
        createDeployment: body => request('/deployments/', { method: 'POST', body }),
        // How a version runs: runtime, `scope` ('user' = one VM per person), the
        // cpu/memory and network choices the author released.
        appRuntime: (appId, version, signal) => request(`/apps/${id(appId)}/runtime?version=${id(version)}`, { signal }),
        // Staff only: who can be given access to a deployment.
        courses: signal => list('/courses/', signal),
        course: (courseId, signal) => request(`/courses/${id(courseId)}`, { signal }),
        students: signal => request(`/users/?role=student&limit=1000`, { signal }),
        searchStudents: (query, signal) => request(`/users/search?query=${encodeURIComponent(query)}&limit=50`, { signal }),
        deployment: (deploymentId, signal) => request(`/deployments/${id(deploymentId)}`, { signal }),
        // Owner view only: every task of the deployment, newest information first.
        deploymentTasks: (deploymentId, signal) => request(`/tasks/deployment/${id(deploymentId)}`, { signal }),
        // The same detail with the latest task's full log; large, so asked for on demand.
        deploymentLogs: (deploymentId, signal) =>
            request(`/deployments/${id(deploymentId)}?include_logs=true`, { signal }),
        // Server-Sent Events of the latest task (owner view only), for an EventSource.
        streamUrl: deploymentId => `${root}/deployments/${id(deploymentId)}/stream`,
        // The caller's OpenStack credentials, one per project, without secrets.
        credentials: signal => request('/me/openstack-credentials', { signal }),
        // Keystone checks the credential before anything is stored; 422 says why not.
        // `cloudName` picks the entry when the file holds several clouds.
        saveCredentialFromYaml: (cloudsYaml, cloudName) => request('/me/openstack-credentials/from-yaml', {
            method: 'POST',
            body: { clouds_yaml: cloudsYaml, ...(cloudName ? { cloud_name: cloudName } : {}) },
        }),
        testCredential: credentialId => request(`/me/openstack-credentials/${id(credentialId)}/test`, { method: 'POST' }),
        deleteCredential: credentialId => request(`/me/openstack-credentials/${id(credentialId)}`, { method: 'DELETE' }),
        // Owner or admin: every approval entry of the app, whatever its status.
        versionApprovals: (appId, signal) => request(`/apps/${id(appId)}/versions`, { signal }),
        // Admin only (the backend answers 403 to anyone else). `null` clears the setting.
        setDeployVersion: (appId, versionTag) =>
            request(`/admin/apps/${id(appId)}/deploy-version`, { method: 'PUT', body: { version_tag: versionTag } }),
        // Admin only (the backend answers 403 to anyone else).
        setRecommended: (appId, recommended) =>
            request(`/admin/apps/${id(appId)}/recommended`, { method: 'PUT', body: { recommended } }),
    };
}

// httpError turns a failed response into an Error with `status` and `reason`.
// FastAPI sends `{"detail": "..."}` or `{"detail": {"reason": "..."}}`; a body
// that is not JSON (a proxy's error page) leaves both message parts generic.
async function httpError(response) {
    let detail;
    try {
        detail = (await response.json())?.detail;
    } catch {
        detail = undefined;
    }
    const reason = typeof detail === 'object' && detail !== null ? detail.reason : undefined;
    const message = typeof detail === 'string' ? detail : reason;
    const error = new Error(message ? `App Store HTTP ${response.status}: ${message}` : `App Store HTTP ${response.status}`);
    error.status = response.status;
    error.reason = reason;
    // Structured details beyond the reason, e.g. the `cause` of a refused credential.
    error.detail = typeof detail === 'object' && detail !== null ? detail : undefined;
    return error;
}

/**
 * frontendLink builds a link into the existing (Vue) App Store frontend, or
 * null when its address is missing or not http(s) — a configured
 * `javascript:` URL must never end up in an href.
 */
export function frontendLink(baseUrl, path) {
    if (!baseUrl) return null;
    try {
        const base = new URL(baseUrl, window.location.origin);
        if (!['http:', 'https:'].includes(base.protocol)) return null;
        return `${base.href.replace(/\/$/, '')}${path}`;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Catalog

// The catalog's first filter: 'recommended', 'all' or one of the departments.
//
// `selected` is what the person clicked, or null while they have not. Until they
// do, recommended is the default — but only while something is recommended: an
// empty default would be the first thing a lecturer sees.
export function activeCatalogFilter(selected, apps) {
    const hasRecommended = apps.some(app => app.recommended === true);
    if (selected === 'recommended' && !hasRecommended) return 'all';
    return selected ?? (hasRecommended ? 'recommended' : 'all');
}

function matchesCatalogFilter(app, filter) {
    if (filter === 'all') return true;
    if (filter === 'recommended') return app.recommended === true;
    return departmentsForGitLink(app.git_link).includes(filter);
}

// filterApps applies the filter, the search box and the select. Search matches
// name and description, case-insensitively in the UI language.
export function filterApps(apps, { search, visibility, sort, filter = 'all' }, locale) {
    const needle = search.trim().toLocaleLowerCase(locale);
    return apps
        .filter(app => matchesCatalogFilter(app, filter))
        .filter(app => `${app.name} ${app.description || ''}`.toLocaleLowerCase(locale).includes(needle))
        .filter(app => visibility === 'all' || app.is_private === (visibility === 'private'))
        .sort((a, b) => sort === 'newest'
            ? Date.parse(b.created_at) - Date.parse(a.created_at)
            : a.name.localeCompare(b.name, locale));
}

/**
 * plainSummary turns a Markdown description into the plain text a catalog card
 * shows: headings, emphasis, code ticks, links and table rows reduced to
 * their words. Rendering the Markdown inside a three-line preview would show
 * a heading and nothing else; showing it raw showed `#` and `|---|`.
 */
export function plainSummary(markdown) {
    if (!markdown) return '';
    return markdown
        .split('\n')
        .filter(line => !/^\s*\|?\s*:?-{3,}/.test(line))      // table separator rows
        .map(line => line
            .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/, '')  // heading, quote, list markers
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')        // links and images → their text
            .replace(/[*_`~]+/g, '')                          // emphasis, code
            .replace(/\s*\|\s*/g, ' ')                        // table cells
            .trim())
        .filter(Boolean)
        .join(' ');
}

// ---------------------------------------------------------------------------
// Greeting

// What the home page calls the person: the first name the App Store has, else
// the username, else nothing (the page then keeps its neutral title).
export function greetingName(me) {
    return me?.firstName?.trim() || me?.username?.trim() || null;
}

// ---------------------------------------------------------------------------
// OpenStack credentials

/**
 * cloudNames lists the clouds a clouds.yaml defines, so the person can pick one
 * when there are several (the backend wants `cloud_name` then). A plain scan of
 * the keys under `clouds:`, not a YAML parser: a file it cannot read yields no
 * names and goes to the backend, which answers with a proper message.
 */
export function cloudNames(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    const start = lines.findIndex(line => /^clouds:\s*(#.*)?$/.test(line));
    if (start < 0) return [];
    const names = [];
    let indent = null;
    for (const line of lines.slice(start + 1)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const lead = line.length - line.trimStart().length;
        if (lead === 0) break;
        indent ??= lead;
        if (lead !== indent) continue;
        const key = trimmed.match(/^(?:"([^"]+)"|'([^']+)'|([^\s:#"'][^:#]*?))\s*:(?:\s|$)/);
        if (key) names.push(key[1] ?? key[2] ?? key[3]);
    }
    return names;
}

// 'valid', 'invalid' (Keystone refused it at the last check) or 'unverified'
// (stored before projects were checked: it cannot be deployed with until it is
// checked once).
export function credentialState(credential) {
    if (credential.last_validation_error) return 'invalid';
    return credential.project_verified ? 'valid' : 'unverified';
}

// The page to return to after saving credentials, taken from the address. Only
// an app page of this section qualifies: the value is whatever the link said.
export function safeNextPath(path) {
    return typeof path === 'string' && /^\/apps\/[A-Za-z0-9_.~%-]+(?:\/[a-z-]+)?$/.test(path) ? path : null;
}

// ---------------------------------------------------------------------------
// Roles

// Staff set environments up; students get access to them. The backend enforces
// this (`role_required` on POST /deployments/), the UI only stops offering what
// would be refused.
export function isStaff(user) {
    return user?.role === 'teacher' || user?.role === 'admin';
}

// Admins manage the App Store itself: recommendations, versions, approvals.
export function isAdmin(user) {
    return user?.role === 'admin';
}

// ---------------------------------------------------------------------------
// Deployment status

// States a deployment passes through on its own. While any deployment is in
// one of them the list polls; once all have settled it stops.
const TRANSITIONAL = new Set(['pending', 'running', 'destroying', 'pausing', 'resuming']);

export function isTransitional(status) {
    return TRANSITIONAL.has(status);
}

// statusColor maps a status to a badge colour. `status` comes from the latest
// task and is null for a deployment that has none yet.
export function statusColor(status) {
    if (!status) return 'gray';
    if (status === 'success') return 'green';
    if (status.endsWith('failed')) return 'red';
    if (isTransitional(status)) return 'blue';
    return 'gray';
}

// ---------------------------------------------------------------------------
// Deploying from this UI

/**
 * versionOptions lists the tags a deployment can be created from, stable
 * releases first. The backend already filters to approved tags for anyone but
 * the owner or an admin; an entry is a dict with the tag under `version`.
 */
export function versionOptions(versions) {
    return (versions ?? [])
        .filter(v => v && typeof v.version === 'string' && v.version)
        .map(v => ({ value: v.version, label: v.name && v.name !== v.version ? `${v.version} – ${v.name}` : v.version, prerelease: v.prerelease === 'True' }))
        .sort((a, b) => Number(a.prerelease) - Number(b.prerelease));
}

/**
 * deployTarget is the version a lecturer deploys: the one an admin fixed, while
 * the list still offers it, otherwise the first of the list (stable releases
 * first) — what lecturers got before anything could be fixed, and what keeps
 * them from being blocked by an admin who has not got round to it. `fixed` says
 * which of the two it is; `version` is null when there is nothing to deploy.
 */
export function deployTarget(app) {
    const options = versionOptions(app?.versions);
    const fixed = app?.deploy_version;
    if (fixed && options.some(option => option.value === fixed)) return { version: fixed, fixed: true };
    return { version: options[0]?.value ?? null, fixed: false };
}

/**
 * approvedVersionOptions lists what an admin may fix as the deploy version:
 * versions the repository still lists that have an approved entry. The backend
 * checks again (the tag may have moved) and refuses with 409 if not. Without
 * the approvals there is nothing to offer.
 */
export function approvedVersionOptions(versions, approvals) {
    if (!approvals) return [];
    const approved = new Set(approvals.filter(a => a.status === 'approved').map(a => a.version_tag));
    return versionOptions(versions).filter(option => approved.has(option.value));
}

/**
 * quickDeployBlocker says why an app cannot be deployed with one click, or
 * null when it can. One click means: no teams, no inputs. Anything the app
 * declares that needs a value — a required variable without default, a file
 * upload, a per-team or per-user value — needs the full wizard of the existing
 * App Store, so this returns 'inputs' and the view links there instead.
 */
export function quickDeployBlocker(variables) {
    for (const v of variables ?? []) {
        if (v.osType === 'file') return 'inputs';
        if (v.varScope === 'team' || v.varScope === 'user') return 'inputs';
        if (v.required && (v.default === undefined || v.default === null)) return 'inputs';
    }
    return null;
}

// deploymentPayload is what POST /deployments/ receives for a one-click
// deployment; the same shape the existing frontend's wizard sends with no
// teams and no inputs.
export function deploymentPayload({ name, appId, releaseTag }) {
    return { name: name.trim(), appId, releaseTag, userInputVar: { tofu: {} }, teams: [] };
}

// ---------------------------------------------------------------------------
// Live log (GET /deployments/{id}/stream)

export const INITIAL_STREAM = { phase: null, progress: null, lines: [], overflow: false, done: null };

// More than this and the oldest lines make room: a terraform run can print tens
// of thousands, and the page only has to show the tail.
const MAX_LOG_LINES = 2000;

// How a task that is already over ends the stream (its snapshot is all there is).
const ENDED_BY_TASK_STATUS = { success: 'succeeded', failed: 'failed', cancelled: 'revoked' };

/**
 * applyStreamEvent folds one Server-Sent Event of the backend into the state of
 * the live view. Events: `snapshot` (first, with the task's status and phase),
 * `progress`, `log`, `overflow` (the backend stopped sending log lines),
 * `started`, and one of `succeeded`/`failed`/`revoked` last. `done` is set by
 * whatever ends the stream, and is what tells the view to stop listening.
 */
export function applyStreamEvent(state, name, payload) {
    switch (name) {
        case 'snapshot': {
            const over = ENDED_BY_TASK_STATUS[payload.status] ?? (payload.status ? null : 'ended');
            return {
                ...state,
                phase: payload.current_phase ?? state.phase,
                progress: payload.progress_pct ?? state.progress,
                done: over,
            };
        }
        case 'progress':
            return {
                ...state,
                phase: payload.current_phase ?? payload.phase ?? state.phase,
                progress: payload.progress_pct ?? payload.percent ?? state.progress,
            };
        case 'log': {
            const lines = [...state.lines, String(payload.message ?? payload.line ?? '')];
            return { ...state, lines: lines.length > MAX_LOG_LINES ? lines.slice(-MAX_LOG_LINES) : lines };
        }
        case 'overflow':
            return { ...state, overflow: true };
        case 'succeeded':
        case 'failed':
        case 'revoked':
            return { ...state, done: name };
        default:
            return state;
    }
}

// ---------------------------------------------------------------------------
// Access credentials (GET /deployments/{id}/my-access)

/**
 * accessEntries flattens the my-access answer into one entry per account.
 * `user_accounts` mirrors the app's tofu output: each value has `username`,
 * `auth` (password or key, per `type`), and an address as `url` or
 * `ip`/`port`. `team_vms` adds the team machine's address where the account
 * has none of its own.
 */
export function accessEntries(access) {
    const vms = Object.values(access?.team_vms ?? {});
    return Object.entries(access?.user_accounts ?? {}).map(([key, account]) => {
        const vm = vms[0] ?? {};
        const host = account.ip || vm.floating_ip || vm.fixed_ip || '';
        const address = account.url || vm.url || (host && account.port ? `${host}:${account.port}` : host);
        return {
            key,
            username: account.username || key,
            address,
            protocol: account.protocol || account.authtype || '',
            secret: account.auth || '',
            secretIsKey: account.type === 'ssh_key',
        };
    });
}
