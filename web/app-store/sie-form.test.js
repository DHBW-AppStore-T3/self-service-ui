import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The German App Store texts address people with "Sie". "du", "dein" and the
// du-imperatives crept in once (the first texts were written for students) and
// would again with the next copy-pasted sentence, so this reads the file.

const de = JSON.parse(readFileSync(new URL('../i18n/de/appStore.json', import.meta.url), 'utf8'));

function strings(value, path = '') {
    if (typeof value === 'string') return [[path, value]];
    return Object.entries(value).flatMap(([key, child]) => strings(child, path ? `${path}.${key}` : key));
}

// du-pronouns in any case, and the imperatives of the verbs these texts use.
// Case-sensitive on purpose for "Ihr": the polite possessive is capitalised.
// \b is ASCII-only in JavaScript ("Ändere" has no boundary before the Ä), so
// the word edges are spelled as lookarounds over letters.
const DU_FORM = new RegExp(
    '(?<!\\p{L})(?:[Dd]u|dich|[Dd]ir|[Dd]ein|[Dd]eine|[Dd]einen|[Dd]einem|[Dd]einer|[Dd]eines|euch|eure[nrms]?|' +
    'Ändere|Wähle|Versuche|Prüfe|Gib|Klicke|Lade|Öffne|Trage|Lege|Nutze|Verwende|Starte|Melde|Suche|Setze|Lies|Drücke|Gehe|Füge|Lösche|Speichere|Lass)(?!\\p{L})',
    'u',
);

describe('German App Store texts', () => {
    it('use the formal address and no du-form', () => {
        const offenders = strings(de).filter(([, text]) => DU_FORM.test(text)).map(([key, text]) => `${key}: ${text}`);
        expect(offenders).toEqual([]);
    });

    it('catch what they are meant to catch', () => {
        for (const text of ['Wähle eine App', 'Dein Konto', 'Das findest du hier', 'Sobald dich jemand einträgt', 'Ändere den Suchbegriff']) {
            expect(DU_FORM.test(text), text).toBe(true);
        }
        for (const text of ['Wählen Sie eine App', 'Ihr Konto', 'Das finden Sie hier', 'Ändern Sie den Suchbegriff', 'Wird bereitgestellt']) {
            expect(DU_FORM.test(text), text).toBe(false);
        }
    });
});
