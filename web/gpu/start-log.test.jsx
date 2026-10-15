// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
import '/i18n/index.js';
import { StartLog } from '/gpu/start.jsx';

const events = [{ progress: 0, message: 'Server requested' }, { progress: 40, message: 'Pulling image registry/x:1' }];
const renderLog = (props) => render(<MantineProvider><StartLog {...props} /></MantineProvider>);

afterEach(cleanup);

// The hub's event log of a start: folded away while it runs, opened by a click; open from the start when the start failed.
describe('StartLog', () => {
    it('is folded until asked for', () => {
        renderLog({ events, open: false });
        const toggle = screen.getByText(/Protokoll anzeigen|Show log/);
        fireEvent.click(toggle);
        expect(screen.getByText(/Pulling image registry\/x:1/)).toBeTruthy();
        expect(screen.getByText(/Protokoll ausblenden|Hide log/)).toBeTruthy();
    });
    it('is open when the start failed', () => {
        renderLog({ events, open: true });
        expect(screen.getByText(/Protokoll ausblenden|Hide log/)).toBeTruthy();
        expect(screen.getByText(/Server requested/)).toBeTruthy();
    });
    it('says when there is nothing yet', () => {
        renderLog({ events: [], open: true });
        expect(screen.getByText(/Noch keine Meldungen|No messages yet/)).toBeTruthy();
    });
});
