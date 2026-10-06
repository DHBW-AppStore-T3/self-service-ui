// Same-origin BFF requests: oauth2-proxy supplies the backend's Keycloak bearer.
// The development dummy identity used by the cloud APIs is NOT an App Store login.
export function createAppStoreApi({ baseUrl, onUnauthorized = () => {}, fetchImpl = fetch }) {
    async function get(path, signal) {
        const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
            credentials: 'same-origin', redirect: 'error', headers: { Accept: 'application/json' }, signal,
        });
        if (response.status === 401) onUnauthorized();
        if (!response.ok) {
            const error = new Error(`App Store HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }
        if (!response.headers.get('content-type')?.includes('application/json')) {
            throw new Error('App Store response is not JSON');
        }
        return response.json();
    }
    async function list(path, signal) {
        const result = [];
        for (let skip = 0; ; skip += 100) {
            const page = await get(`${path}?skip=${skip}&limit=100`, signal);
            if (!Array.isArray(page)) throw new Error('App Store response is not a list');
            result.push(...page);
            if (page.length < 100) return result;
        }
    }
    return {
        apps: signal => list('/apps/', signal),
        app: (id, signal) => get(`/apps/${encodeURIComponent(id)}`, signal),
        deployments: signal => list('/deployments/', signal),
    };
}

export function frontendLink(baseUrl, path) {
    if (!baseUrl) return null;
    try {
        const base = new URL(baseUrl, window.location.origin);
        if (!['http:', 'https:'].includes(base.protocol)) return null;
        return `${base.href.replace(/\/$/, '')}${path}`;
    } catch { return null; }
}
