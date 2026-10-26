import { useTranslation } from 'react-i18next';
import {
    Accordion, Alert, Box, Button, FileInput, Group, NumberInput, PasswordInput, Slider, Stack, Switch, Text, TextInput,
    Textarea, Title,
} from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import {
    displayDescription, formKeyOf, formatSlotLabel, hasBlockingExpert, isBool, isFileVar, isList, isNumber,
    isScoped, markerErrorLines, slotKeysFor, splitVariables,
} from './variables.js';
import {
    CPU_STEP_MILLICORES, MEMORY_STEP_MIB, cpuToMillicores, formatCpu, formatMemory, memoryToMib, networkValue, visibleNetworkKeys,
} from './payload.js';

// base64 of a file's bytes, with what the backend wants to know about it.
export function fileToUpload(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
            name: file.name,
            content_b64: String(reader.result).split(',')[1] ?? '',
            size: file.size,
            content_type: file.type || 'application/octet-stream',
        });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

const SECRET_NAME = /password|passwort|secret|token/i;

// One input for one value: the widget follows the variable's type.
function ValueInput({ def, label, description, value, onChange }) {
    const { t } = useTranslation();
    const common = { label, description, required: Boolean(def.required) };
    if (isBool(def.type)) {
        return <Switch label={label} description={description} checked={Boolean(value)} onChange={e => onChange(e.currentTarget.checked)} />;
    }
    if (isNumber(def.type)) {
        return <NumberInput {...common} value={value === '' || value == null ? '' : value} onChange={onChange} />;
    }
    if (isList(def.type)) {
        return (
            <Textarea {...common} description={description ? `${description} ${t('appStore.wizard.variables.listHint')}` : t('appStore.wizard.variables.listHint')}
                autosize minRows={2} value={value ?? ''} onChange={e => onChange(e.currentTarget.value)} />
        );
    }
    if (SECRET_NAME.test(def.name)) {
        return <PasswordInput {...common} value={value ?? ''} onChange={e => onChange(e.currentTarget.value)} autoComplete="new-password" />;
    }
    return <TextInput {...common} value={value ?? ''} onChange={e => onChange(e.currentTarget.value)} />;
}

function FileSlot({ label, description, upload, onFile }) {
    const { t } = useTranslation();
    return (
        <Group align="flex-end" wrap="nowrap">
            <FileInput label={label} description={description} placeholder={t('appStore.wizard.variables.file')} clearable
                value={null} onChange={file => file && onFile(file)} style={{ flex: 1 }} aria-label={label} />
            {upload && <Text size="xs" c="dimmed">{t('appStore.wizard.variables.fileChosen', { name: upload.name, size: Math.max(1, Math.round(upload.size / 1024)) })}</Text>}
            {upload && <Button size="xs" variant="subtle" color="gray" onClick={() => onFile(null)}>{t('appStore.wizard.variables.fileRemove')}</Button>}
        </Group>
    );
}

// All inputs of one variable: a single one, or one per team or person for a scoped variable.
function VariableField({ def, isMultiImage, values, setValues, files, setFile, teams }) {
    const { t } = useTranslation();
    const key = formKeyOf(def, isMultiImage);
    const description = displayDescription(def) || undefined;

    if (isFileVar(def)) {
        const slots = isScoped(def) ? slotKeysFor(def, teams) : ['all'];
        return (
            <Stack gap="xs">
                {slots.map(slot => (
                    <FileSlot key={slot} label={isScoped(def) ? `${def.name} · ${formatSlotLabel(def, slot, teams)}` : def.name}
                        description={description} upload={files[def.name]?.[slot]} onFile={file => setFile(def.name, slot, file)} />
                ))}
            </Stack>
        );
    }
    if (isScoped(def)) {
        const map = values[key] ?? {};
        return (
            <Stack gap="xs">
                <Box><Text size="sm" fw={500}>{def.name}</Text>{description && <Text size="xs" c="dimmed">{description}</Text>}</Box>
                {slotKeysFor(def, teams).map(slot => (
                    <ValueInput key={slot} def={def} label={t('appStore.wizard.variables.forSlot', { slot: formatSlotLabel(def, slot, teams) })}
                        value={map[slot]} onChange={value => setValues({ ...values, [key]: { ...map, [slot]: value } })} />
                ))}
            </Stack>
        );
    }
    return <ValueInput def={def} label={def.name} description={description} value={values[key]} onChange={value => setValues({ ...values, [key]: value })} />;
}

// vCPU and RAM of the containers or VMs the app lets people size; a VM in whole
// vCPUs and GiB, a container in halves.
function ResourcePicker({ choices, value, onChange, vm }) {
    const { t } = useTranslation();
    const cpuStep = vm ? 1000 : CPU_STEP_MILLICORES;
    const memoryStep = vm ? 1024 : MEMORY_STEP_MIB;
    const set = (container, key, v) => onChange({ ...value, [container]: { ...value[container], [key]: v } });
    return (
        <Stack gap="md">
            <Title order={3} size="h5">{t('appStore.wizard.variables.resources')}</Title>
            {choices.map(c => {
                const chosen = value[c.container] ?? { cpu: c.cpu.default, memory: c.memory.default };
                return (
                    <Stack key={c.container} gap="sm">
                        {choices.length > 1 && <Text size="sm" fw={500}>{t('appStore.wizard.variables.container', { name: c.container })}</Text>}
                        <Box>
                            <Group justify="space-between">
                                <Text size="sm">{t('appStore.wizard.variables.cpu')}</Text>
                                <Text size="sm" data-testid={`cpu-${c.container}`}>{chosen.cpu}</Text>
                            </Group>
                            <Slider min={cpuToMillicores(c.cpu.min)} max={cpuToMillicores(c.cpu.max)} step={cpuStep} label={null}
                                value={cpuToMillicores(chosen.cpu)} aria-label={t('appStore.wizard.variables.cpu')}
                                onChange={v => set(c.container, 'cpu', formatCpu(v))} />
                            <Text size="xs" c="dimmed">{t('appStore.wizard.variables.range', { min: c.cpu.min, max: c.cpu.max, default: c.cpu.default })}</Text>
                        </Box>
                        <Box>
                            <Group justify="space-between">
                                <Text size="sm">{t('appStore.wizard.variables.memory')}</Text>
                                <Text size="sm" data-testid={`memory-${c.container}`}>{chosen.memory}</Text>
                            </Group>
                            <Slider min={memoryToMib(c.memory.min)} max={memoryToMib(c.memory.max)} step={memoryStep} label={null}
                                value={memoryToMib(chosen.memory)} aria-label={t('appStore.wizard.variables.memory')}
                                onChange={v => set(c.container, 'memory', formatMemory(v))} />
                            <Text size="xs" c="dimmed">{t('appStore.wizard.variables.range', { min: c.memory.min, max: c.memory.max, default: c.memory.default })}</Text>
                        </Box>
                    </Stack>
                );
            })}
        </Stack>
    );
}

function NetworkSettings({ state, onChange }) {
    const { t } = useTranslation();
    const keys = visibleNetworkKeys(state);
    if (keys.length === 0) return null;
    return (
        <Stack gap="sm">
            <Title order={3} size="h5">{t('appStore.wizard.variables.network')}</Title>
            {keys.map(key => (
                <Switch key={key} label={t(`appStore.wizard.variables.${key}`)} description={t(`appStore.wizard.variables.${key}Hint`)}
                    checked={networkValue(state, key)} onChange={e => onChange({ ...state.selection, [key]: e.currentTarget.checked })} />
            ))}
        </Stack>
    );
}

export function VariablesStep({
    defs, isMultiImage, values, setValues, files, setFile, teams, runtime, resources, setResources, network, setNetwork, workloads, missing,
}) {
    const { t } = useTranslation();
    const { basic, expert } = splitVariables(defs);
    const choices = runtime?.resources ?? [];
    const shared = { isMultiImage, values, setValues, files, setFile, teams };
    const markers = markerErrorLines(defs);
    const networkState = { choices: runtime?.network, selection: network, workloads };
    const nothing = defs.length === 0 && choices.length === 0 && visibleNetworkKeys(networkState).length === 0;

    return (
        <Stack gap="lg">
            <Box>
                <Title order={3} size="h5">{t('appStore.wizard.variables.title')}</Title>
                <Text size="sm" c="dimmed">{t('appStore.wizard.variables.intro')}</Text>
            </Box>

            {markers.length > 0 && (
                <Alert color="yellow" icon={<AlertCircle size={18} />}>
                    <Text size="sm">{t('appStore.wizard.variables.markerErrors')}</Text>
                    {markers.map(line => <Text key={line} size="xs">{line}</Text>)}
                </Alert>
            )}
            {nothing && <Text c="dimmed">{t('appStore.wizard.variables.none')}</Text>}

            {basic.map(def => <VariableField key={formKeyOf(def, isMultiImage)} def={def} {...shared} />)}

            {choices.length > 0 && <ResourcePicker choices={choices} value={resources} onChange={setResources} vm={runtime.runtime === 'kubevirt-vm'} />}
            <NetworkSettings state={networkState} onChange={setNetwork} />

            {expert.length > 0 && (
                <Accordion variant="contained" defaultValue={hasBlockingExpert(defs) ? 'expert' : null}>
                    <Accordion.Item value="expert">
                        <Accordion.Control>
                            <Text fw={500} size="sm">{t('appStore.wizard.variables.expert')}</Text>
                            <Text size="xs" c="dimmed">{t('appStore.wizard.variables.expertHint')}</Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="md">
                                {expert.map(def => <VariableField key={formKeyOf(def, isMultiImage)} def={def} {...shared} />)}
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            )}

            {missing.length > 0 && (
                <Alert color="blue" icon={<AlertCircle size={18} />} role="status">
                    {t('appStore.wizard.variables.missing', { names: missing.join(', ') })}
                </Alert>
            )}
        </Stack>
    );
}


