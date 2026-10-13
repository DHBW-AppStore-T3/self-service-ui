import { useMemo } from 'react';
import { apiError, apiErrorMessage } from '/helper/api-error.js';
import { useClient } from '/providers/client.jsx';
// The GPU part lives in llm-management-api (same service, same client and base
// URL as the LLM section), under /v1/gpu. Named imports, as in llm/api-llm.jsx:
// an operation missing from the client fails the build, not the browser.
import {
    createGpuEnvironment, deleteGpuEnvironment, deleteWorkspaceProject, getGpuEnvironmentLog, getMyWorkspaceUsage, getWorkspaceCatalog, getWorkspaceUsage,
    listGpuEnvironments, listGpuServers, listWorkspaceProjects, updateWorkspaceProject,
    rebuildGpuEnvironment, startGpuEnvironment, stopGpuServer,
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
            listEnvironments: async () => (await call(listGpuEnvironments)) ?? [],
            createEnvironment: (env) => call(createGpuEnvironment, { body: env, headers: JSON_HEADERS }),
            deleteEnvironment: (id) => call(deleteGpuEnvironment, { path: { id } }),
            rebuildEnvironment: (id) => call(rebuildGpuEnvironment, { path: { id } }),
            environmentLog: async (id) => (await call(getGpuEnvironmentLog, { path: { id } }))?.log ?? '',
            startEnvironment: (id, gpu, project) => call(startGpuEnvironment, { path: { id }, body: { gpu, project }, headers: JSON_HEADERS }),
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
        };
    }, [client]);
}
