// Tools that accept an OpenAI-compatible endpoint, with the setup guide each
// project publishes itself. Names and links are the projects' own and stay
// untranslated.
export const VSCODE_DOCS = 'https://code.visualstudio.com/docs/agent-customization/language-models';
export const LITELLM_CLIENT_DOCS = 'https://docs.litellm.ai/docs/proxy/user_keys';

export const TOOLS = [
    { id: 'vscode', name: 'VS Code', url: VSCODE_DOCS },
    { id: 'continue', name: 'Continue', url: 'https://docs.continue.dev/customize/model-providers/top-level/openai' },
    { id: 'cline', name: 'Cline', url: 'https://docs.cline.bot/provider-config/openai-compatible' },
    { id: 'zed', name: 'Zed', url: 'https://zed.dev/docs/ai/llm-providers' },
    { id: 'aider', name: 'Aider', url: 'https://aider.chat/docs/llms/openai-compat.html' },
    { id: 'cherry', name: 'Cherry Studio', url: 'https://docs.cherry-ai.com/en-us/pre-basic/providers' },
    { id: 'anythingllm', name: 'AnythingLLM', url: 'https://docs.anythingllm.com/setup/llm-configuration/cloud/openai-generic' },
    { id: 'msty', name: 'Msty', url: 'https://docs.msty.app/getting-started/onboarding/remote-model-providers' },
];

// The stable alias names. They are LiteLLM model groups, not concrete models,
// and the only names worth writing into a configuration.
export const STABLE_MODELS = ['chat-default', 'chat-fast', 'code'];

// Model entries for VS Code (Copilot Chat, provider "Custom Endpoint", file
// chatLanguageModels.json). The id is the LiteLLM alias — the most common
// mistake was the provider's name there ("Invalid model name").
// maxInputTokens keeps VS Code below the context the Macs process quickly; it
// then summarises the history itself.
export function vscodeModels(apiUrl, names) {
    const url = `${apiUrl.replace(/\/$/, '')}/chat/completions`;
    const m = (id, name, input, output) =>
        ({ id, name, url, toolCalling: true, vision: false, maxInputTokens: input, maxOutputTokens: output });
    return JSON.stringify({
        models: [
            m('code', names.code, 32000, 8192),
            m('chat-default', names.chat, 32000, 8192),
            m('chat-fast', names.fast, 16000, 4096),
        ],
    }, null, 2).slice(2, -2).replace(/^ {2}/gm, '');
}
