// Department assignment of the catalog, the same curated table the existing
// frontend keeps in src/config/department-catalog.ts.
//
// An assignment means "suited for this course of study", not "proven to be used
// there". Apps are assigned only through explicitly maintained, normalised
// git_link aliases (exact match) — no keyword or regex classification, and no
// matching on the repository name alone. An app that is not listed belongs to
// no department and shows under "All" only.
//
// This is a copy, not a shared source: the two UIs are separate builds, and a
// package or backend field for ten rows would cost more than keeping both in
// step. When an app is added in one, add it in the other (aliases normalised,
// see normalizeGitLink).

export const DEPARTMENTS = [
    'maschinenbau',
    'informatik',
    'elektrotechnik',
    'wirtschaftsingenieurwesen',
    'faecheruebergreifend',
];

const URL_SCHEME = /^(?:ssh|https?|git):\/\//;
const USER_INFO = /^[^@/]+@/;
const TRAILING_SLASHES = /\/+$/;
const TRAILING_DOT_GIT = /\.git$/;

/**
 * normalizeGitLink brings https, `ssh://` and scp-style (`git@host:owner/repo`)
 * links to `host/owner/repo` in lower case. Trailing slashes go before `.git`,
 * so `…/repo.git/` is recognised as well.
 */
export function normalizeGitLink(link) {
    let value = (link ?? '').trim().toLowerCase();
    if (!value) return null;
    const hadScheme = URL_SCHEME.test(value);
    value = value.replace(URL_SCHEME, '').replace(USER_INFO, '');
    // scp form: the first ':' separates host and path.
    if (!hadScheme) value = value.replace(':', '/');
    value = value
        .replace(/^www\./, '')
        .replace(TRAILING_SLASHES, '')
        .replace(TRAILING_DOT_GIT, '');
    return value || null;
}

const GITHUB = 'github.com';
const both = repo => [`${GITHUB}/dhbw-appstore/${repo}`, `${GITHUB}/dhbw-appstore-t3/${repo}`];

// `name` documents the row and is never used to match.
const APP_DEPARTMENTS = [
    { name: 'Online-IDE', aliases: both('online-ide'), departments: ['informatik'] },
    { name: 'Ubuntu-App', aliases: both('ubuntu-app'), departments: ['informatik'] },
    { name: 'pgAdmin', aliases: both('pgadmin'), departments: ['informatik'] },
    { name: 'GitLab-CE', aliases: [`${GITHUB}/six7-click-n-deploy/gitlab-app`], departments: ['informatik'] },
    { name: 'Monitoring-Stack', aliases: [`${GITHUB}/six7-click-n-deploy/monitoring-stack`], departments: ['informatik'] },
    {
        name: 'Jupyter-Notebook',
        aliases: both('jupyter-notebook'),
        departments: ['informatik', 'maschinenbau', 'elektrotechnik', 'faecheruebergreifend'],
    },
    {
        name: 'Web-LaTeX',
        aliases: both('web-latex'),
        departments: ['informatik', 'maschinenbau', 'elektrotechnik', 'wirtschaftsingenieurwesen', 'faecheruebergreifend'],
    },
];

const BY_ALIAS = new Map(APP_DEPARTMENTS.flatMap(entry => entry.aliases.map(alias => [alias, entry.departments])));

export function departmentsForGitLink(link) {
    const normalized = normalizeGitLink(link);
    return (normalized && BY_ALIAS.get(normalized)) || [];
}
