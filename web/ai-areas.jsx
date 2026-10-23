import { cloudProjectsEnabled, llmEnabled } from '/features.js';
import { useCloudStatus } from '/projects/cloud-status.jsx';
import { hasWorkspaces } from '/gpu/access.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';

// useAiAreasVisible decides whether the two areas of the AI service, Workspaces and LLM, are visible to the current user, in one place for the navigation and the footer (which names the AI service's version only where one of them is). Each area is "member" (the whole section: a project member, or an admin of it), "offer" (only the way to a project, when a budget in reach offers one) or null (hidden). `llm` is the caller as the LLM service sees them (useLlmMe), for the items the navigation shows by role.
export function useAiAreasVisible() {
    const llm = useLlmMe();
    const { offered } = useCloudStatus();
    const area = (member, id) => {
        if (!llmEnabled || !llm.me) return null;
        if (member) return 'member';
        return cloudProjectsEnabled && offered.includes(id) ? 'offer' : null;
    };
    const workspaces = area(hasWorkspaces(llm.me, llm.isAdmin), 'workspaces');
    const llmArea = area(llm.hasAccess, 'llm');
    return { llm, workspaces, llmArea, anyVisible: Boolean(workspaces || llmArea) };
}
