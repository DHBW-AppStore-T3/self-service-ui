import { useMemo, useState } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Button, Group, Paper, Stack, Stepper, Title } from '@mantine/core';
import { AlertCircle, ArrowLeft, Rocket } from 'lucide-react';
import { deployTarget } from '../api.js';
import {
    useApp, useAppRuntime, useAppVariables, useCreateWizardDeployment, useCredentials, useMe, useRole,
} from '../queries.jsx';
import { StateView } from '../shared.jsx';
import { useDirectory } from './directory.js';
import {
    buildDeploymentPayload, defaultSelection, formatSubmitError, networkPayload,
} from './payload.js';
import { ConfigStep, TeamsStep } from './steps.jsx';
import { SummaryStep } from './summary-step.jsx';
import { isAssignmentComplete, syncTeams } from './teams.js';
import { VariablesStep, fileToUpload } from './variables-step.jsx';
import {
    buildWizardTeams, dedupeVariables, findMissingRequired, groupPackerByTemplate, isMultiImageLayout, reconcileValues,
} from './variables.js';

const STEPS = ['config', 'teams', 'variables', 'summary'];

// A credential the backend can deploy with: its project is confirmed and the last check passed.
const usable = credential => credential.project_verified && !credential.last_validation_error;

function WizardBody({ app }) {
    const { t } = useTranslation();
    const [, navigate] = useLocation();
    const { version } = deployTarget(app);
    const runtime = useAppRuntime(app.appId, version);
    const variables = useAppVariables(app.appId, version);
    const credentials = useCredentials();
    const directory = useDirectory();
    const me = useMe();

    const teamName = index => t('appStore.wizard.teamName', { index: index + 1 });
    const [step, setStep] = useState(0);
    const [name, setName] = useState(app.name);
    const [studentIds, setStudentIds] = useState([]);
    const [teamsState, setTeamsState] = useState({ mode: 'one', count: 0, assignments: [], names: [] });
    const [values, setValues] = useState({});
    const [files, setFiles] = useState({});
    const [resources, setResources] = useState(null);
    const [network, setNetwork] = useState({});
    const [chosenCredential, setChosenCredential] = useState(null);

    const runtimeData = runtime.data;
    const forced = runtimeData?.scope === 'user';
    const defs = useMemo(() => dedupeVariables(variables.data ?? []), [variables.data]);
    const isMultiImage = isMultiImageLayout(Object.keys(groupPackerByTemplate(defs)));
    const teams = buildWizardTeams(teamsState.names, teamsState.assignments, directory.cache);
    const choices = runtimeData?.resources ?? [];
    const resourcesValue = resources ?? defaultSelection(choices);
    const workloads = forced ? studentIds.length : teamsState.count;
    const missing = findMissingRequired(defs, values, isMultiImage, teams);
    const needsCredential = runtimeData?.runtime === 'openstack-vm';
    const usableCredentials = (credentials.data ?? []).filter(usable);
    const credentialId = chosenCredential && usableCredentials.some(c => c.credentialId === chosenCredential)
        ? chosenCredential : (usableCredentials.length === 1 ? usableCredentials[0].credentialId : null);

    const create = useCreateWizardDeployment({ onSuccess: deployment => navigate(`/deployments/${deployment.deploymentId}`) });

    function setFile(varName, slot, file) {
        if (!file) {
            setFiles(prev => ({ ...prev, [varName]: Object.fromEntries(Object.entries(prev[varName] ?? {}).filter(([key]) => key !== slot)) }));
            return;
        }
        fileToUpload(file).then(upload => setFiles(prev => ({ ...prev, [varName]: { ...prev[varName], [slot]: upload } })));
    }

    // What each step needs before the next one makes sense.
    const ready = [
        name.trim() !== '' && Boolean(version),
        studentIds.length === 0 || forced || teamsState.mode !== 'custom' || isAssignmentComplete(studentIds, teamsState),
        variables.isSuccess && missing.length === 0,
        runtime.isSuccess && (!needsCredential || Boolean(credentialId)),
    ];
    const loading = runtime.isPending || variables.isPending;

    function advance() {
        if (step === 0) setTeamsState(syncTeams(teamsState, studentIds, forced, teamName));
        if (step === 1) {
            setValues(previous => reconcileValues(defs, previous, isMultiImage, teams));
        }
        setStep(step + 1);
    }

    function submit() {
        create.mutate(buildDeploymentPayload({
            name, appId: app.appId, releaseTag: version,
            teams: teamsState.assignments.slice(0, teamsState.count).map((userIds, i) => ({ name: teamsState.names[i], userIds })),
            definitions: defs, isMultiImage, values, files,
            runtime: runtimeData.runtime, credentialId,
            resources: choices.length > 0 ? resourcesValue : undefined,
            network: networkPayload({ choices: runtimeData.network, selection: network, workloads }),
        }));
    }

    const resourceChanged = choices.some(c => {
        const chosen = resourcesValue[c.container];
        return chosen && (chosen.cpu !== c.cpu.default || chosen.memory !== c.memory.default);
    });

    return (
        <Paper withBorder p="xl">
            <Stack gap="xl">
                <Title order={1} size="h2">{t('appStore.wizard.title', { name: app.name })}</Title>
                {!version && <Alert color="yellow" icon={<AlertCircle size={18} />}>{t('appStore.wizard.config.noVersion')}</Alert>}
                {runtime.isError && <Alert color="red" icon={<AlertCircle size={18} />}>{t('appStore.errors.errorMessage')}</Alert>}
                {variables.isError && <Alert color="red" icon={<AlertCircle size={18} />}>{t('appStore.wizard.variables.loadFailed')}</Alert>}

                <Stepper active={step} size="sm" allowNextStepsSelect={false}>
                    {STEPS.map(key => <Stepper.Step key={key} label={t(`appStore.wizard.steps.${key}`)} />)}
                </Stepper>

                {step === 0 && (
                    <ConfigStep version={version} name={name} setName={setName} studentIds={studentIds}
                        setStudentIds={setStudentIds} directory={directory} />
                )}
                {step === 1 && (
                    <TeamsStep state={teamsState} setState={setTeamsState} studentIds={studentIds} cache={directory.cache}
                        forced={forced} teamName={teamName} />
                )}
                {step === 2 && (
                    <VariablesStep defs={defs} isMultiImage={isMultiImage} values={values} setValues={setValues} files={files}
                        setFile={setFile} teams={teams} runtime={runtimeData} resources={resourcesValue} setResources={setResources}
                        network={network} setNetwork={setNetwork} workloads={workloads} missing={missing} />
                )}
                {step === 3 && runtimeData && (
                    <SummaryStep app={app} name={name} version={version} teams={teams} studentCount={studentIds.length} defs={defs}
                        isMultiImage={isMultiImage} values={values} files={files} runtime={runtimeData} network={network} workloads={workloads}
                        resourceChanged={resourceChanged} needsCredential={needsCredential} usableCredentials={usableCredentials}
                        credentialId={credentialId} setCredentialId={setChosenCredential} credentialsReady={credentials.isSuccess}
                        appId={app.appId} />
                )}

                {create.error && (
                    <Alert color="red" icon={<AlertCircle size={18} />} title={t('appStore.wizard.summary.submitFailed')} role="alert">
                        {formatSubmitError(create.error, t)}
                    </Alert>
                )}

                <Group justify="space-between">
                    <Button variant="default" disabled={step === 0 || create.isPending} onClick={() => setStep(step - 1)}>
                        {t('appStore.wizard.previous')}
                    </Button>
                    {step < STEPS.length - 1 ? (
                        <Button disabled={!ready[step] || (step >= 1 && loading) || !me.isSuccess} onClick={advance}>{t('appStore.wizard.next')}</Button>
                    ) : (
                        <Button leftSection={<Rocket size={16} />} disabled={!ready[step]} loading={create.isPending} onClick={submit}>
                            {t('appStore.wizard.submit')}
                        </Button>
                    )}
                </Group>
            </Stack>
        </Paper>
    );
}

/**
 * Wizard is the deployment wizard: configuration (name, students), distribution
 * into teams, the settings the app needs, and a summary that creates the
 * deployment. It replaces the hand-over to the existing App Store frontend;
 * staff only (the backend refuses everybody else).
 */
export function Wizard({ params }) {
    const { t } = useTranslation();
    const query = useApp(params.id);
    const { staff, loaded } = useRole();
    // The backend refuses everything this page does to anybody else; once the
    // role is known, they are sent back to the app instead.
    if (loaded && !staff) return <Redirect to={`/apps/${encodeURIComponent(params.id)}`} replace />;
    return (
        <Stack gap="lg">
            <Anchor component={Link} href={`/apps/${encodeURIComponent(params.id)}`} size="sm">
                <Group gap={6}><ArrowLeft size={15} />{t('appStore.wizard.back')}</Group>
            </Anchor>
            <StateView query={query}>{query.data && <WizardBody app={query.data} />}</StateView>
        </Stack>
    );
}
