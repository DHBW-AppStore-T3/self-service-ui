import { useState, useEffect, useContext } from 'react';
import { createContext } from 'react';

export const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function authHeaders(user) {
    return user?.access_token ? { Authorization: `Bearer ${user.access_token}` } : {};
}

// Dummy-auth (dev) user: the local APIs sign every request without a bearer in as their dev user, the seed's root admin — so this is who the header shows. Other people of the mock data are reached as in production, by acting on their behalf (providers/act-as.jsx). No token: a bearer would make the APIs verify it.
export const DEV_EMAIL = 'root.admin@uni.example';
const devSession = () => ({ profile: { email: DEV_EMAIL, name: DEV_EMAIL }, access_token: null });

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // Build-time floor dummy auth (signed in without any login) can ONLY
    // be active in a dev build. `import.meta.env.DEV` is false in every `vite build`
    // artifact (staging/prod images), so no runtime config can re-enable the bypass.
    const useDummyAuth = import.meta.env.DEV && window.appconfig?.dummyAuth === true;

    useEffect(() => {
        (async () => {
            try {
                if (useDummyAuth) {
                    if (!user) setUser(devSession());
                } else {
                    // BFF mode: authentication is done by the oauth2-proxy in
                    // front of this app. If this code runs at all, the request already
                    // passed the proxy, so the user IS authenticated — we just fetch
                    // their identity (email) from the proxy's userinfo endpoint for
                    // display. No token lives in the browser: the proxy injects the
                    // Bearer into /api/* calls server-side (see providers/client.jsx).
                    const res = await fetch('/oauth2/userinfo', {
                        credentials: 'include',
                        headers: { Accept: 'application/json' },
                    });
                    if (res.ok) {
                        const info = await res.json();
                        const email = info.email || info.preferredUsername || info.user || '';
                        setUser({ profile: { email, name: email }, access_token: null });
                    } else {
                        // No valid session (should be rare — the proxy pre-authenticates):
                        // a full-page navigation is the only way to re-run the OIDC login.
                        window.location.href = '/oauth2/start?rd=' +
                            encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        })();
        // Intentionally not depending on `user` — the effect must not re-run on
        // login, which is exactly what it sets.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [useDummyAuth]);

    // Dummy (dev) mode: login/logout toggle the local user (preview signed-out state).
    // BFF (prod) mode: the proxy owns the session — login goes through the proxy
    // sign-in, logout through the proxy sign-out (clears the cookie).
    const login = useDummyAuth
        ? () => setUser(devSession())
        : () => { window.location.href = '/oauth2/start?rd=' + encodeURIComponent(window.location.pathname); };
    const logout = useDummyAuth
        ? () => setUser(null)
        : () => {
            // Full logout: clearing only the proxy cookie would let the
            // still-active Keycloak SSO session silently log the user back in. So we
            // sign_out (drops the proxy cookie) THEN RP-initiated logout at Keycloak
            // (ends the SSO session, returns to the app). client_id + post-logout URI
            // must be registered on the BFF client (config.js oidc.client_id).
            const oidc = window.appconfig?.oidc || {};
            const back = window.location.origin + '/';
            // Stated in the deployment where it is known; the Keycloak path
            // below the issuer otherwise, which is what this always used.
            const endSessionBase = oidc.end_session_url
                || (oidc.issuer_url ? `${oidc.issuer_url}/protocol/openid-connect/logout` : '');
            const endSession = endSessionBase
                ? `${endSessionBase}` +
                `?post_logout_redirect_uri=${encodeURIComponent(back)}` +
                `&client_id=${encodeURIComponent(oidc.client_id || '')}`
                : back;
            window.location.href = '/oauth2/sign_out?rd=' + encodeURIComponent(endSession);
        };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, useDummyAuth }}>
            {children}
        </AuthContext.Provider>
    );
}
