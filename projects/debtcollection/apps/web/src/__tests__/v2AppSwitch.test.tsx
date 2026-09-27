import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * The real workspace, with the real version root: V1 by default, V2 on request, and back.
 *
 * jsdom keeps `localStorage` for the whole file, so every test starts and ends without a saved
 * preference — otherwise one switch here would silently open V2 for every later test.
 */

function install(): void {
  const xrm = {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{1}', userName: 'Tester', languageId: 1033, securityRoles: [] },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      retrieveRecord: async () => ({}),
      retrieveMultipleRecords: async () => ({ entities: [] }),
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
}

beforeEach(() => {
  install();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
});

describe('the workspace', () => {
  it('opens V1 by default', async () => {
    render(<App />);

    await screen.findByTestId('content');

    expect(screen.queryByTestId('workspace-v2')).toBeNull();
  });

  it('switches from V1 to V2 from the V1 command bar', async () => {
    render(<App />);
    await screen.findByTestId('content');

    await userEvent.click(screen.getByTestId('cmd-workspace-v2'));

    expect([Boolean(screen.queryByTestId('workspace-v2')), Boolean(screen.queryByTestId('content'))]).toEqual([true, false]);
  });

  it('switches back to V1 from V2', async () => {
    window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
    render(<App />);
    await screen.findByTestId('workspace-v2');

    await userEvent.click(screen.getByTestId('switch-to-v1'));

    expect(await screen.findByTestId('content')).toBeTruthy();
  });
});
