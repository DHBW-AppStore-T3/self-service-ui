import isEmail from 'validator/lib/isEmail.js';

// Bulk import of user:/group: tokens from pasted text or a CSV file. Pure
// functions only: the modal parses once into a table, then everything the user
// changes in the preview (which column, which role) is a recomputation of
// buildImportRows over that table.

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_ROWS = 1000;

const DELIMITERS = ['\t', ';', ','];

// A relation name as the role provider spells it ("dozent", "studierende").
const GROUP_TOKEN = /^group:[^\s#]+(#[a-z][a-z0-9_-]*)?$/;

const TOKEN_HEADER = /^(e-?mail|mail|e-?mail-?adresse|user|users|benutzer|nutzer|token|principal|group|gruppe|login|address|adresse)$/i;
const ROLE_HEADER = /^(role|rolle|openstack[ _-]?role|openstack[ _-]?rolle)$/i;

/**
 * Decodes a file's bytes. Excel on a German Windows still writes CSV as
 * Windows-1252, so UTF-8 is tried strictly first and anything that is not valid
 * UTF-8 is read as Windows-1252 rather than turned into replacement characters.
 */
export function decodeImportFile(buffer) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
        return new TextDecoder('windows-1252').decode(buffer);
    }
}

// Counts a delimiter outside double quotes, so a quoted "Muster, Max" does not
// vote for the comma.
function countOutsideQuotes(line, ch) {
    let n = 0;
    let quoted = false;
    for (const c of line) {
        if (c === '"') quoted = !quoted;
        else if (c === ch && !quoted) n++;
    }
    return n;
}

/**
 * The delimiter at least half of the first lines agree on — a table has it on
 * every line — or null for a list, where a stray comma on one line is just
 * another separator. Ties go to tab, then semicolon (what Excel writes in a
 * German locale), then comma.
 */
export function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
    let best = null;
    let bestScore = 0;
    for (const d of DELIMITERS) {
        const score = lines.filter(l => countOutsideQuotes(l, d) > 0).length;
        if (score > bestScore) { best = d; bestScore = score; }
    }
    return bestScore * 2 >= lines.length ? best : null;
}

// One line of a list into its entries. A display name may hold spaces and a
// comma ("Muster, Max <max@…>"), so a line with one splits on semicolons only,
// the way Outlook separates recipients. Otherwise commas and semicolons
// separate, and spaces only where every part is an entry of its own — a line
// of prose stays one (invalid) entry instead of one per word.
function splitListLine(line) {
    if (line.includes('<')) return line.split(';');
    return line.split(/[,;]+/).flatMap(piece => {
        const words = piece.trim().split(/\s+/);
        return words.length > 1 && words.every(w => normalizePrincipal(w)?.token) ? words : [piece];
    });
}

// RFC 4180: quoted fields may hold the delimiter, line breaks and doubled quotes.
function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (c === '"') quoted = false;
            else cell += c;
        } else if (c === '"' && cell.trim() === '') {
            quoted = true;
            cell = '';
        } else if (c === delimiter) {
            row.push(cell); cell = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else {
            cell += c;
        }
    }
    row.push(cell);
    rows.push(row);
    return rows;
}

/**
 * Parses pasted text or file content into a table of trimmed cells, dropping
 * empty lines. Without a table delimiter it is a list: one column, each line
 * split into its entries (see splitListLine), and lines starting with # are
 * comments.
 *
 * A single row of several cells is a list pasted on one line (Outlook's
 * "A <a@…>; B <b@…>"), so it is turned into one column.
 */
export function parseImportText(input) {
    const text = String(input ?? '').replace(/^\uFEFF/, '');
    const delimiter = detectDelimiter(text);
    let rows;
    if (delimiter) {
        rows = parseDelimited(text, delimiter);
    } else {
        rows = text.split(/\r?\n/)
            .filter(line => !line.trim().startsWith('#'))
            .flatMap(line => splitListLine(line).map(cell => [cell]));
    }
    rows = rows
        .map(r => r.map(c => c.trim()))
        .filter(r => r.some(c => c !== ''));
    if (rows.length === 1 && rows[0].length > 1) rows = rows[0].map(c => [c]);
    const columns = rows.reduce((max, r) => Math.max(max, r.length), 0);
    return { rows: rows.map(r => [...r, ...Array(columns - r.length).fill('')]), columns, delimiter };
}

/**
 * The token a cell stands for: { token } for a valid one, { error } for a cell
 * that is not, null for an empty cell. Accepts group:… (optionally with a
 * relation), user:…, a bare address, "Name <address>" and mailto:. Addresses
 * are lowercased, "#member" is dropped since it is the same grant as the bare
 * group.
 */
export function normalizePrincipal(cell) {
    let s = String(cell ?? '').trim().replace(/^["']|["']$/g, '').trim();
    if (!s) return null;

    const group = /^group:(.*)$/i.exec(s);
    if (group) {
        const token = ('group:' + group[1].trim()).replace(/#member$/, '');
        return GROUP_TOKEN.test(token) ? { token } : { error: 'invalid' };
    }

    const angle = /<([^<>]+)>/.exec(s);
    if (angle) s = angle[1];
    s = s.trim().replace(/^user:/i, '').replace(/^mailto:/i, '').trim().toLowerCase();
    return isEmail(s) ? { token: 'user:' + s } : { error: 'invalid' };
}

/** The role a cell names, matched case-insensitively against the known roles. */
export function matchRole(value, roles) {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v) return null;
    return (roles || []).find(r => r.toLowerCase() === v) ?? null;
}

/**
 * Whether the first row is a header: it has to be followed by data, and none of
 * its cells may be a valid principal — a list that starts with an address has
 * no header.
 */
export function detectHeader(rows) {
    if (rows.length < 2) return false;
    return !rows[0].some(c => normalizePrincipal(c)?.token);
}

/**
 * Preselects the columns: by header name first, otherwise the column with the
 * most valid principals, and for the role the column whose values are most
 * often a known role. roleColumn is null when nothing fits.
 */
export function guessColumns(rows, hasHeader, roles) {
    const columns = rows[0]?.length ?? 0;
    const header = hasHeader ? rows[0] : null;
    const data = hasHeader ? rows.slice(1) : rows;
    const count = (col, ok) => data.filter(r => ok(r[col])).length;
    const range = [...Array(columns).keys()];

    let tokenColumn = header ? range.find(i => TOKEN_HEADER.test(header[i])) : undefined;
    if (tokenColumn === undefined) {
        tokenColumn = range.reduce((best, i) => (
            count(i, c => normalizePrincipal(c)?.token) > count(best, c => normalizePrincipal(c)?.token) ? i : best
        ), 0);
    }

    let roleColumn = header ? range.find(i => i !== tokenColumn && ROLE_HEADER.test(header[i])) : undefined;
    if (roleColumn === undefined) {
        const scored = range
            .filter(i => i !== tokenColumn)
            .map(i => ({ i, n: count(i, c => matchRole(c, roles)) }))
            .filter(x => x.n > 0)
            .sort((a, b) => b.n - a.n);
        roleColumn = scored[0]?.i ?? null;
    }
    return { tokenColumn, roleColumn };
}

/**
 * One preview row per data row. status is "new", "existing" (already on the
 * list), "duplicate" (an earlier row names the same token) or "invalid".
 * role is the matched role, or null — rawRole keeps what the file said so the
 * preview can show a value it did not recognise.
 */
export function buildImportRows(table, { hasHeader, tokenColumn, roleColumn, roles, existing }) {
    const data = hasHeader ? table.rows.slice(1) : table.rows;
    const firstLine = hasHeader ? 2 : 1;
    const have = new Set(existing || []);
    const seen = new Set();
    return data.slice(0, IMPORT_MAX_ROWS).flatMap((r, i) => {
        const raw = r[tokenColumn] ?? '';
        const parsed = normalizePrincipal(raw);
        if (!parsed) return [];
        const rawRole = roleColumn === null || roleColumn === undefined ? '' : (r[roleColumn] ?? '');
        let status = 'new';
        if (parsed.error) status = 'invalid';
        else if (have.has(parsed.token)) status = 'existing';
        else if (seen.has(parsed.token)) status = 'duplicate';
        if (parsed.token) seen.add(parsed.token);
        return [{
            line: firstLine + i,
            raw,
            token: parsed.token ?? null,
            status,
            rawRole,
            role: matchRole(rawRole, roles),
        }];
    });
}

/** Whether the table had more data rows than one import takes. */
export function isTruncated(table, hasHeader) {
    return table.rows.length - (hasHeader ? 1 : 0) > IMPORT_MAX_ROWS;
}
