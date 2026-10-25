import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appStoreEnabled } from '/features.js';
import { useApiMutation } from '/helper/query-state.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useSession } from '/providers/session.jsx';
import { readAdminView, subscribeAdminView, writeAdminView } from './admin-view.js';
import { INITIAL_STREAM, applyStreamEvent, createAppStoreApi, greetingName, isAdmin, isStaff, isTransitional } from './api.js';

// How often the deployment list refreshes while something is still moving.
const POLL_MS = 15000;

// The same for one deployment, which a person is watching: faster.
const DETAIL_POLL_MS = 5000;

// Every query key starts with this, so one invalidation reaches all of them.
const ROOT = 'app-store';

/**
 * useAppStoreApi returns the client, built once per base URL.
 *
 * A 401 means "the proxy session expired" only where there IS a proxy. With
 * the dev login there is none, and the backend refuses the dummy identity on
 * every call — reporting that as an expired session sent the browser to
 * /oauth2/start, a route the dev server does not have. In that mode the 401
 * stays an error of the query, and StateView explains it.
 */
export function useAppStoreApi() {
    const { useDummyAuth } = useAuth() ?? {};
    const { expire } = useSession();
    const baseUrl = window.appconfig?.appStoreBaseUrl || '/api/app-store';
    return useMemo(
        () => createAppStoreApi({ baseUrl, onUnauthorized: useDummyAuth ? () => {} : expire }),
        [baseUrl, useDummyAuth, expire],
    );
}

// The signed-in user decides every key: a different user must never be shown
// the previous one's cached lists.
function useUserKey() {
    const { user } = useAuth() ?? {};
    return user?.profile?.email ?? null;
}

// The App Store's own record of the user, which carries the role.
export function useMe() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'me'],
        queryFn: ({ signal }) => api.me(signal),
        enabled: appStoreEnabled && Boolean(userKey),
        retry: false,
        staleTime: 5 * 60 * 1000,
    });
}

// The admin-view switch of the signed-in account, as [on, setOn].
export function useAdminViewSwitch() {
    const account = useUserKey();
    const on = useSyncExternalStore(subscribeAdminView, () => readAdminView(account));
    const setOn = useCallback(value => account && writeAdminView(account, value), [account]);
    return [on, setOn];
}

/**
 * useRole answers what the views need to know about the role. While it is
 * unknown (loading, failed), `staff` is false: offering a deploy button the
 * backend would refuse is worse than offering it a moment late.
 *
 * `isAdminView` is an admin with the switch on (/app-store/settings). With it
 * off, an admin is shown the App Store the way a lecturer sees it; the
 * admin-only parts of a view key off this, not off `admin`.
 */
export function useRole() {
    const me = useMe();
    const [adminViewOn] = useAdminViewSwitch();
    const admin = isAdmin(me.data);
    return {
        staff: isStaff(me.data),
        student: me.data?.role === 'student',
        admin,
        isAdminView: admin && adminViewOn,
        loaded: me.isSuccess,
    };
}

export function useApps() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'apps'],
        queryFn: ({ signal }) => api.apps(signal),
        enabled: Boolean(userKey),
        retry: false,
    });
}

export function useApp(appId) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'app', appId],
        queryFn: ({ signal }) => api.app(appId, signal),
        enabled: Boolean(userKey && appId),
        retry: false,
    });
}

// Variables are read from the app's Git repository per version, which is slow
// and does not change for a given tag — hence the long staleTime.
export function useAppVariables(appId, version) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'variables', appId, version],
        queryFn: ({ signal }) => api.appVariables(appId, version, signal),
        enabled: Boolean(userKey && appId && version),
        retry: false,
        staleTime: 10 * 60 * 1000,
    });
}

/**
 * useDeployments polls only while a deployment is still changing state on its
 * own. Polling unconditionally re-fetched every page of the list every 15
 * seconds for as long as the tab was open, which for an admin is every
 * deployment there is.
 */
export function useDeployments() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'deployments'],
        queryFn: ({ signal }) => api.deployments(signal),
        enabled: Boolean(userKey),
        retry: false,
        refetchInterval: query => (query.state.data?.some(d => isTransitional(d.status)) ? POLL_MS : false),
    });
}

export function useMyAccess(deploymentId, enabled) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'my-access', deploymentId],
        queryFn: ({ signal }) => api.myAccess(deploymentId, signal),
        enabled: Boolean(enabled && userKey && deploymentId),
        retry: false,
    });
}

// Errors are shown inline by the deploy form: the reasons it can fail
// (credentials missing, role) need a link next to them, not a modal.
export function useCreateDeployment({ onSuccess } = {}) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useApiMutation({
        mutationFn: body => api.createDeployment(body),
        invalidates: [[ROOT, userKey, 'deployments']],
        onSuccess,
        reportErrors: 'inline',
    });
}

// Admin only: marks an app as recommended or not. Both the list and the
// detail of apps carry the flag, so both are refetched.
export function useSetRecommended() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useApiMutation({
        mutationFn: ({ appId, recommended }) => api.setRecommended(appId, recommended),
        invalidates: [[ROOT, userKey, 'apps'], [ROOT, userKey, 'app']],
    });
}

// Approval entries of one app; the backend answers owners and admins only, so
// the caller says when it is one.
export function useVersionApprovals(appId, enabled) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'approvals', appId],
        queryFn: ({ signal }) => api.versionApprovals(appId, signal),
        enabled: Boolean(enabled && userKey && appId),
        retry: false,
    });
}

// Fixes (or, with null, clears) the version lecturers deploy. Not through
// useApiMutation: a 409 here means one of two specific things the view
// explains next to the button, not the generic "someone else was faster" dialog.
export function useSetDeployVersion() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    const queryClient = useQueryClient();
    const refresh = () => queryClient.invalidateQueries({ queryKey: [ROOT, userKey, 'app'] });
    return useMutation({
        mutationFn: ({ appId, versionTag }) => api.setDeployVersion(appId, versionTag),
        // A refusal can mean the approval just ended, so the app is read again.
        onSettled: refresh,
    });
}

// What the home page calls the person, or null while the App Store has not
// answered (or is not part of this deployment): the page keeps its neutral title then.
export function useGreetingName() {
    const me = useMe();
    return greetingName(me.data);
}

// The caller's stored OpenStack credentials, without secrets.
export function useCredentials() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'credentials'],
        queryFn: ({ signal }) => api.credentials(signal),
        enabled: Boolean(userKey),
        retry: false,
    });
}

// Errors are shown next to the upload, which is where they can be acted on.
export function useSaveCredential({ onSuccess } = {}) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useApiMutation({
        mutationFn: ({ yaml, cloudName }) => api.saveCredentialFromYaml(yaml, cloudName),
        invalidates: [[ROOT, userKey, 'credentials']],
        onSuccess,
        reportErrors: 'inline',
    });
}

export function useTestCredential() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useApiMutation({
        mutationFn: credentialId => api.testCredential(credentialId),
        invalidates: [[ROOT, userKey, 'credentials']],
    });
}

export function useDeleteCredential() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useApiMutation({
        mutationFn: credentialId => api.deleteCredential(credentialId),
        invalidates: [[ROOT, userKey, 'credentials']],
    });
}

/**
 * useDeployment follows one deployment while it is still moving (every
 * DETAIL_POLL_MS) and stops once its status has settled. It does not poll in a
 * background tab (the query default), and a failed poll keeps the last answer
 * and tries again: the page then shows a connection notice, not an empty error.
 */
export function useDeployment(deploymentId) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'deployment', deploymentId],
        queryFn: ({ signal }) => api.deployment(deploymentId, signal),
        enabled: Boolean(userKey && deploymentId),
        retry: false,
        refetchInterval: query => (isTransitional(query.state.data?.status) ? DETAIL_POLL_MS : false),
    });
}

// Every task of a deployment (owner view). Keyed by the status as well, so the
// history reloads when the status changes.
export function useDeploymentTasks(deploymentId, enabled, status) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'deployment-tasks', deploymentId, status],
        queryFn: ({ signal }) => api.deploymentTasks(deploymentId, signal),
        enabled: Boolean(enabled && userKey && deploymentId),
        retry: false,
    });
}

// The full log of the latest task: large, hence only when asked for.
export function useDeploymentLogs(deploymentId, enabled) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'deployment-logs', deploymentId],
        queryFn: ({ signal }) => api.deploymentLogs(deploymentId, signal),
        enabled: Boolean(enabled && userKey && deploymentId),
        retry: false,
    });
}

const STREAM_EVENTS = ['snapshot', 'progress', 'log', 'overflow', 'started', 'succeeded', 'failed', 'revoked'];

/**
 * useDeploymentStream listens to the live log of a deployment's task while
 * `enabled`. It closes itself when the task ends and then refreshes what the
 * page shows from the backend. A broken stream is not retried: `broken` tells
 * the page, and the polled status carries on without it.
 */
export function useDeploymentStream(deploymentId, enabled) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    const queryClient = useQueryClient();
    const [state, setState] = useState(INITIAL_STREAM);
    const [broken, setBroken] = useState(false);
    const latest = useRef(INITIAL_STREAM);
    // The effect depends on the address, not on the client: a new client object
    // must not reopen a stream that is already running.
    const url = deploymentId ? api.streamUrl(deploymentId) : null;

    useEffect(() => {
        if (!enabled || !url || typeof EventSource === 'undefined') return undefined;
        const source = new EventSource(url, { withCredentials: true });
        for (const name of STREAM_EVENTS) {
            source.addEventListener(name, event => {
                let payload;
                try {
                    payload = JSON.parse(event.data);
                } catch {
                    return;
                }
                latest.current = applyStreamEvent(latest.current, name, payload);
                setState(latest.current);
                if (latest.current.done) {
                    source.close();
                    queryClient.invalidateQueries({ queryKey: [ROOT, userKey, 'deployment', deploymentId] });
                    queryClient.invalidateQueries({ queryKey: [ROOT, userKey, 'deployment-tasks', deploymentId] });
                    queryClient.invalidateQueries({ queryKey: [ROOT, userKey, 'deployments'] });
                }
            });
        }
        // EventSource would reconnect by itself; a stream that failed once is
        // more likely a proxy that cannot carry it than a blip, so it stays down.
        source.onerror = () => {
            source.close();
            setBroken(true);
        };
        return () => source.close();
    }, [url, deploymentId, enabled, queryClient, userKey]);

    return { ...state, broken };
}
