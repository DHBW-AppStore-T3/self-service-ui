import { useQuery } from '@tanstack/react-query';
import { useAuth } from '/providers/auth.jsx';
import { useSession } from '/providers/session.jsx';
import { createAppStoreApi } from './api.js';

export function useAppStoreQuery(resource, id) {
    const { user } = useAuth();
    const { expire } = useSession();
    const baseUrl = window.appconfig?.appStoreBaseUrl || '/api/app-store';
    const api = createAppStoreApi({ baseUrl, onUnauthorized: expire });
    return useQuery({
        queryKey: ['app-store', baseUrl, user?.profile?.email, resource, id],
        queryFn: ({ signal }) => resource === 'app' ? api.app(id, signal) : api[resource](signal),
        enabled: Boolean(user),
        retry: false,
        refetchInterval: resource === 'deployments' ? 15000 : false,
    });
}
