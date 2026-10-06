import { describe, it, expect, vi } from 'vitest';
import { createAppStoreApi, frontendLink } from './api.js';

const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

describe('App Store backend integration', () => {
    it('loads every page and uses only the BFF cookie, never a dummy token', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(json(Array.from({ length: 100 }, (_, appId) => ({ appId })))).mockResolvedValueOnce(json([{ appId: 100 }]));
        const api = createAppStoreApi({ baseUrl: '/api/app-store/', fetchImpl });
        expect(await api.apps()).toHaveLength(101);
        expect(fetchImpl.mock.calls[1][0]).toBe('/api/app-store/apps/?skip=100&limit=100');
        expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', redirect: 'error', headers: { Accept: 'application/json' } });
    });
    it('reports expired sessions and retains the status for the UI', async () => {
        const onUnauthorized = vi.fn();
        const api = createAppStoreApi({ baseUrl: '/api/app-store', onUnauthorized, fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 401 })) });
        await expect(api.apps()).rejects.toMatchObject({ status: 401 });
        expect(onUnauthorized).toHaveBeenCalledOnce();
    });
    it('rejects a login page returned with HTTP 200', async () => {
        const api = createAppStoreApi({ baseUrl: '/api/app-store', fetchImpl: vi.fn().mockResolvedValue(new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })) });
        await expect(api.apps()).rejects.toThrow('not JSON');
    });
    it('encodes IDs and forwards cancellation', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(json({ appId: 'abc' }));
        const signal = new AbortController().signal;
        const api = createAppStoreApi({ baseUrl: '/api/app-store', fetchImpl });
        await api.app('a/b', signal);
        expect(fetchImpl).toHaveBeenCalledWith('/api/app-store/apps/a%2Fb', expect.objectContaining({ signal }));
    });
    it('does not mistake forbidden access for an expired session', async () => {
        const onUnauthorized = vi.fn();
        const api = createAppStoreApi({ baseUrl: '/api/app-store', onUnauthorized, fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 403 })) });
        await expect(api.deployments()).rejects.toMatchObject({ status: 403 });
        expect(onUnauthorized).not.toHaveBeenCalled();
    });
    it('refuses unsafe or absent handoff URLs', () => {
        vi.stubGlobal('window', { location: { origin: 'https://portal.example' } });
        expect(frontendLink('javascript:alert(1)', '/apps')).toBeNull();
        expect(frontendLink('', '/apps')).toBeNull();
        expect(frontendLink('https://store.example/', '/apps/123')).toBe('https://store.example/apps/123');
        vi.unstubAllGlobals();
    });
});
