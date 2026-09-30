import { describe, expect, it } from 'vitest';
import {
    buildImportRows, canonicalToken, decodeImportFile, detectDelimiter, detectHeader, guessColumns,
    matchRole, normalizePrincipal, parseImportText,
} from './util-principal-import.js';

const ROLES = ['member', 'reader', 'admin'];

describe('normalizePrincipal', () => {
    it('turns a bare address into a lowercased user token', () => {
        expect(normalizePrincipal(' Max.Muster@DHBW.de ')).toEqual({ token: 'user:max.muster@dhbw.de' });
    });

    it('reads display-name, mailto and user: forms', () => {
        expect(normalizePrincipal('Muster, Max <max@dhbw.de>')).toEqual({ token: 'user:max@dhbw.de' });
        expect(normalizePrincipal('mailto:max@dhbw.de')).toEqual({ token: 'user:max@dhbw.de' });
        expect(normalizePrincipal('user:max@dhbw.de')).toEqual({ token: 'user:max@dhbw.de' });
        expect(normalizePrincipal('"max@dhbw.de"')).toEqual({ token: 'user:max@dhbw.de' });
    });

    it('keeps groups and relations, folding #member into the bare group', () => {
        expect(normalizePrincipal('group:wwi23seb')).toEqual({ token: 'group:wwi23seb' });
        expect(normalizePrincipal('group:wwi23seb#dozent')).toEqual({ token: 'group:wwi23seb#dozent' });
        expect(normalizePrincipal('group:wwi23seb#member')).toEqual({ token: 'group:wwi23seb' });
        expect(normalizePrincipal('group:has space')).toEqual({ error: 'invalid' });
    });

    it('rejects what is neither, and skips empty cells', () => {
        expect(normalizePrincipal('Max Muster')).toEqual({ error: 'invalid' });
        expect(normalizePrincipal('   ')).toBeNull();
    });
});

describe('canonicalToken', () => {
    it('lowercases the address in a user token, bare or prefixed', () => {
        expect(canonicalToken(' Friedemann.Schwenkreis@DHBW-Stuttgart.de ')).toBe('user:friedemann.schwenkreis@dhbw-stuttgart.de');
        expect(canonicalToken('USER:A.B@X.de')).toBe('user:a.b@x.de');
    });
    it('lowercases a group token too', () => {
        expect(canonicalToken(' group:Leiter-ZWR ')).toBe('group:leiter-zwr');
    });
});

describe('parseImportText', () => {
    it('reads one entry per line', () => {
        const t = parseImportText('a@dhbw.de\n\nb@dhbw.de\r\n');
        expect(t.rows).toEqual([['a@dhbw.de'], ['b@dhbw.de']]);
    });

    it('splits a single pasted line into one column', () => {
        expect(parseImportText('A <a@dhbw.de>; B <b@dhbw.de>').rows)
            .toEqual([['A <a@dhbw.de>'], ['B <b@dhbw.de>']]);
        expect(parseImportText('a@dhbw.de b@dhbw.de').rows)
            .toEqual([['a@dhbw.de'], ['b@dhbw.de']]);
        expect(parseImportText('a@dhbw.de\nno address here').rows)
            .toEqual([['a@dhbw.de'], ['no address here']]);
    });

    it('reads a mixed list as one column, whatever separates the entries', () => {
        const t = parseImportText('# comment\na@dhbw.de\nb@dhbw.de, c@dhbw.de; d@dhbw.de\nMuster, Max <m@dhbw.de>\ne@dhbw.de');
        expect(t.delimiter).toBeNull();
        expect(t.rows).toEqual([['a@dhbw.de'], ['b@dhbw.de'], ['c@dhbw.de'], ['d@dhbw.de'], ['Muster, Max <m@dhbw.de>'], ['e@dhbw.de']]);
    });

    it('parses a semicolon CSV with a BOM and quoted fields', () => {
        const t = parseImportText('\uFEFFName;E-Mail;Rolle\n"Muster; Max";max@dhbw.de;Reader\n"Doe ""J""";j@dhbw.de;\n');
        expect(t.delimiter).toBe(';');
        expect(t.rows).toEqual([
            ['Name', 'E-Mail', 'Rolle'],
            ['Muster; Max', 'max@dhbw.de', 'Reader'],
            ['Doe "J"', 'j@dhbw.de', ''],
        ]);
    });

    it('pads short rows so every row has every column', () => {
        expect(parseImportText('a@dhbw.de,reader\nb@dhbw.de').rows)
            .toEqual([['a@dhbw.de', 'reader'], ['b@dhbw.de', '']]);
    });
});

describe('detectDelimiter', () => {
    it('does not count a delimiter inside quotes', () => {
        expect(detectDelimiter('"a,b";c\n"d,e";f')).toBe(';');
    });
});

describe('decodeImportFile', () => {
    it('falls back to Windows-1252 for a file that is not UTF-8', () => {
        // "Müller" as Excel writes it on a German Windows.
        const bytes = new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]);
        expect(decodeImportFile(bytes.buffer)).toBe('Müller');
    });
});

describe('columns', () => {
    it('finds header, token and role columns by name', () => {
        const { rows } = parseImportText('Name;E-Mail;Rolle\nMax;max@dhbw.de;reader');
        expect(detectHeader(rows)).toBe(true);
        expect(guessColumns(rows, true, ROLES)).toEqual({ tokenColumn: 1, roleColumn: 2 });
    });

    it('guesses by content without a header', () => {
        const { rows } = parseImportText('Max,max@dhbw.de,Reader\nEva,eva@dhbw.de,admin');
        expect(detectHeader(rows)).toBe(false);
        expect(guessColumns(rows, false, ROLES)).toEqual({ tokenColumn: 1, roleColumn: 2 });
    });

    it('has no role column when nothing names a role', () => {
        const { rows } = parseImportText('max@dhbw.de,Max\neva@dhbw.de,Eva');
        expect(guessColumns(rows, false, ROLES).roleColumn).toBeNull();
    });
});

describe('matchRole', () => {
    it('matches case-insensitively and only known roles', () => {
        expect(matchRole('Reader', ROLES)).toBe('reader');
        expect(matchRole('Dozent', ROLES)).toBeNull();
        expect(matchRole('', ROLES)).toBeNull();
    });
});

describe('buildImportRows', () => {
    it('marks new, existing, duplicate and invalid rows and keeps the file line', () => {
        const table = parseImportText('E-Mail;Rolle\na@dhbw.de;reader\nb@dhbw.de;Dozent\nA@dhbw.de;\nkaputt;\nc@dhbw.de;');
        const rows = buildImportRows(table, {
            hasHeader: true, tokenColumn: 0, roleColumn: 1, roles: ROLES, existing: ['user:c@dhbw.de'],
        });
        expect(rows.map(r => [r.line, r.token, r.status, r.role, r.rawRole])).toEqual([
            [2, 'user:a@dhbw.de', 'new', 'reader', 'reader'],
            [3, 'user:b@dhbw.de', 'new', null, 'Dozent'],
            [4, 'user:a@dhbw.de', 'duplicate', null, ''],
            [5, null, 'invalid', null, ''],
            [6, 'user:c@dhbw.de', 'existing', null, ''],
        ]);
    });

    it('re-judges duplicates once rows are removed', () => {
        const table = parseImportText('a@dhbw.de\nb@dhbw.de\na@dhbw.de');
        const rows = buildImportRows(table, {
            hasHeader: false, tokenColumn: 0, roleColumn: null, roles: ROLES, existing: [], removed: new Set([1]),
        });
        expect(rows.map(r => [r.line, r.status])).toEqual([[2, 'new'], [3, 'new']]);
    });
});
