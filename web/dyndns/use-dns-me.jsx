import { useQuery } from '@tanstack/react-query';
import { useAuth } from '/providers/auth.jsx';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';

// Who the DNS service takes the caller for (GET /v1/me): the person the requests act as, whether that person is a super admin there, and whether the signed-in person may act for others. One query for the act-as controls and the zone pages, so they share one request.
export function useDnsMeQuery({ enabled = true } = {}) {
    const api = useZonesApi();
    const { user } = useAuth();
    return useQuery({
        queryKey: dyndnsKeys.me(),
        queryFn: () => api.getMe(),
        enabled: enabled && !!api && !!user,
        retry: false,
        staleTime: 5 * 60 * 1000,
    });
}
