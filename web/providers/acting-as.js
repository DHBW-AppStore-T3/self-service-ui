// The person this tab acts on behalf of (act-as.jsx), as a plain module without React or API imports, so code like util-project.jsx can ask whose view a page is without an import cycle through the API facades.

const KEY = 'self-service.act-as';

function stored() {
    try { return sessionStorage.getItem(KEY) || null; } catch { return null; }
}

// storeActingAs keeps the choice for this tab; act-as.jsx reloads the page right after.
export function storeActingAs(email) {
    try {
        if (email) sessionStorage.setItem(KEY, email);
        else sessionStorage.removeItem(KEY);
    } catch { /* not kept: the reload then shows the person's own view */ }
}

// Read once, before the first request (the interceptors need it before React mounts), and fixed for the page's life: a switch reloads.
function atLoad() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const fromLink = params.get('act_as');
    if (fromLink !== null) {
        storeActingAs(fromLink.trim().toLowerCase());
        params.delete('act_as');
        const rest = params.toString();
        window.history.replaceState({}, document.title, window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    }
    return stored();
}

export const actingAsAtLoad = atLoad();
