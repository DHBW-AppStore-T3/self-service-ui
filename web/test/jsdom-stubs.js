// The browser APIs jsdom does not implement and Mantine calls unconditionally.
//
// Imported by the render harness rather than wired in as a global vitest
// setupFile: setupFiles run for EVERY test, and the pure-function tests neither
// have a `window` nor should start paying for one.
//
// These are stubs, not simulations. A test that needs to assert real media
// queries or real element sizes should say so and build what it needs; nothing
// here pretends to be a browser beyond letting a component mount.
if (typeof window !== 'undefined') {
    // MantineProvider reads the colour-scheme preference on mount.
    if (!window.matchMedia) {
        window.matchMedia = (query) => ({
            media: query,
            matches: false,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        });
    }

    // ScrollArea and the popovers observe their own size.
    if (!window.ResizeObserver) {
        window.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        globalThis.ResizeObserver = window.ResizeObserver;
    }

    // Select and the tree move focus around with this.
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }

    // An autosizing Textarea re-measures once web fonts have loaded.
    if (!document.fonts) {
        Object.defineProperty(document, 'fonts', {
            value: { addEventListener: () => {}, removeEventListener: () => {} },
        });
    }

    // Node 25 ships its own `localStorage`, which shadows jsdom's and is not a
    // working Storage without --localstorage-file (no clear(), no events).
    // Tests that read or write it get a plain in-memory one instead.
    if (typeof window.localStorage?.clear !== 'function') {
        const items = new Map();
        const storage = {
            getItem: key => (items.has(String(key)) ? items.get(String(key)) : null),
            setItem: (key, value) => { items.set(String(key), String(value)); },
            removeItem: key => { items.delete(String(key)); },
            clear: () => items.clear(),
            key: index => [...items.keys()][index] ?? null,
            get length() { return items.size; },
        };
        Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
        Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    }
}
