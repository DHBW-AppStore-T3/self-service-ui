import { Alert, Stack, Text } from '@mantine/core';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { COLOR } from './util-project.jsx';
import { hasLlmIssue, llmLimitIssues, lowRates, LLM_RPM, LLM_TOKENS, LLM_TPM, MIN_USABLE_RPM, MIN_USABLE_TPM, RECOMMENDED_LLM } from './util-llm-limits.js';

// rateList: "100 tokens per minute (useful from 10,000) and …" for the rates that are too low.
function rateList(t, num, rpm, tpm) {
    const parts = [
        tpm !== null && t('projects.llmLimits.tpm', { n: num(tpm), min: num(MIN_USABLE_TPM) }),
        rpm !== null && t('projects.llmLimits.rpm', { n: num(rpm), min: num(MIN_USABLE_RPM) }),
    ].filter(Boolean);
    return parts.join(t('projects.llmLimits.and'));
}

function useNum() {
    const { i18n } = useTranslation();
    return (n) => Number(n).toLocaleString(i18n.resolvedLanguage);
}

// LlmLimitHints says what keeps a project's LLM part from being usable: no tokens (then neither chat nor API keys), or rate limits too low for a request to pass. limit is what the project holds or would hold (allocations included). Nothing for a catalogue without LLM resources. recommend adds the recommended values below (the request form); compact is the small form for a card. Warns only: a budget may set low values on purpose.
export function LlmLimitHints({ limit, resources, recommend = false, compact = false }) {
    const { t } = useTranslation();
    const num = useNum();
    const issues = llmLimitIssues(limit, resources);
    if (!issues) return null;
    const size = compact ? 'xs' : 'sm';
    const p = compact ? 'xs' : undefined;
    const rates = issues.lowRpm !== null || issues.lowTpm !== null;
    if (!hasLlmIssue(issues) && !recommend) return null;
    return (
        <Stack gap="xs">
            {issues.noTokens && (
                <Alert color={COLOR.attention} variant="light" p={p} icon={compact ? undefined : <KeyRound size="16" />}
                    title={compact ? undefined : t('projects.llmLimits.noTokensTitle')}>
                    <Text size={size}>{t('projects.llmLimits.noTokens')}</Text>
                </Alert>
            )}
            {rates && (
                <Alert color="yellow" variant="light" p={p} icon={compact ? undefined : <AlertTriangle size="16" />}
                    title={compact ? undefined : t('projects.llmLimits.lowRatesTitle')}>
                    <Text size={size}>{t('projects.llmLimits.lowRates', { list: rateList(t, num, issues.lowRpm, issues.lowTpm) })}</Text>
                </Alert>
            )}
            {recommend && (
                <Text size="xs" c="dimmed">
                    {t('projects.llmLimits.recommended', { mtokens: num(RECOMMENDED_LLM[LLM_TOKENS]), rpm: num(RECOMMENDED_LLM[LLM_RPM]), tpm: num(RECOMMENDED_LLM[LLM_TPM]) })}
                </Text>
            )}
        </Stack>
    );
}

// LlmPoolWarnings is the same warning in the LLM area, for the pools the AI service reports (getUsage().projects): one line per project whose rate limits are too low to use.
export function LlmPoolWarnings({ projects }) {
    const { t } = useTranslation();
    const num = useNum();
    const low = (projects || []).map(pr => ({ pr, ...lowRates(pr) })).filter(x => x.rpm !== null || x.tpm !== null);
    if (low.length === 0) return null;
    return (
        <Alert color="yellow" variant="light" icon={<AlertTriangle size="16" />} title={t('projects.llmLimits.lowRatesTitle')}>
            <Stack gap={4}>
                {low.map(({ pr, rpm, tpm }) => (
                    <Text key={pr.slug} size="sm">
                        {t('projects.llmLimits.poolLowRates', { name: pr.name || pr.slug, list: rateList(t, num, rpm, tpm) })}
                    </Text>
                ))}
            </Stack>
        </Alert>
    );
}
