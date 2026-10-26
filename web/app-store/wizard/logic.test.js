import { describe, it, expect } from 'vitest';
import {
    chooseCustom, chooseEachUser, chooseOneGroup, clearAssignments, isAssignmentComplete, moveStudent,
    normalizeTeams, removeFromTeam, resizeTeams, shuffleIntoTeams, syncTeams, unassignedOf,
} from './teams.js';
import {
    deriveCourseIds, displayNameOf, isCourseFullySelected, mergeIntoCache, toggleCourseSelection, toggleId,
} from './students.js';
import {
    buildDraftValues, buildWizardTeams, dedupeVariables, displayDescription, effectiveScope, findMissingRequired,
    formatSlotLabel, groupPackerByTemplate, hasBlockingExpert, initialFromFetch, isExpert, isFileVar, isMultiImageLayout,
    isScoped, markerErrorLines, normalizeValue, reconcileValues, seedScopedDefault, slotKeysFor, splitVariables, userSlotKey, dropStaleSlots,
} from './variables.js';
import {
    buildDeploymentPayload, cpuToMillicores, defaultSelection, formatCpu, formatMemory, memoryToMib, networkPayload,
    formatSubmitError,
} from './payload.js';

// The wizard's rules, without any view: who is in which team, which variables a
// lecturer has to see, and what finally goes to POST /deployments/. Ported from
// the existing frontend's wizard (src/views/new-deployment/), with its cases.

const name = i => `Team ${i + 1}`;

describe('teams', () => {
    const students = ['a', 'b', 'c', 'd', 'e'];

    it('puts everybody into one team, keeping a custom name', () => {
        const state = chooseOneGroup({ names: ['Kurs WWI'] }, students, name);
        expect(state).toEqual({ mode: 'one', count: 1, assignments: [students], names: ['Kurs WWI'] });
        expect(chooseOneGroup({ names: ['Team 3'] }, students, name).names).toEqual(['Team 1']);
        expect(chooseOneGroup({ names: [] }, students, name).names).toEqual(['Team 1']);
    });

    it('makes one team per student for "each user"', () => {
        const state = chooseEachUser(['a', 'b'], name);
        expect(state).toEqual({ mode: 'eachUser', count: 2, assignments: [['a'], ['b']], names: ['Team 1', 'Team 2'] });
    });

    it('starts custom with two teams when coming from one', () => {
        const one = chooseOneGroup({ names: [] }, students, name);
        const custom = chooseCustom(one, students.length, name);
        expect(custom).toMatchObject({ mode: 'custom', count: 2 });
        expect(custom.names).toEqual(['Team 1', 'Team 2']);
        expect(custom.assignments).toEqual([students, []]);
    });

    it('keeps one team when there is only one student', () => {
        expect(chooseCustom(chooseOneGroup({ names: [] }, ['a'], name), 1, name).count).toBe(1);
    });

    it('grows and shrinks, defaulting names and freeing students of removed teams', () => {
        const grown = resizeTeams({ mode: 'custom', count: 1, assignments: [['a']], names: ['Alpha'] }, 3, name);
        expect(grown.names).toEqual(['Alpha', 'Team 2', 'Team 3']);
        expect(grown.assignments).toEqual([['a'], [], []]);
        const shrunk = resizeTeams({ ...grown, assignments: [['a'], ['b'], ['c']] }, 1, name);
        expect(shrunk.assignments).toEqual([['a']]);
        expect(unassignedOf(['a', 'b', 'c'], shrunk.assignments)).toEqual(['b', 'c']);
    });

    it('normalizes to at least one team with matching arrays', () => {
        expect(normalizeTeams({ mode: 'custom', count: 0, assignments: [], names: [] }, name))
            .toEqual({ mode: 'custom', count: 1, assignments: [[]], names: ['Team 1'] });
    });

    it('moves a student between teams and to the pool', () => {
        let assignments = [['a', 'b'], []];
        assignments = moveStudent(assignments, 'a', 1);
        expect(assignments).toEqual([['b'], ['a']]);
        expect(moveStudent(assignments, 'a', null)).toEqual([['b'], []]);
        expect(moveStudent(assignments, 'b', 3)).toEqual([[], ['a'], [], ['b']]);
        expect(removeFromTeam([['a', 'b'], ['c']], 'a', 0)).toEqual([['b'], ['c']]);
    });

    it('shuffles into evenly sized teams, earlier ones taking the remainder', () => {
        const teams = shuffleIntoTeams(students, 2, () => 0);
        expect(teams.map(t => t.length)).toEqual([3, 2]);
        expect(teams.flat().sort()).toEqual(students);
        expect(clearAssignments(3)).toEqual([[], [], []]);
    });

    it('is complete only with everybody placed, no empty team and no blank name', () => {
        const base = { mode: 'custom', count: 2, assignments: [['a'], ['b']], names: ['X', 'Y'] };
        expect(isAssignmentComplete(['a', 'b'], base)).toBe(true);
        expect(isAssignmentComplete(['a', 'b', 'c'], base)).toBe(false);
        expect(isAssignmentComplete(['a', 'b'], { ...base, assignments: [['a', 'b'], []] })).toBe(false);
        expect(isAssignmentComplete(['a', 'b'], { ...base, names: ['X', '  '] })).toBe(false);
    });
});

describe('teams follow the chosen students', () => {
    const start = { mode: 'one', count: 1, assignments: [[]], names: [] };

    it('puts the students into one team, or one each, as the mode says', () => {
        expect(syncTeams(start, ['a', 'b'], false, name)).toMatchObject({ mode: 'one', assignments: [['a', 'b']] });
        expect(syncTeams({ ...start, mode: 'eachUser' }, ['a', 'b'], false, name)).toMatchObject({ mode: 'eachUser', assignments: [['a'], ['b']] });
    });

    it('forces one team per person when the app runs one VM per person', () => {
        const state = syncTeams({ ...start, mode: 'custom' }, ['a', 'b'], true, name);
        expect(state).toMatchObject({ mode: 'eachUser', count: 2, assignments: [['a'], ['b']] });
    });

    it('keeps custom teams but drops students who are no longer chosen', () => {
        const custom = { mode: 'custom', count: 2, assignments: [['a', 'x'], ['b']], names: ['Alpha', 'Beta'] };
        expect(syncTeams(custom, ['a', 'b', 'c'], false, name)).toEqual({ ...custom, assignments: [['a'], ['b']] });
    });

    it('has no teams without students', () => {
        expect(syncTeams(start, [], false, name)).toMatchObject({ count: 0, assignments: [], names: [] });
    });
});

describe('students', () => {
    it('names a student the way a lecturer recognises them', () => {
        expect(displayNameOf({ firstName: 'Anna', lastName: 'Beck', username: 'abeck' })).toBe('Anna Beck');
        expect(displayNameOf({ username: 'abeck', email: 'a@b.de' })).toBe('abeck');
        expect(displayNameOf({ email: 'a@b.de' })).toBe('a@b.de');
        expect(displayNameOf({ userId: 'u1' })).toBe('u1');
    });

    it('selects and deselects a whole course', () => {
        expect(isCourseFullySelected([], ['a'])).toBe(false);
        expect(toggleCourseSelection(['x'], ['a', 'b'])).toEqual(['x', 'a', 'b']);
        expect(toggleCourseSelection(['x', 'a', 'b'], ['a', 'b'])).toEqual(['x']);
        expect(toggleCourseSelection(['a'], ['a', 'b'])).toEqual(['a', 'b']);
    });

    it('toggles single ids and ignores blanks', () => {
        expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
        expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
        expect(toggleId(['a'], ' ')).toEqual(['a']);
    });

    it('derives which courses are fully selected', () => {
        const members = new Map([['c1', ['a', 'b']], ['c2', ['c']]]);
        expect(deriveCourseIds(['c1', 'c2', 'c3'], members, ['a', 'b'])).toEqual(['c1']);
    });

    it('keeps the entry that knows more when merging into the cache', () => {
        const cache = new Map([['u1', { userId: 'u1', username: 'a' }]]);
        const merged = mergeIntoCache(cache, [{ userId: 'u1', username: 'a', firstName: 'Anna' }, { userId: ' ' }, { userId: 'u2' }]);
        expect(merged.get('u1').firstName).toBe('Anna');
        expect(merged.has('u2')).toBe(true);
        expect(merged.size).toBe(2);
        expect(cache.get('u1').firstName).toBeUndefined();
    });
});

describe('variables', () => {
    const teams = buildWizardTeams(['Alpha', ''], [['u1', 'u2'], ['u3']], new Map([
        ['u1', { username: 'anna' }], ['u2', { email: 'ben@dhbw.de' }], ['u3', {}],
    ]));

    it('builds teams with member names from the cache', () => {
        expect(teams).toEqual([
            { name: 'Alpha', members: [{ userId: 'u1', username: 'anna' }, { userId: 'u2', username: 'ben' }] },
            { name: 'Team-2', members: [{ userId: 'u3', username: 'u3' }] },
        ]);
    });

    it('reads scope and flags from the definition', () => {
        expect(effectiveScope({ varScope: 'team' })).toBe('team');
        expect(effectiveScope({ osScope: 'user' })).toBe('user');
        expect(effectiveScope({})).toBe('all');
        expect(isScoped({ varScope: 'user' })).toBe(true);
        expect(isFileVar({ osType: 'file' })).toBe(true);
        expect(isExpert({ description: 'Tune this @expert' })).toBe(true);
        expect(displayDescription({ description: 'Tune this @expert ' })).toBe('Tune this');
    });

    it('lists the slots of a scoped variable', () => {
        expect(slotKeysFor({ varScope: 'team' }, teams)).toEqual(['Alpha', 'Team-2']);
        expect(slotKeysFor({ varScope: 'user' }, teams)).toEqual(['Alpha-anna', 'Alpha-ben', 'Team-2-u3']);
        expect(slotKeysFor({}, teams)).toEqual([]);
        expect(userSlotKey('Alpha', 'anna')).toBe('Alpha-anna');
    });

    it('labels a slot, resolving dashes in team names', () => {
        const dashed = [{ name: 'Team-A', members: [{ userId: 'x', username: 'anna' }] }, { name: 'Team', members: [] }];
        expect(formatSlotLabel({ varScope: 'user' }, 'Team-A-anna', dashed)).toBe('Team „Team-A" → anna');
        expect(formatSlotLabel({ varScope: 'team' }, 'Alpha', dashed)).toBe('Team „Alpha"');
    });

    it('spreads a default over every slot but keeps what is there', () => {
        const v = { name: 'size', varScope: 'team', type: 'string', default: 'm1' };
        expect(seedScopedDefault(v, { Alpha: 'big' }, teams)).toEqual({ Alpha: 'big', 'Team-2': 'm1' });
        expect(seedScopedDefault({ ...v, default: { x: 1 } }, undefined, teams)).toEqual({});
        expect(seedScopedDefault({ ...v, type: 'list(string)', default: ['a', 'b'] }, undefined, teams)['Alpha']).toBe('a, b');
    });

    it('starts from saved input, then the default, with lists as text', () => {
        const defs = [
            { name: 'a', type: 'string', default: 'x' }, { name: 'b', type: 'bool' }, { name: 'c', type: 'list(string)', default: ['p', 'q'] },
            { name: 'd', type: 'number', default: 3 }, { name: 'e', type: 'string' },
        ];
        expect(initialFromFetch(defs, { a: 'saved' }, false, [])).toEqual({ a: 'saved', b: false, c: 'p, q', d: 3, e: '' });
    });

    it('compares against defaults in a canonical form', () => {
        expect(normalizeValue('b, a', 'list(string)')).toBe(JSON.stringify(['a', 'b']));
        expect(normalizeValue(['a', 'b'], 'list(string)')).toBe(JSON.stringify(['a', 'b']));
        expect(normalizeValue('3', 'number')).toBe(3);
        expect(normalizeValue('', 'number')).toBeNull();
        expect(normalizeValue(undefined, 'bool')).toBe(false);
        expect(normalizeValue(' x ', 'string')).toBe('x');
    });

    it('keeps only what differs from the default as changed, everything as all', () => {
        const defs = [
            { name: 'size', type: 'string', default: 'm1', source: 'terraform' },
            { name: 'count', type: 'number', default: 2, source: 'terraform' },
            { name: 'tags', type: 'list(string)', default: ['a'], source: 'terraform' },
            { name: 'cfg', type: 'string', osType: 'file', source: 'terraform' },
        ];
        const { changed, all } = buildDraftValues(defs, { size: 'm1', count: '5', tags: 'a, b', cfg: 'ignored' }, false);
        expect(changed).toEqual({ count: 5, tags: ['a', 'b'] });
        expect(all).toEqual({ size: 'm1', count: 5, tags: ['a', 'b'] });
    });

    it('cleans a scoped map: no blanks, numbers as numbers', () => {
        const defs = [{ name: 'pw', type: 'number', varScope: 'team', source: 'terraform' }];
        const { changed } = buildDraftValues(defs, { pw: { Alpha: '12', 'Team-2': ' ' } }, false);
        expect(changed).toEqual({ pw: { Alpha: 12 } });
    });

    it('lists required variables that are still empty, per slot for scoped ones', () => {
        const defs = [
            { name: 'plain', required: true, type: 'string' },
            { name: 'filled', required: true, type: 'string' },
            { name: 'perTeam', required: true, type: 'string', varScope: 'team' },
            { name: 'optional', required: false, type: 'string' },
            { name: 'upload', required: true, osType: 'file', varScope: 'team' },
        ];
        expect(findMissingRequired(defs, { plain: ' ', filled: 'x', perTeam: { Alpha: 'ok' } }, false, teams))
            .toEqual(['plain', 'perTeam (Team-2)']);
        expect(findMissingRequired([{ name: 'perTeam', required: true, varScope: 'team', type: 'string' }], {}, false, []))
            .toEqual(['perTeam']);
    });

    it('drops values of slots whose team or member is gone', () => {
        const defs = [{ name: 'pw', varScope: 'team', type: 'string' }];
        const { values, dropped } = dropStaleSlots(defs, { pw: { Alpha: 'a', Gone: 'x' } }, false, teams);
        expect(values.pw).toEqual({ Alpha: 'a' });
        expect(dropped).toEqual(['pw → Gone']);
    });

    it('splits the visible variables from the expert ones: required without default stays visible', () => {
        const defs = [
            { name: 'must', required: true, type: 'string' },
            { name: 'withDefault', required: true, default: 'x', type: 'string' },
            { name: 'optional', required: false, type: 'string' },
            { name: 'tuned', required: false, description: 'x @expert', type: 'string' },
            { name: 'expertMust', required: true, description: '@expert', type: 'string' },
        ];
        const { basic, expert } = splitVariables(defs);
        expect(basic.map(v => v.name)).toEqual(['must', 'expertMust']);
        expect(expert.map(v => v.name)).toEqual(['withDefault', 'optional', 'tuned']);
        expect(hasBlockingExpert(defs)).toBe(true);
        expect(hasBlockingExpert([defs[1], defs[3]])).toBe(false);
    });

    it('handles multi-image Packer layouts and duplicates', () => {
        const defs = [
            { name: 'a', source: 'packer', template_key: 'web' }, { name: 'a', source: 'packer', template_key: 'web' },
            { name: 'a', source: 'packer', template_key: 'db' }, { name: 'x', source: 'terraform' },
        ];
        expect(dedupeVariables(defs)).toHaveLength(3);
        expect(Object.keys(groupPackerByTemplate(defs))).toEqual(['web', 'db']);
        expect(isMultiImageLayout(['web', 'db'])).toBe(true);
        expect(isMultiImageLayout(['default'])).toBe(false);
        expect(isMultiImageLayout(['web'])).toBe(true);
    });

    it('keeps what was typed when the teams change, reseeds new slots, drops gone ones', () => {
        const defs = [
            { name: 'pw', type: 'string', varScope: 'team', default: 'init', source: 'terraform' },
            { name: 'size', type: 'string', default: 'm1', source: 'terraform' },
        ];
        const before = { pw: { Alpha: 'typed', Gone: 'x' }, size: 'custom' };
        expect(reconcileValues(defs, before, false, teams)).toEqual({ pw: { Alpha: 'typed', 'Team-2': 'init' }, size: 'custom' });
        expect(reconcileValues(defs, {}, false, teams)).toEqual({ pw: { Alpha: 'init', 'Team-2': 'init' }, size: 'm1' });
    });

    it('reports marker errors of single variables', () => {
        expect(markerErrorLines([{ name: 'a' }, { name: 'b', markerError: { variable: 'b', location: 'l.3', message: 'bad' } }]))
            .toEqual(['• b (l.3): bad']);
    });
});

describe('what is sent', () => {
    const defs = [
        { name: 'size', type: 'string', source: 'terraform', default: 'm1' },
        { name: 'pw', type: 'string', source: 'terraform', varScope: 'team' },
        { name: 'img', type: 'string', source: 'packer' },
        { name: 'cfg', type: 'string', source: 'terraform', osType: 'file', varScope: 'team' },
        { name: 'skip', type: 'string', source: 'terraform' },
    ];

    it('builds the create payload like the existing wizard', () => {
        const payload = buildDeploymentPayload({
            name: ' Kurs ', appId: 'app', releaseTag: 'v1.0',
            teams: [{ name: 'Alpha', userIds: ['u1'] }],
            definitions: defs, isMultiImage: false,
            values: { size: 'm2', pw: { Alpha: 's3' }, img: 'ubuntu', skip: '  ', cfg: {} },
            files: { cfg: { Alpha: { name: 'a.txt', content_b64: 'QQ==', size: 1, content_type: 'text/plain' }, Beta: { name: 'b.txt', content_b64: '' } } },
            runtime: 'openstack-vm', credentialId: 'cred-1',
        });
        expect(payload).toEqual({
            name: 'Kurs', appId: 'app', releaseTag: 'v1.0',
            teams: [{ name: 'Alpha', userIds: ['u1'] }],
            userInputVar: { packer: { img: 'ubuntu' }, terraform: { size: 'm2', pw: { Alpha: 's3' } } },
            credentialId: 'cred-1',
            files: { cfg: { Alpha: { name: 'a.txt', content_b64: 'QQ==', size: 1, content_type: 'text/plain' } } },
        });
    });

    it('sends no credential for pods, and no files or empty maps when there are none', () => {
        const payload = buildDeploymentPayload({
            name: 'x', appId: 'a', releaseTag: 'v1', teams: [], definitions: [{ name: 'pw', source: 'terraform', varScope: 'team', type: 'string' }],
            isMultiImage: false, values: { pw: {} }, files: {}, runtime: 'kubernetes', credentialId: 'cred-1',
        });
        expect(payload).toEqual({ name: 'x', appId: 'a', releaseTag: 'v1', teams: [], userInputVar: { packer: {}, terraform: {} } });
    });

    it('adds the chosen cpu/memory and the network settings the app allows', () => {
        const payload = buildDeploymentPayload({
            name: 'x', appId: 'a', releaseTag: 'v1', teams: [], definitions: [], isMultiImage: false, values: {}, files: {},
            runtime: 'kubevirt-vm', resources: { vm: { cpu: '2', memory: '4Gi' } }, network: { internet: true },
        });
        expect(payload.userInputVar).toEqual({ packer: {}, terraform: {}, resources: { vm: { cpu: '2', memory: '4Gi' } }, network: { internet: true } });
    });

    it('offers pod networking only with two or more workloads', () => {
        const choices = { internet: { default: false }, podNetwork: { default: true } };
        expect(networkPayload({ choices, selection: {}, workloads: 1 })).toEqual({ internet: false });
        expect(networkPayload({ choices, selection: { internet: true }, workloads: 2 })).toEqual({ internet: true, podNetwork: true });
        expect(networkPayload({ choices: {}, selection: {}, workloads: 5 })).toBeUndefined();
    });

    it('converts cpu and memory quantities', () => {
        expect(cpuToMillicores('500m')).toBe(500);
        expect(cpuToMillicores('1.5')).toBe(1500);
        expect(memoryToMib('4Gi')).toBe(4096);
        expect(memoryToMib('512Mi')).toBe(512);
        expect(formatCpu(2000)).toBe('2');
        expect(formatCpu(500)).toBe('500m');
        expect(formatMemory(2048)).toBe('2Gi');
        expect(formatMemory(768)).toBe('768Mi');
        expect(defaultSelection([{ container: 'vm', cpu: { default: '2' }, memory: { default: '4Gi' } }])).toEqual({ vm: { cpu: '2', memory: '4Gi' } });
    });

    it('names what went wrong with a submit', () => {
        const t = key => key;
        expect(formatSubmitError({ status: 412, reason: 'openstack_credentials_missing' }, t)).toBe('appStore.wizard.errors.credentialsMissing');
        expect(formatSubmitError({ status: 403 }, t)).toBe('appStore.deploy.forbidden');
        expect(formatSubmitError({ status: 500, message: 'boom' }, t)).toBe('boom');
    });
});
