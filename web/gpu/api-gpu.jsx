import { useMemo } from 'react';
import { apiError, apiErrorMessage } from '/helper/api-error.js';
import { useClient } from '/providers/client.jsx';
// The GPU part lives in llm-management-api (same service, same client and base
// URL as the LLM section), under /v1/gpu. Named imports, as in llm/api-llm.jsx:
// an operation missing from the client fails the build, not the browser.
import {
    deleteGpuPool, deleteWorkspaceProject, getGpuFleet, getMyWorkspaceUsage, getGpuHours, putGpuNode, putGpuPool, getProjectImageLog, getWorkspaceCatalog, getWorkspaceStorage, getWorkspaceUsage,
    listGpuServers, listWorkspaceProjects, rebuildProjectImage, stopGpuServer, updateWorkspaceProject,
} from '@dhbw-cloud/llm-client';

function unwrap(res) {
    if (apiErrorMessage(res)) throw apiError(res);
    return res?.data;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function useGpuApi() {
    const client = useClient('llm');

    return useMemo(() => {
        const call = async (op, opts = {}) => unwrap(await op({ client, ...opts }));
        return {
            listServers: async () => (await call(listGpuServers)) ?? [],
            // The default server has no name; the API calls it "-".
            stopServer: (name) => call(stopGpuServer, { path: { name: name || '-' } }),
            // Workspace usage (W1): own rows for everyone with access, all rows for admins. period = { from, to }.
            myWorkspaceUsage: (period) => call(getMyWorkspaceUsage, { query: period }),
            workspaceUsage: (period, project) => call(getWorkspaceUsage, { query: project ? { ...period, project } : period }),
            // Projects (W2): own projects, or all for admins.
            listProjects: async (all) => (await call(listWorkspaceProjects, all ? { query: { all: true } } : {})) ?? [],
            catalog: () => call(getWorkspaceCatalog),
            updateProject: (p) => call(updateWorkspaceProject, { path: { slug: p.slug }, body: p, headers: JSON_HEADERS }),
            deleteProject: (slug) => call(deleteWorkspaceProject, { path: { slug } }),
            // The project image from Git (docs/bauplan.md 10.12): build again, and the build's log.
            rebuildProjectImage: (slug) => call(rebuildProjectImage, { path: { slug } }),
            projectImageLog: async (slug) => (await call(getProjectImageLog, { path: { slug } }))?.log ?? '',
            // Admins: how full the workspace storage and its metadata are.
            storage: () => call(getWorkspaceStorage),
            // Admins: the GPU administration — nodes with pool and tier, pools, tiers, classes (docs/bauplan.md 10.13). Every change answers with the whole picture.
            fleet: () => call(getGpuFleet),
            assignNode: (name, body) => call(putGpuNode, { path: { name }, body, headers: JSON_HEADERS }),
            savePool: (id, body) => call(putGpuPool, { path: { id }, body, headers: JSON_HEADERS }),
            deletePool: (id) => call(deleteGpuPool, { path: { id } }),
            // GPU use per hour; period = { from, to }, project for a project's managers.
            gpuHours: (period, project) => call(getGpuHours, { query: project ? { ...period, project } : period }),
        };
    }, [client]);
}
