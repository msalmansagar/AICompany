/**
 * DEV-ONLY standalone mock API for local NUMBAR testing — zero deps, no @qdb/shared.
 * Sidesteps the backend's @qdb/shared server/client entry-split startup bug.
 * Serves a seeded loan form with number/decimal/currency "bar" fields so the
 * real frontend (vite :3000, proxy → :4000) renders the utilization gauges.
 *
 * Run both, then open http://localhost:3000/forms/loan-application :
 *   node projects/dynamic-form-engine/scripts/dev-mock-api.mjs        # this, on :4000
 *   cd projects/dynamic-form-engine/frontend && npm run dev            # vite, on :3000
 */
import { createServer } from 'node:http';

const ok = (data) => JSON.stringify({ success: true, data });

// ── Seeded "record": defaults become the initial field values ──────────────
const field = (o) => ({
  placeholder: '', helpText: '', isRequired: false, isReadonly: false,
  isHidden: false, isVisible: true, columnSpan: 1, options: [],
  validationRules: [], businessRules: [], ...o,
});

const FORM = {
  id: 'fd-numbar-demo',
  formCode: 'loan-application',
  title: 'Tab Header/Footer + Submit Gate Demo',
  description: 'Fields placed in the tab header and footer zones (not just sections), plus a manual submit-confirmation gate.',
  status: 'active',
  version: 1,
  allowSaveDraft: false,
  draftExpiryDays: 0,
  confirmationMessage: 'Done.',
  confirmationRecordRefAttribute: 'ticketnumber',
  allowInfocardSkip: false,
  infocardCountsInProgress: false,
  infoCards: [],
  showSummaryStep: true,
  buttons: [],
  submissionMappings: [],
  // DFE-SUBMITCONFIRM-001: manual acknowledgement gate on the final step.
  submitConfirmation: {
    checkboxLabel: 'I confirm the information above is accurate and complete',
    dialogMessage: 'You are about to submit this credit facility application. Do you want to continue?',
  },
  tabs: [
    {
      id: 'tab-1', formDefinitionId: 'fd-numbar-demo', label: 'Credit Facility',
      iconName: 'Money', displayOrder: 1, isVisible: true, requiresPreviousTabComplete: false,
      // DFE-TABZONE-001: fields rendered directly in the tab HEADER zone (above the sections).
      headerFields: [
        field({
          id: 'h-ref', sectionId: '', tabId: 'tab-1', placement: 'header',
          fieldType: 'text', schemaName: 'qdb_app_ref', label: 'Application Reference',
          displayOrder: 1, columnSpan: 2, isReadonly: true, defaultValue: 'APP-2026-0042',
        }),
        field({
          id: 'h-branch', sectionId: '', tabId: 'tab-1', placement: 'header',
          fieldType: 'text', schemaName: 'qdb_branch', label: 'Branch',
          displayOrder: 2, columnSpan: 2, defaultValue: 'Doha Main',
        }),
      ],
      // DFE-TABZONE-001: fields rendered directly in the tab FOOTER zone (below the sections).
      footerFields: [
        field({
          id: 'ft-notes', sectionId: '', tabId: 'tab-1', placement: 'footer',
          fieldType: 'text', schemaName: 'qdb_reviewer_notes', label: 'Reviewer Notes',
          displayOrder: 1, columnSpan: 4, placeholder: 'Internal notes for the reviewer…',
        }),
        field({
          id: 'ft-priority', sectionId: '', tabId: 'tab-1', placement: 'footer',
          fieldType: 'boolean', schemaName: 'qdb_priority', label: 'Priority Case',
          displayOrder: 2, columnSpan: 2, trueLabel: 'Yes', falseLabel: 'No',
          boolRenderStyle: 'toggle', defaultValue: false,
        }),
      ],
      sections: [
        {
          id: 'sec-1', tabId: 'tab-1', label: 'Utilization', displayOrder: 1, columns: 2,
          isCollapsible: false, isCollapsedByDefault: false, isVisible: true,
          fields: [
            field({
              id: 'f-limit', sectionId: 'sec-1', fieldType: 'currency', schemaName: 'qdb_total_limit',
              label: 'Total Credit Limit (QAR) — editable', displayOrder: 1, columnSpan: 2,
              currencyCode: 'QAR', decimalPlaces: 0, defaultValue: 100000,
              helpText: 'Edit this and watch every bar below recompute live.',
            }),
            field({
              id: 'f-cur', sectionId: 'sec-1', fieldType: 'currency', schemaName: 'qdb_credit_utilized',
              label: 'Credit Utilized (currency bar)', displayOrder: 2, columnSpan: 2,
              currencyCode: 'QAR', decimalPlaces: 0, defaultValue: 65000,
              numberDisplayStyle: 'bar', barMaxFieldSchemaName: 'qdb_total_limit',
            }),
            field({
              id: 'f-num', sectionId: 'sec-1', fieldType: 'number', schemaName: 'qdb_units_consumed',
              label: 'Units Consumed (number bar — amber)', displayOrder: 3, columnSpan: 2,
              defaultValue: 82000, numberDisplayStyle: 'bar', barMaxFieldSchemaName: 'qdb_total_limit',
            }),
            field({
              id: 'f-dec', sectionId: 'sec-1', fieldType: 'decimal', schemaName: 'qdb_ratio_used',
              label: 'Ratio Used (decimal bar — hits red)', displayOrder: 4, columnSpan: 2,
              decimalPlaces: 2, defaultValue: 95000,
              numberDisplayStyle: 'bar', barMaxFieldSchemaName: 'qdb_total_limit',
            }),
          ],
        },
        {
          id: 'sec-docs', tabId: 'tab-1', label: 'Documents', displayOrder: 2, columns: 1,
          isCollapsible: false, isCollapsedByDefault: false, isVisible: true,
          fields: [
            field({
              id: 'f-docgrid', sectionId: 'sec-docs', fieldType: 'interactive-grid',
              schemaName: 'qdb_documents', label: 'Supporting Documents', displayOrder: 1, columnSpan: 4,
              gridConfig: {
                gridMode: 'entry', mode: 'entry', targetEntity: 'qdb_doc',
                maxRows: 10, minRows: 0,
                columnConfigs: [
                  { columnId: 'c-desc', displayOrder: 1, columnLabel: 'Description', targetAttribute: 'qdb_desc', columnFieldType: 'text' },
                  { columnId: 'c-file', displayOrder: 2, columnLabel: 'Document', targetAttribute: 'qdb_file', columnFieldType: 'file' },
                ],
              },
            }),
          ],
        },
      ],
    },
  ],
};

const server = createServer((req, res) => {
  const url = (req.url || '').split('?')[0].replace(/^\/api/, '');
  res.setHeader('Content-Type', 'application/json');

  if (url.match(/^\/forms\/[^/]+\/metadata$/)) return res.end(ok(FORM));
  // Mock file upload: echoes the uploaded filename back as an UploadedFileReference.
  if (url === '/files/upload' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const match = /filename="([^"]+)"/.exec(body);
      const fileName = match ? match[1] : 'document.pdf';
      res.end(ok({
        fileId: `mock-${Date.now()}`,
        fileName,
        mimeType: 'application/octet-stream',
        sizeBytes: body.length,
        url: `/files/mock/${encodeURIComponent(fileName)}`,
      }));
    });
    return;
  }
  if (url === '/languages') return res.end(ok([]));
  if (url.startsWith('/options/')) return res.end(ok([]));
  if (url.startsWith('/lookups/')) return res.end(ok([]));
  if (url.match(/^\/forms\/[^/]+\/data\//)) return res.end(ok({}));
  if (url === '/forms') return res.end(ok([{
    id: FORM.id, formCode: FORM.formCode, title: FORM.title,
    description: FORM.description, status: FORM.status, version: FORM.version,
    modifiedAt: '2026-07-06T00:00:00Z',
  }]));

  // default: empty success so the renderer never 500s on an unexpected call
  res.end(ok(null));
});

server.listen(4000, () => console.log('mock form API on http://localhost:4000  (form: loan-application)'));
