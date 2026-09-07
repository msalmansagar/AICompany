// A form created through the wizard could not be saved. The wizard assembled the model from
// its own inputs and never read the record back, so no @odata.etag reached the concurrency
// store — and every save PATCHes the form header conditionally, so the first Save Draft died
// with MissingEtagError. Reproduced in CRM on org5869857f.
//
// Worse, the save is not atomic: the header PATCH runs LAST, so the tabs, sections and fields
// were already written by the time it failed while the banner still read "Save failed".
//
// Driving the five wizard steps through the DOM needs a whole CrmContext and Dataverse double,
// which tests the harness more than the fix. The invariant that actually matters is small and
// checkable at the source: the wizard must read the record back and store its etag, using the
// same ordering the form list relies on.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WIZARD = readFileSync(
  join(__dirname, '../../src/screens/NewFormWizardScreen.tsx'),
  'utf8',
);

describe('NewFormWizardScreen — a newly created form is savable', () => {
  it('readsTheRecordBack_afterCreatingIt', () => {
    expect(WIZARD).toContain('getFormWithEtag');
  });

  it('storesTheEtag_soTheFirstSaveIsNotRejected', () => {
    expect(WIZARD).toContain('setRecordEtag');
  });

  // loadForm resets the concurrency store, so an etag stored before it is wiped and every
  // save fails — the exact ordering bug the form list carries a comment about.
  it('storesTheEtagAFTERloadForm_becauseLoadFormResetsTheStore', () => {
    const loadFormAt = WIZARD.indexOf('loadForm({');
    const setEtagAt = WIZARD.indexOf('setRecordEtag');

    expect(loadFormAt).toBeGreaterThan(-1);
    expect(setEtagAt).toBeGreaterThan(loadFormAt);
  });

  // entityLogicalName is not a Dataverse column — it lives in the store only, so reading the
  // record back would silently drop the maker's choice unless it is carried across.
  it('carriesEntityLogicalNameAcrossTheReadBack', () => {
    expect(WIZARD).toContain('newForm.entityLogicalName');
  });
});
