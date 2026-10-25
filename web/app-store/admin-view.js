// The admin's switch between "admin view" and "as a lecturer sees it".
//
// A browser-side preference, not a backend one: it changes what this UI offers,
// never what the backend allows. Stored as one object under a single key,
// account -> true, so several accounts in the same browser do not share it and
// a switched-off account leaves no entry behind.

const KEY = 'appstore.adminView';

const listeners = new Set();

// What the switch holds while storage is unavailable (private window, blocked
// site data): it then lasts until the page is reloaded instead of not working.
let fallback = {};

function readAll() {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(KEY));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return fallback;
    }
}

export function readAdminView(account) {
    return Boolean(account) && readAll()[account] === true;
}

export function writeAdminView(account, on) {
    const all = { ...readAll() };
    if (on) all[account] = true;
    else delete all[account];
    fallback = all;
    try {
        window.localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
        // Kept in `fallback` above.
    }
    listeners.forEach(listener => listener());
}

// For useSyncExternalStore. The `storage` event is what another tab's change
// arrives as; this tab's own writes notify through `listeners`.
export function subscribeAdminView(listener) {
    listeners.add(listener);
    window.addEventListener('storage', listener);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', listener);
    };
}
