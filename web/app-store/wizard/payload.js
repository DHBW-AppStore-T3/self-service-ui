// What the wizard finally sends to POST /deployments/, and the small rules around
// it. Ported from the existing frontend (deployment.store.ts submitDraft,
// utils/resources.ts, utils/network.ts); same shape, so the backend cannot tell
// the two UIs apart.
import { buildDraftValues, isFileVar } from './variables.js';

// Runtimes that run in the cluster and need no OpenStack credential.
const CLUSTER_RUNTIMES = new Set(['kubernetes', 'kubevirt-vm']);
export const isClusterRuntime = runtime => CLUSTER_RUNTIMES.has(runtime);

// ------------------------------------------------------------ cpu / memory
export const CPU_STEP_MILLICORES = 500;
export const MEMORY_STEP_MIB = 512;

// CPU quantity (`500m`, `2`, `1.5`) in millicores.
export const cpuToMillicores = value => (value.endsWith('m') ? Number(value.slice(0, -1)) : Math.round(Number(value) * 1000));
// Memory quantity (`512Mi`, `4Gi`) in MiB.
export const memoryToMib = value => (value.endsWith('Gi') ? Number(value.slice(0, -2)) * 1024 : Number(value.slice(0, -2)));
// Millicores in the notation of appstore.yaml: `2` for 2000, `500m` for 500.
export const formatCpu = millicores => (millicores % 1000 === 0 ? String(millicores / 1000) : `${millicores}m`);
export const formatMemory = mib => (mib % 1024 === 0 ? `${mib / 1024}Gi` : `${mib}Mi`);

// The defaults of every choice the app offers: what a deployment gets if nobody changes anything.
export function defaultSelection(choices) {
    return Object.fromEntries(choices.map(c => [c.container, { cpu: c.cpu.default, memory: c.memory.default }]));
}

// ----------------------------------------------------------------- network
const NETWORK_KEYS = ['internet', 'podNetwork'];
// Pod networking needs somebody to talk to: at least two workloads.
export const MIN_WORKLOADS_FOR_POD_NETWORK = 2;

export const defaultNetwork = choices => Object.fromEntries(
    NETWORK_KEYS.filter(key => choices?.[key]).map(key => [key, !!choices[key].default]),
);

// The settings the wizard shows: those the app allows, pod networking only with two workloads.
export function visibleNetworkKeys({ choices, workloads }) {
    return NETWORK_KEYS.filter(key => !!choices?.[key] && (key !== 'podNetwork' || workloads >= MIN_WORKLOADS_FOR_POD_NETWORK));
}

export const networkValue = ({ choices, selection }, key) => selection?.[key] ?? !!choices?.[key]?.default;

// `userInputVar.network`: only the keys the app allows; undefined when there are none.
export function networkPayload(state) {
    const keys = visibleNetworkKeys(state);
    return keys.length === 0 ? undefined : Object.fromEntries(keys.map(key => [key, networkValue(state, key)]));
}

// -------------------------------------------------------------------- send
const isBlankValue = val => val === undefined || val === null || (typeof val === 'string' && val.trim() === '');

/**
 * buildDeploymentPayload turns the wizard's state into the create request.
 * Empty values are left out, so the variable's own default applies instead of a
 * `null` forwarded to Terraform; file variables travel under `files`; a
 * credential is sent only for VM apps.
 */
export function buildDeploymentPayload({
    name, appId, releaseTag, teams, definitions, isMultiImage, values, files, runtime, credentialId, resources, network,
}) {
    const { all } = buildDraftValues(definitions, values, isMultiImage);
    const userInputVar = { packer: {}, terraform: {} };
    for (const def of definitions) {
        if (isFileVar(def)) continue;
        const tkey = def.template_key ?? 'default';
        const nested = def.source === 'packer' && isMultiImage;
        const val = nested ? all.packer?.[tkey]?.[def.name] : all[def.name];
        if (isBlankValue(val)) continue;
        if (typeof val === 'object' && !Array.isArray(val) && (def.varScope === 'team' || def.varScope === 'user') && Object.keys(val).length === 0) continue;
        if (def.source === 'packer') {
            if (isMultiImage) (userInputVar.packer[tkey] ??= {})[def.name] = val;
            else userInputVar.packer[def.name] = val;
        } else if (def.source === 'terraform') {
            userInputVar.terraform[def.name] = val;
        }
    }
    if (resources && Object.keys(resources).length > 0) userInputVar.resources = resources;
    if (network) userInputVar.network = network;

    const payload = { name: name.trim(), appId, releaseTag, teams, userInputVar };
    if (!isClusterRuntime(runtime) && credentialId) payload.credentialId = credentialId;

    const filled = {};
    for (const [varName, slots] of Object.entries(files ?? {})) {
        const kept = Object.fromEntries(Object.entries(slots ?? {}).filter(([, file]) => file?.content_b64));
        if (Object.keys(kept).length > 0) filled[varName] = kept;
    }
    if (Object.keys(filled).length > 0) payload.files = filled;
    return payload;
}

// What went wrong with a submit, in words (t is the translate function).
export function formatSubmitError(error, t) {
    if (error.status === 412 && error.reason === 'openstack_credentials_missing') return t('appStore.wizard.errors.credentialsMissing');
    if (error.status === 403) return t('appStore.deploy.forbidden');
    return error.message;
}
