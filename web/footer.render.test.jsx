// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import { Footer } from '/footer.jsx';

// The footer names the AI service only to whoever sees one of its areas (Workspaces or LLM) in the navigation.

let areas;
const remote = vi.fn();
vi.mock('/ai-areas.jsx', () => ({ useAiAreasVisible: () => areas }));
vi.mock('/providers/dyndns-config.jsx', () => ({ useDynDnsConfig: () => ({ config: { version: '1.0.0' } }) }));
vi.mock('/providers/cloud-config.jsx', () => ({ useCloudConfig: () => ({ config: null }) }));
vi.mock('/providers/remote-config.jsx', () => ({ useRemoteConfig: (base) => { remote(base); return { config: base ? { version: '0.9.9' } : null }; } }));

afterEach(() => { cleanup(); remote.mockClear(); });

describe('footer', () => {
    window.appconfig = { llmBaseUrl: '/api/llm/' };

    it('leaves the AI service out while neither area is visible, and does not ask for its version', () => {
        areas = { anyVisible: false };
        renderView(<Footer title="UI" version="2.0.0" />);
        expect(screen.getByText('Dynamic Zones API')).toBeTruthy();
        expect(screen.queryByText('AI Service API')).toBeNull();
        expect(remote).toHaveBeenCalledWith(undefined);
    });

    it('names the AI service with its version when an area is visible', () => {
        areas = { anyVisible: true };
        renderView(<Footer title="UI" version="2.0.0" />);
        expect(screen.getByText('AI Service API')).toBeTruthy();
        expect(screen.getByText(/0\.9\.9/)).toBeTruthy();
    });
});
