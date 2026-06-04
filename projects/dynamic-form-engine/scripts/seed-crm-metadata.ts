/**
 * Dataverse seed script — Loan Application form metadata
 *
 * Creates the complete set of configuration records for a Loan Application
 * form in the QdbDynamicFormEngine Dataverse solution. All records are
 * written via the Dataverse Web API (OData v4, native fetch).
 *
 * Required environment variables:
 *   DATAVERSE_URL   — https://org5869857f.crm4.dynamics.com
 *   DATAVERSE_TOKEN — Bearer token (obtain via:
 *                     az account get-access-token \
 *                       --resource "https://org5869857f.crm4.dynamics.com/" \
 *                       --query accessToken -o tsv)
 *
 * Run:
 *   npx ts-node scripts/seed-crm-metadata.ts
 *
 * IMPORTANT: This script is idempotent only if run against a clean environment.
 * Running it twice will create duplicate records. Use the companion
 * delete script to reset before re-seeding.
 *
 * Article XI (constitution.md): MSCRM.SolutionUniqueName header is included
 * on every create call. No components are created in the Default Solution.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CreatedRecord {
  readonly id: string;
  readonly entitySetName: string;
}

interface DataverseErrorBody {
  readonly error?: {
    readonly message?: string;
    readonly code?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — read from environment at runtime (never hardcoded)
// ─────────────────────────────────────────────────────────────────────────────

const DATAVERSE_URL = process.env['DATAVERSE_URL'];
const DATAVERSE_TOKEN = process.env['DATAVERSE_TOKEN'];
const SOLUTION_UNIQUE_NAME = 'QdbDynamicFormEngine';
const API_VERSION = '9.2';

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap validation
// ─────────────────────────────────────────────────────────────────────────────

function assertEnvironmentVariables(): void {
  if (!DATAVERSE_URL) {
    throw new Error('DATAVERSE_URL environment variable is required');
  }
  if (!DATAVERSE_TOKEN) {
    throw new Error('DATAVERSE_TOKEN environment variable is required');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dataverse Web API client
// ─────────────────────────────────────────────────────────────────────────────

function buildApiUrl(entitySetName: string): string {
  return `${DATAVERSE_URL}/api/data/v${API_VERSION}/${entitySetName}`;
}

function buildRequiredHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${DATAVERSE_TOKEN}`,
    'Content-Type': 'application/json; charset=utf-8',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    'MSCRM.SolutionUniqueName': SOLUTION_UNIQUE_NAME,
    'Prefer': 'return=representation',
  };
}

async function postRecord(
  entitySetName: string,
  payload: Record<string, unknown>,
): Promise<CreatedRecord> {
  const url = buildApiUrl(entitySetName);
  const response = await fetch(url, {
    method: 'POST',
    headers: buildRequiredHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as DataverseErrorBody;
    const message = errorBody?.error?.message ?? response.statusText;
    throw new Error(
      `POST ${entitySetName} failed (HTTP ${response.status}): ${message}`,
    );
  }

  // Dataverse primary key convention: entity set name minus trailing 's' + 'id'
  // e.g. qdb_form_definitions → qdb_form_definitionid
  const record = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const primaryKeyField = `${entitySetName.slice(0, -1)}id`;

  // Fallback 1: primary key field in the body (Prefer: return=representation)
  let id = record[primaryKeyField] as string | undefined;

  // Fallback 2: @odata.id in the body contains the entity URL with the GUID
  if (!id) {
    const odataId = record['@odata.id'] as string | undefined;
    id = odataId?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  }

  // Fallback 3: OData-EntityId / Location response header (set on 204 No Content)
  if (!id) {
    const headerVal =
      response.headers.get('OData-EntityId') ??
      response.headers.get('Location') ??
      '';
    id = headerVal.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    )?.[0];
  }

  if (!id) {
    throw new Error(`Could not extract ID from POST ${entitySetName} response`);
  }

  return { id, entitySetName };
}

function buildLookupReference(entitySetName: string, id: string): string {
  return `${buildApiUrl(entitySetName)}(${id})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging helpers
// ─────────────────────────────────────────────────────────────────────────────

function logCreated(entitySetName: string, label: string, id: string): void {
  console.log(`  [OK] ${entitySetName} | ${label} | ${id}`);
}

function logSection(title: string): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — Form Definition
// ─────────────────────────────────────────────────────────────────────────────

async function seedFormDefinition(): Promise<string> {
  logSection('Form Definition');

  const record = await postRecord('qdb_form_definitions', {
    qdb_form_code: 'loan-application',
    qdb_title: 'Loan Application',
    qdb_description:
      'QDB Retail and Commercial Loan Application form. Supports individual ' +
      'and corporate customers. Covers facility details, product selection, ' +
      'document upload, and declaration.',
    qdb_status: 100000000, // Draft
    qdb_version: 1,
    qdb_allow_save_draft: true,
    qdb_draft_expiry_days: 90,
    qdb_confirmation_message:
      'Your loan application has been submitted successfully. ' +
      'Your reference number is {refNumber}. ' +
      'A Relationship Manager will contact you within 2 business days.',
    qdb_confirmation_record_ref_attribute: 'qdb_ref_number',
    // qdb_power_automate_flow_id left blank — flow GUID provided by QDB at go-live
    // qdb_access_group_id left blank — all authenticated users for initial UAT
  });

  logCreated('qdb_form_definitions', 'Loan Application', record.id);
  return record.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — Tabs (5)
// ─────────────────────────────────────────────────────────────────────────────

interface TabIds {
  readonly customerInformation: string;
  readonly facilityDetails: string;
  readonly productDetails: string;
  readonly documents: string;
  readonly declaration: string;
}

async function seedTabs(formDefinitionId: string): Promise<TabIds> {
  logSection('Form Tabs');

  const formRef = buildLookupReference('qdb_form_definitions', formDefinitionId);

  const tabs = [
    {
      key: 'customerInformation' as const,
      label: 'Customer Information',
      iconName: 'Contact',
      displayOrder: 10,
    },
    {
      key: 'facilityDetails' as const,
      label: 'Facility Details',
      iconName: 'Money',
      displayOrder: 20,
    },
    {
      key: 'productDetails' as const,
      label: 'Product Details',
      iconName: 'ProductList',
      displayOrder: 30,
    },
    {
      key: 'documents' as const,
      label: 'Documents',
      iconName: 'Attach',
      displayOrder: 40,
    },
    {
      key: 'declaration' as const,
      label: 'Declaration',
      iconName: 'CheckMark',
      displayOrder: 50,
    },
  ] satisfies Array<{
    key: keyof TabIds;
    label: string;
    iconName: string;
    displayOrder: number;
  }>;

  const ids: Partial<Record<keyof TabIds, string>> = {};

  for (const tab of tabs) {
    const record = await postRecord('qdb_form_tabs', {
      'qdb_form_definition_id@odata.bind': formRef,
      qdb_label: tab.label,
      qdb_icon_name: tab.iconName,
      qdb_display_order: tab.displayOrder,
      qdb_is_visible: true,
      qdb_requires_previous_tab_complete: false,
    });
    ids[tab.key] = record.id;
    logCreated('qdb_form_tabs', tab.label, record.id);
  }

  return ids as TabIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — Sections (~10)
// ─────────────────────────────────────────────────────────────────────────────

interface SectionIds {
  readonly customerType: string;
  readonly personalDetails: string;
  readonly contactDetails: string;
  readonly corporateDetails: string;
  readonly facilityRequest: string;
  readonly repaymentDetails: string;
  readonly productSelection: string;
  readonly interestRate: string;
  readonly requiredDocuments: string;
  readonly declarationStatement: string;
}

async function seedSections(tabIds: TabIds): Promise<SectionIds> {
  logSection('Form Sections');

  const sectionDefs: Array<{
    key: keyof SectionIds;
    tabKey: keyof TabIds;
    label: string;
    description: string;
    displayOrder: number;
    columns: number;
    isCollapsible: boolean;
  }> = [
    {
      key: 'customerType',
      tabKey: 'customerInformation',
      label: 'Customer Type',
      description: 'Select whether you are applying as an individual or a corporate entity.',
      displayOrder: 10,
      columns: 100000001, // 1 column
      isCollapsible: false,
    },
    {
      key: 'personalDetails',
      tabKey: 'customerInformation',
      label: 'Personal Details',
      description: 'Enter your personal identification details.',
      displayOrder: 20,
      columns: 100000002, // 2 columns
      isCollapsible: false,
    },
    {
      key: 'contactDetails',
      tabKey: 'customerInformation',
      label: 'Contact Details',
      description: 'Your contact information for correspondence.',
      displayOrder: 30,
      columns: 100000002, // 2 columns
      isCollapsible: false,
    },
    {
      key: 'corporateDetails',
      tabKey: 'customerInformation',
      label: 'Corporate Details',
      description: 'Required for corporate applicants only.',
      displayOrder: 40,
      columns: 100000002, // 2 columns
      isCollapsible: true,
    },
    {
      key: 'facilityRequest',
      tabKey: 'facilityDetails',
      label: 'Facility Request',
      description: 'Specify the loan amount and purpose.',
      displayOrder: 10,
      columns: 100000002, // 2 columns
      isCollapsible: false,
    },
    {
      key: 'repaymentDetails',
      tabKey: 'facilityDetails',
      label: 'Repayment Details',
      description: 'Configure your preferred repayment structure.',
      displayOrder: 20,
      columns: 100000002, // 2 columns
      isCollapsible: false,
    },
    {
      key: 'productSelection',
      tabKey: 'productDetails',
      label: 'Product Selection',
      description: 'Search and select the loan product you are applying for.',
      displayOrder: 10,
      columns: 100000001, // 1 column
      isCollapsible: false,
    },
    {
      key: 'interestRate',
      tabKey: 'productDetails',
      label: 'Interest Rate',
      description: 'Select the interest rate type for this facility.',
      displayOrder: 20,
      columns: 100000002, // 2 columns
      isCollapsible: false,
    },
    {
      key: 'requiredDocuments',
      tabKey: 'documents',
      label: 'Required Documents',
      description:
        'Upload all mandatory supporting documents. Accepted formats: PDF, JPEG, PNG. Max 10 MB per file.',
      displayOrder: 10,
      columns: 100000001, // 1 column
      isCollapsible: false,
    },
    {
      key: 'declarationStatement',
      tabKey: 'declaration',
      label: 'Declaration',
      description:
        'Please read and confirm the declaration before submitting your application.',
      displayOrder: 10,
      columns: 100000001, // 1 column
      isCollapsible: false,
    },
  ];

  const ids: Partial<Record<keyof SectionIds, string>> = {};

  for (const section of sectionDefs) {
    const tabRef = buildLookupReference('qdb_form_tabs', tabIds[section.tabKey]);
    const record = await postRecord('qdb_form_sections', {
      'qdb_form_tab_id@odata.bind': tabRef,
      qdb_label: section.label,
      qdb_description: section.description,
      qdb_display_order: section.displayOrder,
      qdb_columns: section.columns,
      qdb_is_collapsible: section.isCollapsible,
      qdb_is_collapsed_by_default: false,
      qdb_is_visible: true,
    });
    ids[section.key] = record.id;
    logCreated('qdb_form_sections', section.label, record.id);
  }

  return ids as SectionIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — Fields (~20, covering all field types)
// ─────────────────────────────────────────────────────────────────────────────

interface FieldIds {
  readonly customerType: string;
  readonly fullName: string;
  readonly nationalId: string;
  readonly dateOfBirth: string;
  readonly emailAddress: string;
  readonly mobileNumber: string;
  readonly residentialAddress: string;
  readonly companyName: string;
  readonly commercialRegistrationNumber: string;
  readonly facilityType: string;
  readonly requestedAmount: string;
  readonly currency: string;
  readonly loanPurpose: string;
  readonly tenureMonths: string;
  readonly loanProduct: string;
  readonly interestRateType: string;
  readonly spreadRate: string;
  readonly guarantorGrid: string;
  readonly guarantorName: string;       // child of guarantorGrid
  readonly nationalIdDocument: string;
  readonly declarationAgreement: string;
  readonly declarationNotes: string;
}

// Option set integer codes from phase-4-crm.md
const FIELD_TYPE = {
  text: 100000001,
  textarea: 100000002,
  number: 100000003,
  date: 100000004,
  dropdown: 100000006,
  multiselect: 100000007,
  lookup: 100000008,
  checkbox: 100000009,
  radio: 100000010,
  currency: 100000011,
  decimal: 100000012,
  email: 100000013,
  phone: 100000014,
  file: 100000015,
  repeatingGrid: 100000016,
  richText: 100000017,
} as const;

const COLUMN_SPAN = {
  one: 100000001,
  two: 100000002,
  full: 100000004,
} as const;

async function seedFields(sectionIds: SectionIds): Promise<FieldIds> {
  logSection('Form Fields');

  type FieldPayload = {
    key: keyof FieldIds;
    sectionKey: keyof SectionIds;
    fieldType: number;
    schemaName: string;
    label: string;
    displayOrder: number;
    columnSpan: number;
    isRequired: boolean;
    isReadonly?: boolean;
    isHidden?: boolean;
    placeholder?: string;
    tooltip?: string;
    defaultValue?: string;
    currencyCode?: string;
    decimalPlaces?: number;
    maxRows?: number;
    parentFieldKey?: keyof FieldIds;
  };

  const fieldDefs: FieldPayload[] = [
    // ── Customer Type section ─────────────────────────────────────────────
    {
      key: 'customerType',
      sectionKey: 'customerType',
      fieldType: FIELD_TYPE.radio,
      schemaName: 'customerType',
      label: 'Customer Type',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.full,
      isRequired: true,
      tooltip: 'Select Individual if you are applying as a personal customer.',
    },

    // ── Personal Details section ───────────────────────────────────────────
    {
      key: 'fullName',
      sectionKey: 'personalDetails',
      fieldType: FIELD_TYPE.text,
      schemaName: 'fullName',
      label: 'Full Name',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.two,
      isRequired: true,
      placeholder: 'As per your national ID',
    },
    {
      key: 'nationalId',
      sectionKey: 'personalDetails',
      fieldType: FIELD_TYPE.text,
      schemaName: 'nationalId',
      label: 'National ID Number',
      displayOrder: 20,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
      placeholder: '11 digits',
      tooltip: 'Your Qatar National ID or Resident ID number.',
    },
    {
      key: 'dateOfBirth',
      sectionKey: 'personalDetails',
      fieldType: FIELD_TYPE.date,
      schemaName: 'dateOfBirth',
      label: 'Date of Birth',
      displayOrder: 30,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
    },

    // ── Contact Details section ────────────────────────────────────────────
    {
      key: 'emailAddress',
      sectionKey: 'contactDetails',
      fieldType: FIELD_TYPE.email,
      schemaName: 'emailAddress',
      label: 'Email Address',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
      placeholder: 'you@example.com',
    },
    {
      key: 'mobileNumber',
      sectionKey: 'contactDetails',
      fieldType: FIELD_TYPE.phone,
      schemaName: 'mobileNumber',
      label: 'Mobile Number',
      displayOrder: 20,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
      placeholder: '+974 XXXX XXXX',
    },
    {
      key: 'residentialAddress',
      sectionKey: 'contactDetails',
      fieldType: FIELD_TYPE.textarea,
      schemaName: 'residentialAddress',
      label: 'Residential Address',
      displayOrder: 30,
      columnSpan: COLUMN_SPAN.two,
      isRequired: false,
      placeholder: 'Street, Area, City',
    },

    // ── Corporate Details section (hidden by default — shown for Corporate) ──
    {
      key: 'companyName',
      sectionKey: 'corporateDetails',
      fieldType: FIELD_TYPE.text,
      schemaName: 'companyName',
      label: 'Company Name',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.one,
      isRequired: false, // required state is set by business rule for Corporate
      isHidden: true,    // hidden by default; business rule reveals for Corporate
    },
    {
      key: 'commercialRegistrationNumber',
      sectionKey: 'corporateDetails',
      fieldType: FIELD_TYPE.text,
      schemaName: 'commercialRegistrationNumber',
      label: 'Commercial Registration Number',
      displayOrder: 20,
      columnSpan: COLUMN_SPAN.one,
      isRequired: false,
      isHidden: true,
      placeholder: 'CR Number',
    },

    // ── Facility Request section ───────────────────────────────────────────
    {
      key: 'facilityType',
      sectionKey: 'facilityRequest',
      fieldType: FIELD_TYPE.dropdown,
      schemaName: 'facilityType',
      label: 'Facility Type',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
    },
    {
      key: 'requestedAmount',
      sectionKey: 'facilityRequest',
      fieldType: FIELD_TYPE.currency,
      schemaName: 'requestedAmount',
      label: 'Requested Amount',
      displayOrder: 20,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
      currencyCode: 'QAR',
      decimalPlaces: 2,
      placeholder: '0.00',
      tooltip: 'Enter the total amount you are requesting in Qatari Riyals.',
    },
    {
      key: 'currency',
      sectionKey: 'facilityRequest',
      fieldType: FIELD_TYPE.dropdown,
      schemaName: 'currency',
      label: 'Currency',
      displayOrder: 30,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
      defaultValue: 'QAR',
    },
    {
      key: 'loanPurpose',
      sectionKey: 'facilityRequest',
      fieldType: FIELD_TYPE.multiselect,
      schemaName: 'loanPurpose',
      label: 'Loan Purpose',
      displayOrder: 40,
      columnSpan: COLUMN_SPAN.two,
      isRequired: true,
      tooltip: 'Select all purposes that apply to this facility request.',
    },

    // ── Repayment Details section ──────────────────────────────────────────
    {
      key: 'tenureMonths',
      sectionKey: 'repaymentDetails',
      fieldType: FIELD_TYPE.number,
      schemaName: 'tenureMonths',
      label: 'Tenure (Months)',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
      placeholder: 'e.g. 60',
      tooltip: 'Maximum tenure is limited by the selected product type.',
    },

    // ── Product Selection section ──────────────────────────────────────────
    {
      key: 'loanProduct',
      sectionKey: 'productSelection',
      fieldType: FIELD_TYPE.lookup,
      schemaName: 'loanProduct',
      label: 'Loan Product',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.full,
      isRequired: true,
      placeholder: 'Type at least 3 characters to search...',
    },

    // ── Interest Rate section ──────────────────────────────────────────────
    {
      key: 'interestRateType',
      sectionKey: 'interestRate',
      fieldType: FIELD_TYPE.radio,
      schemaName: 'interestRateType',
      label: 'Interest Rate Type',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
    },
    {
      key: 'spreadRate',
      sectionKey: 'interestRate',
      fieldType: FIELD_TYPE.decimal,
      schemaName: 'spreadRate',
      label: 'Spread Rate (%)',
      displayOrder: 20,
      columnSpan: COLUMN_SPAN.one,
      isRequired: false,
      decimalPlaces: 3,
      placeholder: '0.000',
      tooltip: 'Annual spread over QIBOR. Applicable for variable rate only.',
    },

    // ── Guarantor repeating grid ───────────────────────────────────────────
    {
      key: 'guarantorGrid',
      sectionKey: 'repaymentDetails',
      fieldType: FIELD_TYPE.repeatingGrid,
      schemaName: 'guarantors',
      label: 'Guarantors',
      displayOrder: 20,
      columnSpan: COLUMN_SPAN.two,
      isRequired: false,
      maxRows: 5,
      tooltip: 'Add guarantors if required by the selected product.',
    },
    {
      key: 'guarantorName',
      sectionKey: 'repaymentDetails', // child field — section is overridden by parentFieldKey
      fieldType: FIELD_TYPE.text,
      schemaName: 'guarantorName',
      label: 'Guarantor Name',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.one,
      isRequired: true,
      parentFieldKey: 'guarantorGrid',
    },

    // ── Documents section ─────────────────────────────────────────────────
    {
      key: 'nationalIdDocument',
      sectionKey: 'requiredDocuments',
      fieldType: FIELD_TYPE.file,
      schemaName: 'nationalIdDocument',
      label: 'National ID / Resident ID',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.full,
      isRequired: true,
      tooltip: 'Upload a clear copy of both sides. Accepted: PDF, JPEG, PNG. Max 10 MB.',
    },

    // ── Declaration section ───────────────────────────────────────────────
    {
      key: 'declarationAgreement',
      sectionKey: 'declarationStatement',
      fieldType: FIELD_TYPE.checkbox,
      schemaName: 'declarationAgreement',
      label:
        'I confirm that all information provided in this application is true and accurate to the best of my knowledge.',
      displayOrder: 10,
      columnSpan: COLUMN_SPAN.full,
      isRequired: true,
    },
    {
      key: 'declarationNotes',
      sectionKey: 'declarationStatement',
      fieldType: FIELD_TYPE.richText,
      schemaName: 'declarationNotes',
      label: 'Additional Notes',
      displayOrder: 20,
      columnSpan: COLUMN_SPAN.full,
      isRequired: false,
      placeholder: 'Any additional comments or clarifications...',
    },
  ];

  const ids: Partial<Record<keyof FieldIds, string>> = {};

  for (const field of fieldDefs) {
    const sectionRef = buildLookupReference('qdb_form_sections', sectionIds[field.sectionKey]);

    const payload: Record<string, unknown> = {
      'qdb_form_section_id@odata.bind': sectionRef,
      qdb_field_type: field.fieldType,
      qdb_schema_name: field.schemaName,
      qdb_label: field.label,
      qdb_display_order: field.displayOrder,
      qdb_column_span: field.columnSpan,
      qdb_is_required: field.isRequired,
      qdb_is_readonly: field.isReadonly ?? false,
      qdb_is_hidden: field.isHidden ?? false,
    };

    if (field.placeholder !== undefined) payload['qdb_placeholder'] = field.placeholder;
    if (field.tooltip !== undefined) payload['qdb_tooltip'] = field.tooltip;
    if (field.defaultValue !== undefined) payload['qdb_default_value'] = field.defaultValue;
    if (field.currencyCode !== undefined) payload['qdb_currency_code'] = field.currencyCode;
    if (field.decimalPlaces !== undefined) payload['qdb_decimal_places'] = field.decimalPlaces;
    if (field.maxRows !== undefined) payload['qdb_max_rows'] = field.maxRows;

    if (field.parentFieldKey !== undefined) {
      const parentId = ids[field.parentFieldKey];
      if (!parentId) {
        throw new Error(
          `Parent field '${field.parentFieldKey}' must be seeded before child '${field.key}'`,
        );
      }
      payload['qdb_parent_field_id@odata.bind'] = buildLookupReference(
        'qdb_form_fields',
        parentId,
      );
    }

    const record = await postRecord('qdb_form_fields', payload);
    ids[field.key] = record.id;
    logCreated('qdb_form_fields', field.label, record.id);
  }

  return ids as FieldIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — Option Values
// ─────────────────────────────────────────────────────────────────────────────

async function seedOptionValues(fieldIds: FieldIds): Promise<void> {
  logSection('Option Values');

  type OptionDef = {
    value: string;
    label: string;
    displayOrder: number;
    isDefault: boolean;
    parentOptionValue?: string;
  };

  type FieldOptions = {
    fieldKey: keyof FieldIds;
    options: OptionDef[];
  };

  const allOptions: FieldOptions[] = [
    // Customer Type — radio
    {
      fieldKey: 'customerType',
      options: [
        { value: 'individual', label: 'Individual', displayOrder: 10, isDefault: true },
        { value: 'corporate', label: 'Corporate', displayOrder: 20, isDefault: false },
      ],
    },

    // Facility Type — dropdown
    {
      fieldKey: 'facilityType',
      options: [
        { value: 'home_finance', label: 'Home Finance', displayOrder: 10, isDefault: false },
        { value: 'personal_loan', label: 'Personal Loan', displayOrder: 20, isDefault: false },
        { value: 'auto_loan', label: 'Auto Loan', displayOrder: 30, isDefault: false },
        { value: 'sme_finance', label: 'SME Finance', displayOrder: 40, isDefault: false },
        { value: 'working_capital', label: 'Working Capital', displayOrder: 50, isDefault: false },
      ],
    },

    // Interest Rate Type — radio
    {
      fieldKey: 'interestRateType',
      options: [
        { value: 'fixed', label: 'Fixed Rate', displayOrder: 10, isDefault: true },
        { value: 'variable', label: 'Variable Rate (QIBOR + Spread)', displayOrder: 20, isDefault: false },
      ],
    },

    // Currency — dropdown
    {
      fieldKey: 'currency',
      options: [
        { value: 'QAR', label: 'Qatari Riyal (QAR)', displayOrder: 10, isDefault: true },
        { value: 'USD', label: 'US Dollar (USD)', displayOrder: 20, isDefault: false },
        { value: 'EUR', label: 'Euro (EUR)', displayOrder: 30, isDefault: false },
      ],
    },

    // Loan Purpose — multiselect
    {
      fieldKey: 'loanPurpose',
      options: [
        { value: 'construction', label: 'Construction / Renovation', displayOrder: 10, isDefault: false },
        { value: 'purchase', label: 'Property Purchase', displayOrder: 20, isDefault: false },
        { value: 'vehicle', label: 'Vehicle Purchase', displayOrder: 30, isDefault: false },
        { value: 'education', label: 'Education', displayOrder: 40, isDefault: false },
        { value: 'medical', label: 'Medical', displayOrder: 50, isDefault: false },
        { value: 'business_expansion', label: 'Business Expansion', displayOrder: 60, isDefault: false },
        { value: 'working_capital_purpose', label: 'Working Capital', displayOrder: 70, isDefault: false },
        { value: 'other', label: 'Other', displayOrder: 80, isDefault: false },
      ],
    },
  ];

  for (const { fieldKey, options } of allOptions) {
    const fieldRef = buildLookupReference('qdb_form_fields', fieldIds[fieldKey]);
    for (const option of options) {
      const payload: Record<string, unknown> = {
        'qdb_form_field_id@odata.bind': fieldRef,
        qdb_value: option.value,
        qdb_label: option.label,
        qdb_display_order: option.displayOrder,
        qdb_is_default: option.isDefault,
        qdb_is_active: true,
      };
      if (option.parentOptionValue !== undefined) {
        payload['qdb_parent_option_value'] = option.parentOptionValue;
      }
      const record = await postRecord('qdb_form_option_values', payload);
      logCreated('qdb_form_option_values', `${fieldKey} / ${option.label}`, record.id);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — Lookup Config (Loan Product)
// ─────────────────────────────────────────────────────────────────────────────

async function seedLookupConfig(fieldIds: FieldIds): Promise<void> {
  logSection('Lookup Config');

  const fieldRef = buildLookupReference('qdb_form_fields', fieldIds.loanProduct);

  const record = await postRecord('qdb_form_lookup_configs', {
    'qdb_form_field_id@odata.bind': fieldRef,
    qdb_entity_logical_name: 'product',      // standard Dataverse product entity
    qdb_display_attribute: 'name',
    qdb_value_attribute: 'productid',
    qdb_filter_expression: "statecode eq 0 and producttypecode eq 1",
    qdb_search_min_chars: 3,
    qdb_max_results: 10,
    // No depends_on_field for product lookup — results filtered by static expression only
  });

  logCreated('qdb_form_lookup_configs', 'Loan Product lookup', record.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — Validation Rules (~5)
// ─────────────────────────────────────────────────────────────────────────────

async function seedValidationRules(fieldIds: FieldIds): Promise<void> {
  logSection('Validation Rules');

  type ValidationRuleDef = {
    label: string;
    fieldKey: keyof FieldIds;
    ruleType: number;
    errorMessage: string;
    priority: number;
    minLength?: number;
    maxLength?: number;
    minValue?: number;
    regexPattern?: string;
  };

  // Rule type option set values from phase-4-crm.md
  const RULE_TYPE = {
    required: 100000001,
    minLength: 100000002,
    maxLength: 100000003,
    minValue: 100000004,
    regex: 100000006,
    email: 100000007,
    phone: 100000008,
  } as const;

  const rules: ValidationRuleDef[] = [
    {
      label: 'Full Name — required',
      fieldKey: 'fullName',
      ruleType: RULE_TYPE.required,
      errorMessage: 'Full name is required.',
      priority: 10,
    },
    {
      label: 'Email — format',
      fieldKey: 'emailAddress',
      ruleType: RULE_TYPE.email,
      errorMessage: 'Please enter a valid email address.',
      priority: 20,
    },
    {
      label: 'Mobile — format',
      fieldKey: 'mobileNumber',
      ruleType: RULE_TYPE.phone,
      errorMessage: 'Please enter a valid international mobile number (e.g. +974 5000 0000).',
      priority: 20,
    },
    {
      label: 'Requested Amount — minimum QAR 10,000',
      fieldKey: 'requestedAmount',
      ruleType: RULE_TYPE.minValue,
      errorMessage: 'The minimum loan amount is QAR 10,000.',
      priority: 10,
      minValue: 10000,
    },
    {
      label: 'National ID — 11-digit format',
      fieldKey: 'nationalId',
      ruleType: RULE_TYPE.regex,
      errorMessage: 'National ID must be exactly 11 digits.',
      priority: 10,
      regexPattern: '^[0-9]{11}$',
    },
  ];

  for (const rule of rules) {
    const fieldRef = buildLookupReference('qdb_form_fields', fieldIds[rule.fieldKey]);
    const payload: Record<string, unknown> = {
      'qdb_form_field_id@odata.bind': fieldRef,
      qdb_rule_type: rule.ruleType,
      qdb_error_message: rule.errorMessage,
      qdb_priority: rule.priority,
      qdb_is_active: true,
    };
    if (rule.minLength !== undefined) payload['qdb_min_length'] = rule.minLength;
    if (rule.maxLength !== undefined) payload['qdb_max_length'] = rule.maxLength;
    if (rule.minValue !== undefined) payload['qdb_min_value'] = rule.minValue;
    if (rule.regexPattern !== undefined) payload['qdb_regex_pattern'] = rule.regexPattern;

    const record = await postRecord('qdb_form_validation_rules', payload);
    logCreated('qdb_form_validation_rules', rule.label, record.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — Business Rules (3)
// ─────────────────────────────────────────────────────────────────────────────

async function seedBusinessRules(
  formDefinitionId: string,
  fieldIds: FieldIds,
  sectionIds: SectionIds,
): Promise<void> {
  logSection('Business Rules');

  const formRef = buildLookupReference('qdb_form_definitions', formDefinitionId);

  // ACTION option set values from phase-4-crm.md
  const ACTION = {
    showField: 100000001,
    hideField: 100000002,
    showSection: 100000003,
    hideSection: 100000004,
    makeRequired: 100000007,
    makeOptional: 100000008,
    setValue: 100000011,
  } as const;

  const CONDITIONS_LOGIC = {
    AND: 100000000,
    OR: 100000001,
  } as const;

  // Rule 1: When Customer Type = Corporate → show Corporate Details section
  //         and make Company Name required
  const ruleCorporateShowSection = await postRecord('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': formRef,
    qdb_name: 'Corporate Customer — Show Corporate Details Section',
    qdb_description:
      'When the applicant selects Corporate as their customer type, ' +
      'the Corporate Details section becomes visible.',
    qdb_conditions_json: JSON.stringify([
      {
        fieldId: fieldIds.customerType,
        operator: 'equals',
        value: 'corporate',
      },
    ]),
    qdb_conditions_logic: CONDITIONS_LOGIC.AND,
    qdb_action: ACTION.showSection,
    'qdb_target_section_id@odata.bind': buildLookupReference(
      'qdb_form_sections',
      sectionIds.corporateDetails,
    ),
    qdb_priority: 10,
    qdb_is_active: true,
  });
  logCreated('qdb_form_business_rules', 'Corporate — show Corporate Details section', ruleCorporateShowSection.id);

  // Rule 2: When Customer Type = Individual → hide Corporate Details section
  const ruleIndividualHideSection = await postRecord('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': formRef,
    qdb_name: 'Individual Customer — Hide Corporate Details Section',
    qdb_description:
      'When the applicant selects Individual, the Corporate Details section is hidden ' +
      'and all its fields are cleared before submission.',
    qdb_conditions_json: JSON.stringify([
      {
        fieldId: fieldIds.customerType,
        operator: 'equals',
        value: 'individual',
      },
    ]),
    qdb_conditions_logic: CONDITIONS_LOGIC.AND,
    qdb_action: ACTION.hideSection,
    'qdb_target_section_id@odata.bind': buildLookupReference(
      'qdb_form_sections',
      sectionIds.corporateDetails,
    ),
    qdb_priority: 20,
    qdb_is_active: true,
  });
  logCreated('qdb_form_business_rules', 'Individual — hide Corporate Details section', ruleIndividualHideSection.id);

  // Rule 3: When Facility Type = Home Finance → set Tenure max constraint
  //         by setting a read-only default tenure of 300 months (25 years)
  const ruleHomeFinanceTenure = await postRecord('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': formRef,
    qdb_name: 'Home Finance — Set Default Tenure 300 Months',
    qdb_description:
      'When the applicant selects Home Finance, the tenure field is pre-populated ' +
      'with the maximum allowed tenure of 300 months. The user may reduce this.',
    qdb_conditions_json: JSON.stringify([
      {
        fieldId: fieldIds.facilityType,
        operator: 'equals',
        value: 'home_finance',
      },
    ]),
    qdb_conditions_logic: CONDITIONS_LOGIC.AND,
    qdb_action: ACTION.setValue,
    'qdb_target_field_id@odata.bind': buildLookupReference(
      'qdb_form_fields',
      fieldIds.tenureMonths,
    ),
    qdb_action_value: '300',
    qdb_priority: 30,
    qdb_is_active: true,
  });
  logCreated('qdb_form_business_rules', 'Home Finance — set tenure 300', ruleHomeFinanceTenure.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — Submission Mappings
// ─────────────────────────────────────────────────────────────────────────────

async function seedSubmissionMappings(
  formDefinitionId: string,
  fieldIds: FieldIds,
): Promise<void> {
  logSection('Submission Mappings');

  const formRef = buildLookupReference('qdb_form_definitions', formDefinitionId);

  type MappingDef = {
    label: string;
    fieldKey: keyof FieldIds;
    targetEntity: string;
    targetAttribute: string;
    isChildEntity: boolean;
    childRelationshipName?: string;
    transformExpression?: string;
  };

  const mappings: MappingDef[] = [
    // Contact entity — parent record
    {
      label: 'Customer Full Name → contact.firstname',
      fieldKey: 'fullName',
      targetEntity: 'contact',
      targetAttribute: 'firstname',
      isChildEntity: false,
    },
    {
      label: 'Email Address → contact.emailaddress1',
      fieldKey: 'emailAddress',
      targetEntity: 'contact',
      targetAttribute: 'emailaddress1',
      isChildEntity: false,
    },
    {
      label: 'Mobile Number → contact.mobilephone',
      fieldKey: 'mobileNumber',
      targetEntity: 'contact',
      targetAttribute: 'mobilephone',
      isChildEntity: false,
    },

    // Opportunity entity — linked to contact via customerid relationship
    {
      label: 'Requested Amount → opportunity.budgetamount',
      fieldKey: 'requestedAmount',
      targetEntity: 'opportunity',
      targetAttribute: 'budgetamount',
      isChildEntity: true,
      childRelationshipName: 'opportunity_customer_accounts',
    },
    {
      label: 'Facility Type → opportunity.description',
      fieldKey: 'facilityType',
      targetEntity: 'opportunity',
      targetAttribute: 'description',
      isChildEntity: true,
      childRelationshipName: 'opportunity_customer_accounts',
    },
  ];

  for (const mapping of mappings) {
    const fieldRef = buildLookupReference('qdb_form_fields', fieldIds[mapping.fieldKey]);
    const payload: Record<string, unknown> = {
      'qdb_form_definition_id@odata.bind': formRef,
      'qdb_form_field_id@odata.bind': fieldRef,
      qdb_target_entity_logical_name: mapping.targetEntity,
      qdb_target_attribute_logical_name: mapping.targetAttribute,
      qdb_is_child_entity: mapping.isChildEntity,
      qdb_is_active: true,
    };
    if (mapping.childRelationshipName !== undefined) {
      payload['qdb_child_entity_relationship_name'] = mapping.childRelationshipName;
    }
    if (mapping.transformExpression !== undefined) {
      payload['qdb_transform_expression'] = mapping.transformExpression;
    }

    const record = await postRecord('qdb_form_submission_mappings', payload);
    logCreated('qdb_form_submission_mappings', mapping.label, record.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('QDB Dynamic Form Engine — Dataverse Seed Script');
  console.log('================================================');
  console.log(`Environment : ${process.env['DATAVERSE_URL'] ?? '(not set)'}`);
  console.log(`Solution    : ${SOLUTION_UNIQUE_NAME}`);
  console.log(`Date        : ${new Date().toISOString()}`);

  assertEnvironmentVariables();

  const formDefinitionId = await seedFormDefinition();
  const tabIds = await seedTabs(formDefinitionId);
  const sectionIds = await seedSections(tabIds);
  const fieldIds = await seedFields(sectionIds);

  await seedOptionValues(fieldIds);
  await seedLookupConfig(fieldIds);
  await seedValidationRules(fieldIds);
  await seedBusinessRules(formDefinitionId, fieldIds, sectionIds);
  await seedSubmissionMappings(formDefinitionId, fieldIds);

  console.log('\n================================================');
  console.log('Seed completed successfully.');
  console.log(`Form Definition ID : ${formDefinitionId}`);
  console.log('================================================');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n[FATAL] Seed script failed: ${message}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
