import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from '../App.js';
import { VIEWS } from '../shell/routes.js';
import { V2_PAGES } from '../v2/pages/v2Pages.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * No capability is lost by choosing V2.
 *
 * Every route in the table opens inside the V2 frame — natively where V2 has a page, as V1's own view
 * otherwise — without falling back to V1 and without reaching V1's "unrouted" defect screen. The list
 * of native pages is asserted too, so it cannot shrink silently.
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
      retrieveRecord: async () => { throw { errorCode: 2147746327 }; },
      retrieveMultipleRecords: async () => ({ entities: [] }),
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ '@odata.count': 0, value: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

beforeEach(() => { window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2'); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  window.location.hash = '';
});

describe('V2 covers every route', () => {
  it('has the whole route table to cover', () => {
    expect(VIEWS).toHaveLength(21);
  });

  it('draws these routes natively', () => {
    expect(Object.keys(V2_PAGES).sort()).toEqual(
      ['case', 'cases', 'claims', 'customer', 'disputes', 'legal', 'myday', 'ptp', 'queues'].sort(),
    );
  });

  for (const view of VIEWS) {
    it(`opens ${view.id} inside V2`, async () => {
      install();
      window.location.hash = `#${view.id}`;
      render(<App />);

      const content = await screen.findByTestId('v2-content', {}, { timeout: 5000 });

      expect([
        content.dataset['view'],
        screen.queryByTestId('v2-fallback-notice'),
        screen.queryByTestId('unrouted-view'),
      ]).toEqual([view.id, null, null]);
      // A route without a V2 page must still show something: V1's own view, inside the V2 frame.
      if (!V2_PAGES[view.id]) expect(screen.getByTestId('v2-bridged').childElementCount).toBeGreaterThan(0);
    });
  }
});
