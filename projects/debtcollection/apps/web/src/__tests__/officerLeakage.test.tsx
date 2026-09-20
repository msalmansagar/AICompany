import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App.js';
import { VIEWS, isPending } from '../shell/routes.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * What a Collection Officer must never be shown.
 *
 * Phase 7 runtime validation found the raw Dynamics organisation unique name —
 * `unq8e28c4d88f8f4c42aa0a31a680cc0` — rendered across the top of every screen. It had been there
 * since Phase 5, which made it inherited rather than acceptable: an officer reading it learns
 * nothing and is shown an internal identifier (KI-93).
 *
 * A single assertion on the header would not have caught it, and would not catch the next one. So
 * this sweeps **every routed view** for every leak class the authorisation names, and does it on
 * the real `App` so the header, the nav rail and the view are all in scope at once.
 *
 * The organisation name is supplied to the fake host deliberately. A test whose host reports no
 * organisation name proves only that nothing rendered `undefined`.
 */

const ORGANISATION_UNIQUE_NAME = 'unq8e28c4d88f8f4c42aa0a31a680cc0';

/** One pattern per leak class, each named so a failure says what leaked rather than that one did. */
const FORBIDDEN: readonly { what: string; pattern: RegExp }[] = [
  // No word boundaries. `textContent` concatenates adjacent field values with no separator, so the
  // character before `unq` is whatever the previous value ended with — usually a digit. A leading
  // `\b` made this pattern silently never match, which is how the Configuration panel kept the
  // identifier after the header lost it, with the sweep reporting clean.
  { what: 'the raw organisation unique name', pattern: /unq[0-9a-f]{8,}/i },
  { what: 'a GUID', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
  { what: 'an entity logical name', pattern: /\bqdb_[a-z_]+\b/ },
  { what: 'an entity set name', pattern: /\b(faxes|activityparties|emails)\b/i },
  { what: 'ActivityParty terminology', pattern: /activity\s*part(y|ies)|participationtypemask/i },
  { what: 'an ETag', pattern: /\bETag\b|W\/"/i },
  { what: 'a precondition header', pattern: /If-(Match|None-Match)/i },
  { what: 'an HTTP status code', pattern: /\b(400|401|403|404|412|500|503)\b(?!\s*(DPD|days))/ },
  { what: 'a KI number', pattern: /\bKI-\d+/ },
  { what: 'a stack trace', pattern: /\bat\s+\w+\s*\(.*:\d+:\d+\)/ },
  { what: 'an unrendered object', pattern: /\[object Object\]/ },
  { what: 'a raw OData error', pattern: /Could not find a property named|Resource not found for the segment|Microsoft\.Dynamics\.CRM/i },
  { what: 'an OData construct', pattern: /\$select=|\$filter=|\$orderby=|odata/i },
];

function fakeXrm(): XrmLike {
  return {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: {
          userId: '{61086FE4-0000-0000-0000-000000000001}',
          userName: 'Tester', languageId: 1033,
          securityRoles: ['{AAAA0000-0000-0000-0000-000000000001}'],
        },
        // Supplied on purpose: the defect was rendering this, so a fake that withheld it would
        // make the test pass for the wrong reason.
        organizationSettings: { uniqueName: ORGANISATION_UNIQUE_NAME },
      }),
    },
    WebApi: {
      async retrieveRecord() { throw { status: 404 }; },
      async retrieveMultipleRecords() { return { entities: [], '@odata.count': 0 }; },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  };
}

/** A host that fails every read the way the platform really does — with a plain object. */
function failingXrm(): XrmLike {
  const host = fakeXrm();
  return {
    ...host,
    WebApi: {
      ...host.WebApi,
      async retrieveMultipleRecords() {
        // Not an Error. This is the shape that produced `[object Object]` on the live screen.
        throw { message: "Could not find a property named 'qdb_collectionactivityid' on type 'Microsoft.Dynamics.CRM.qdb_collectionactivity'.", status: 400 };
      },
      async retrieveRecord() {
        throw { message: 'Resource not found for the segment "activitypartys".', status: 404 };
      },
    },
  };
}

function install(xrm: XrmLike) {
  (window as unknown as { Xrm?: XrmLike }).Xrm = xrm;
}

/**
 * Opens a view and **proves the route was taken**.
 *
 * Without this assertion the sweep was vacuous for every role-gated view: `#admin` with the
 * default role fell back to another screen, the sweep read that screen, found it clean and passed
 * — while the real Configuration view carried the organisation unique name the whole time. A guard
 * that reads the wrong page is worse than no guard, because it reports safety.
 */
async function openView(viewId: string) {
  window.location.hash = `#${viewId}`;
  render(<App />);
  const content = await screen.findByTestId('content');
  expect(
    content.getAttribute('data-view'),
    `the router did not open ${viewId} — this sweep would have read a different screen`,
  ).toBe(viewId);
  return content;
}

function assertClean(where: string) {
  const text = document.body.textContent ?? '';
  expect(text.length, `${where} rendered nothing, so this sweep proves nothing`).toBeGreaterThan(200);
  for (const { what, pattern } of FORBIDDEN) {
    expect(pattern.test(text), `${where} leaks ${what}`).toBe(false);
  }
}

beforeEach(() => { window.location.hash = ''; });

afterEach(() => {
  cleanup();
  delete (window as unknown as { Xrm?: XrmLike }).Xrm;
});

describe('the organisation identifier never reaches an officer', () => {
  it('is not rendered in the header, even though the host reports one', async () => {
    install(fakeXrm());
    await openView('myday');

    expect(document.body.textContent).not.toContain(ORGANISATION_UNIQUE_NAME);
    expect(document.body.textContent).not.toMatch(/\bunq[0-9a-f]{8,}/i);
  });
});

describe('every routed view is free of developer internals', () => {
  const routed = VIEWS.filter(view => !isPending(view));

  it('has views to sweep, so an empty loop cannot pass silently', () => {
    expect(routed.length).toBeGreaterThanOrEqual(13);
  });

  for (const view of routed) {
    it(`${view.id} shows nothing an officer would not recognise`, async () => {
      install(fakeXrm());
      await openView(view.id);
      assertClean(view.id);
    });
  }
});

describe('the error paths are swept too, not only the happy ones', () => {
  const routed = VIEWS.filter(view => !isPending(view));

  for (const view of routed) {
    it(`${view.id} stays clean when every read fails`, async () => {
      // The failure path is where leakage actually happens: a screen that renders the platform's
      // own message is one CRM error away from showing an officer an OData complaint.
      install(failingXrm());
      await openView(view.id);
      await waitFor(() => expect(screen.getByTestId('content').textContent!.length).toBeGreaterThan(0));
      assertClean(`${view.id} (failing reads)`);
    });
  }
});
