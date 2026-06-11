import type {
  FormDefinition,
  FormSummary,
  DraftSubmission,
  LookupResult,
  OptionValue,
  DesignPayload,
  ThemeDefinition,
} from '@qdb/shared';

// â”€â”€ Sample Loan Application form definition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Used when MOCK_CRM=true. Covers all 17 field types.

export const MOCK_LOAN_APPLICATION: FormDefinition = {
  id: 'fd-loan-application-001',
  formCode: 'loan-application',
  title: 'Loan Application',
  description: 'Apply for a commercial loan facility with QDB.',
  status: 'active',
  version: 1,
  allowSaveDraft: true,
  draftExpiryDays: 90,
  powerAutomateFlowId: undefined,
  confirmationMessage:
    'Your loan application has been submitted successfully. Our team will contact you within 2 business days.',
  confirmationRecordRefAttribute: 'ticketnumber',
  accessGroupId: undefined,
  submissionMappings: [
    {
      id: 'sm-001',
      formDefinitionId: 'fd-loan-application-001',
      fieldId: 'fld-full-name',
      targetEntityLogicalName: 'contact',
      targetAttributeLogicalName: 'fullname',
      isMappedToChildEntity: false,
      isActive: true,
    },
    {
      id: 'sm-002',
      formDefinitionId: 'fd-loan-application-001',
      fieldId: 'fld-email',
      targetEntityLogicalName: 'contact',
      targetAttributeLogicalName: 'emailaddress1',
      isMappedToChildEntity: false,
      isActive: true,
    },
    {
      id: 'sm-003',
      formDefinitionId: 'fd-loan-application-001',
      fieldId: 'fld-amount',
      targetEntityLogicalName: 'opportunity',
      targetAttributeLogicalName: 'budgetamount',
      isMappedToChildEntity: true,
      childEntityRelationshipName: 'opportunity_customer_contacts',
      isActive: true,
    },
  ],
  tabs: [
    {
      id: 'tab-customer',
      formDefinitionId: 'fd-loan-application-001',
      label: 'Customer Information',
      iconName: 'Contact',
      displayOrder: 1,
      isVisible: true,
      requiresPreviousTabComplete: false,
      sections: [
        {
          id: 'sec-customer-type',
          tabId: 'tab-customer',
          label: 'Customer Details',
          displayOrder: 1,
          columns: 2,
          isCollapsible: false,
          isCollapsedByDefault: false,
          isVisible: true,
          fields: [
            {
              id: 'fld-customer-type',
              sectionId: 'sec-customer-type',
              fieldType: 'dropdown',
              schemaName: 'qdb_customer_type',
              label: 'Customer Type',
              placeholder: 'Select customer type',
              displayOrder: 1,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              options: [
                { value: 'Individual', label: 'Individual', displayOrder: 1, isDefault: true, isActive: true },
                { value: 'Corporate', label: 'Corporate', displayOrder: 2, isDefault: false, isActive: true },
                { value: 'SME', label: 'SME', displayOrder: 3, isDefault: false, isActive: true },
              ],
              validationRules: [
                { id: 'vr-001', fieldId: 'fld-customer-type', ruleType: 'required', errorMessage: 'Customer type is required.', isActive: true, priority: 1 },
              ],
              businessRules: [
                {
                  id: 'br-001',
                  name: 'Show CR Number for Corporate',
                  conditions: [{ fieldId: 'qdb_customer_type', operator: 'equals', value: 'Corporate' }],
                  conditionsLogic: 'AND',
                  action: 'showField',
                  targetFieldId: 'fld-cr-number',
                  priority: 1,
                  isActive: true,
                },
                {
                  id: 'br-002',
                  name: 'Make CR Number required for Corporate',
                  conditions: [{ fieldId: 'qdb_customer_type', operator: 'equals', value: 'Corporate' }],
                  conditionsLogic: 'AND',
                  action: 'makeRequired',
                  targetFieldId: 'fld-cr-number',
                  priority: 2,
                  isActive: true,
                },
                {
                  id: 'br-003',
                  name: 'Hide CR Number for Individual',
                  conditions: [{ fieldId: 'qdb_customer_type', operator: 'notEquals', value: 'Corporate' }],
                  conditionsLogic: 'AND',
                  action: 'hideField',
                  targetFieldId: 'fld-cr-number',
                  priority: 3,
                  isActive: true,
                },
              ],
            },
            {
              id: 'fld-full-name',
              sectionId: 'sec-customer-type',
              fieldType: 'text',
              schemaName: 'qdb_full_name',
              label: 'Full Name',
              placeholder: 'Enter full legal name',
              displayOrder: 2,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              validationRules: [
                { id: 'vr-002', fieldId: 'fld-full-name', ruleType: 'required', errorMessage: 'Full name is required.', isActive: true, priority: 1 },
                { id: 'vr-003', fieldId: 'fld-full-name', ruleType: 'maxLength', maxLength: 250, errorMessage: 'Name must not exceed 250 characters.', isActive: true, priority: 2 },
              ],
              businessRules: [],
            },
            {
              id: 'fld-cr-number',
              sectionId: 'sec-customer-type',
              fieldType: 'text',
              schemaName: 'qdb_cr_number',
              label: 'Commercial Registration Number',
              placeholder: 'Enter CR number',
              displayOrder: 3,
              columnSpan: 1,
              isRequired: false,
              isReadonly: false,
              isHidden: true,
              isVisible: false,
              validationRules: [],
              businessRules: [],
            },
            {
              id: 'fld-email',
              sectionId: 'sec-customer-type',
              fieldType: 'email',
              schemaName: 'qdb_email',
              label: 'Email Address',
              placeholder: 'your@email.com',
              displayOrder: 4,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              validationRules: [
                { id: 'vr-004', fieldId: 'fld-email', ruleType: 'required', errorMessage: 'Email is required.', isActive: true, priority: 1 },
                { id: 'vr-005', fieldId: 'fld-email', ruleType: 'email', errorMessage: 'Enter a valid email address.', isActive: true, priority: 2 },
              ],
              businessRules: [],
            },
            {
              id: 'fld-phone',
              sectionId: 'sec-customer-type',
              fieldType: 'phone',
              schemaName: 'qdb_phone',
              label: 'Phone Number',
              placeholder: '+974 XXXX XXXX',
              displayOrder: 5,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              validationRules: [
                { id: 'vr-006', fieldId: 'fld-phone', ruleType: 'required', errorMessage: 'Phone number is required.', isActive: true, priority: 1 },
                { id: 'vr-007', fieldId: 'fld-phone', ruleType: 'phone', errorMessage: 'Enter a valid phone number.', isActive: true, priority: 2 },
              ],
              businessRules: [],
            },
            {
              id: 'fld-dob',
              sectionId: 'sec-customer-type',
              fieldType: 'date',
              schemaName: 'qdb_date_of_birth',
              label: 'Date of Birth',
              displayOrder: 6,
              columnSpan: 1,
              isRequired: false,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              validationRules: [],
              businessRules: [],
            },
          ],
        },
      ],
    },
    {
      id: 'tab-facility',
      formDefinitionId: 'fd-loan-application-001',
      label: 'Facility Details',
      iconName: 'Money',
      displayOrder: 2,
      isVisible: true,
      requiresPreviousTabComplete: false,
      sections: [
        {
          id: 'sec-facility',
          tabId: 'tab-facility',
          label: 'Facility Information',
          displayOrder: 1,
          columns: 2,
          isCollapsible: false,
          isCollapsedByDefault: false,
          isVisible: true,
          fields: [
            {
              id: 'fld-facility-type',
              sectionId: 'sec-facility',
              fieldType: 'dropdown',
              schemaName: 'qdb_facility_type',
              label: 'Facility Type',
              placeholder: 'Select facility type',
              displayOrder: 1,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              options: [
                { value: 'HomFinance', label: 'Home Finance', displayOrder: 1, isDefault: false, isActive: true },
                { value: 'CommercialFinance', label: 'Commercial Finance', displayOrder: 2, isDefault: false, isActive: true },
                { value: 'VehicleFinance', label: 'Vehicle Finance', displayOrder: 3, isDefault: false, isActive: true },
                { value: 'PersonalFinance', label: 'Personal Finance', displayOrder: 4, isDefault: false, isActive: true },
              ],
              validationRules: [
                { id: 'vr-008', fieldId: 'fld-facility-type', ruleType: 'required', errorMessage: 'Facility type is required.', isActive: true, priority: 1 },
              ],
              businessRules: [],
            },
            {
              id: 'fld-amount',
              sectionId: 'sec-facility',
              fieldType: 'currency',
              schemaName: 'qdb_requested_amount',
              label: 'Requested Amount (QAR)',
              displayOrder: 2,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              currencyCode: 'QAR',
              decimalPlaces: 2,
              validationRules: [
                { id: 'vr-009', fieldId: 'fld-amount', ruleType: 'required', errorMessage: 'Requested amount is required.', isActive: true, priority: 1 },
                { id: 'vr-010', fieldId: 'fld-amount', ruleType: 'minValue', minValue: 10000, errorMessage: 'Minimum amount is QAR 10,000.', isActive: true, priority: 2 },
              ],
              businessRules: [],
            },
            {
              id: 'fld-tenure',
              sectionId: 'sec-facility',
              fieldType: 'number',
              schemaName: 'qdb_tenure_months',
              label: 'Tenure (months)',
              displayOrder: 3,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              validationRules: [
                { id: 'vr-011', fieldId: 'fld-tenure', ruleType: 'required', errorMessage: 'Tenure is required.', isActive: true, priority: 1 },
                { id: 'vr-012', fieldId: 'fld-tenure', ruleType: 'minValue', minValue: 1, errorMessage: 'Minimum tenure is 1 month.', isActive: true, priority: 2 },
                { id: 'vr-013', fieldId: 'fld-tenure', ruleType: 'maxValue', maxValue: 360, errorMessage: 'Maximum tenure is 360 months.', isActive: true, priority: 3 },
              ],
              businessRules: [],
            },
            {
              id: 'fld-purpose',
              sectionId: 'sec-facility',
              fieldType: 'textarea',
              schemaName: 'qdb_purpose',
              label: 'Purpose of Financing',
              placeholder: 'Describe the purpose of the financing request',
              displayOrder: 4,
              columnSpan: 2,
              isRequired: false,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              validationRules: [
                { id: 'vr-014', fieldId: 'fld-purpose', ruleType: 'maxLength', maxLength: 2000, errorMessage: 'Purpose must not exceed 2,000 characters.', isActive: true, priority: 1 },
              ],
              businessRules: [],
            },
          ],
        },
      ],
    },
    {
      id: 'tab-product',
      formDefinitionId: 'fd-loan-application-001',
      label: 'Product Details',
      iconName: 'Product',
      displayOrder: 3,
      isVisible: true,
      requiresPreviousTabComplete: false,
      sections: [
        {
          id: 'sec-product',
          tabId: 'tab-product',
          label: 'Product Selection',
          displayOrder: 1,
          columns: 2,
          isCollapsible: false,
          isCollapsedByDefault: false,
          isVisible: true,
          fields: [
            {
              id: 'fld-product',
              sectionId: 'sec-product',
              fieldType: 'lookup',
              schemaName: 'qdb_product_id',
              label: 'Product',
              placeholder: 'Search for a product...',
              displayOrder: 1,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              lookupConfig: {
                id: 'lc-001',
                entityLogicalName: 'qdb_product',
                displayAttribute: 'qdb_name',
                valueAttribute: 'qdb_productid',
                searchMinChars: 2,
                maxResults: 10,
              },
              validationRules: [
                { id: 'vr-015', fieldId: 'fld-product', ruleType: 'required', errorMessage: 'Product selection is required.', isActive: true, priority: 1 },
              ],
              businessRules: [],
            },
            {
              id: 'fld-interest-type',
              sectionId: 'sec-product',
              fieldType: 'radio',
              schemaName: 'qdb_interest_rate_type',
              label: 'Interest Rate Type',
              displayOrder: 2,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              options: [
                { value: 'Fixed', label: 'Fixed Rate', displayOrder: 1, isDefault: true, isActive: true },
                { value: 'Variable', label: 'Variable Rate', displayOrder: 2, isDefault: false, isActive: true },
              ],
              validationRules: [],
              businessRules: [],
            },
          ],
        },
      ],
    },
    {
      id: 'tab-documents',
      formDefinitionId: 'fd-loan-application-001',
      label: 'Documents',
      iconName: 'Attach',
      displayOrder: 4,
      isVisible: true,
      requiresPreviousTabComplete: false,
      sections: [
        {
          id: 'sec-docs',
          tabId: 'tab-documents',
          label: 'Required Documents',
          displayOrder: 1,
          columns: 1,
          isCollapsible: false,
          isCollapsedByDefault: false,
          isVisible: true,
          fields: [
            {
              id: 'fld-id-document',
              sectionId: 'sec-docs',
              fieldType: 'file',
              schemaName: 'qdb_id_document',
              label: 'ID Document',
              displayOrder: 1,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              fileUploadConfig: {
                id: 'fu-001',
                fieldId: 'fld-id-document',
                allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
                maxFileSizeBytes: 5 * 1024 * 1024,
                destination: 'crmNotes',
                maxFiles: 1,
              },
              validationRules: [
                { id: 'vr-016', fieldId: 'fld-id-document', ruleType: 'required', errorMessage: 'ID document is required.', isActive: true, priority: 1 },
              ],
              businessRules: [],
            },
            {
              id: 'fld-financial-statements',
              sectionId: 'sec-docs',
              fieldType: 'file',
              schemaName: 'qdb_financial_statements',
              label: 'Financial Statements',
              displayOrder: 2,
              columnSpan: 1,
              isRequired: false,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              fileUploadConfig: {
                id: 'fu-002',
                fieldId: 'fld-financial-statements',
                allowedMimeTypes: ['application/pdf'],
                maxFileSizeBytes: 10 * 1024 * 1024,
                destination: 'crmNotes',
                maxFiles: 3,
              },
              validationRules: [],
              businessRules: [],
            },
          ],
        },
      ],
    },
    {
      id: 'tab-declaration',
      formDefinitionId: 'fd-loan-application-001',
      label: 'Declaration',
      iconName: 'CheckboxChecked',
      displayOrder: 5,
      isVisible: true,
      requiresPreviousTabComplete: false,
      sections: [
        {
          id: 'sec-declaration',
          tabId: 'tab-declaration',
          label: 'Terms and Declaration',
          displayOrder: 1,
          columns: 1,
          isCollapsible: false,
          isCollapsedByDefault: false,
          isVisible: true,
          fields: [
            {
              id: 'fld-declaration-text',
              sectionId: 'sec-declaration',
              fieldType: 'richtext',
              schemaName: 'qdb_declaration_text',
              label: 'Declaration',
              displayOrder: 1,
              columnSpan: 1,
              isRequired: false,
              isReadonly: true,
              isHidden: false,
              isVisible: true,
              defaultValue:
                '<p>I/We hereby declare that all information provided in this application is true, accurate, and complete. I/We authorise QDB to conduct any verification it deems necessary. I/We understand that providing false information may result in rejection of this application and/or legal action.</p>',
              validationRules: [],
              businessRules: [],
            },
            {
              id: 'fld-agreement',
              sectionId: 'sec-declaration',
              fieldType: 'checkbox',
              schemaName: 'qdb_agrees_to_declaration',
              label: 'I have read and agree to the above declaration',
              displayOrder: 2,
              columnSpan: 1,
              isRequired: true,
              isReadonly: false,
              isHidden: false,
              isVisible: true,
              validationRules: [
                { id: 'vr-017', fieldId: 'fld-agreement', ruleType: 'required', errorMessage: 'You must agree to the declaration to proceed.', isActive: true, priority: 1 },
              ],
              businessRules: [],
            },
          ],
        },
      ],
    },
  ],
  createdAt: '2026-05-08T00:00:00Z',
  modifiedAt: '2026-05-08T00:00:00Z',
};

// â”€â”€ Mock implementations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class MockMetadataService {
  async getFormDefinition(_formCode: string): Promise<FormDefinition> {
    return structuredClone(MOCK_LOAN_APPLICATION);
  }

  async getFormVersions(_formCode: string) {
    return [
      {
        id: 'fv-001',
        formDefinitionId: 'fd-loan-application-001',
        versionNumber: 1,
        publishedAt: '2026-05-08T00:00:00Z',
        publishedBy: 'Admin',
        changeNotes: 'Initial version',
        isCurrentVersion: true,
      },
    ];
  }

  async listForms(_filter?: { search?: string; status?: string }): Promise<FormSummary[]> {
    return [
      {
        id: MOCK_LOAN_APPLICATION.id,
        formCode: MOCK_LOAN_APPLICATION.formCode,
        title: MOCK_LOAN_APPLICATION.title,
        description: MOCK_LOAN_APPLICATION.description,
        status: MOCK_LOAN_APPLICATION.status,
        version: MOCK_LOAN_APPLICATION.version,
        modifiedAt: new Date().toISOString(),
      },
    ];
  }

  invalidateCache(_formCode: string): void {}
}

export class MockDataService {
  private drafts = new Map<string, DraftSubmission>();

  async getRecord(_entityLogicalName: string, recordId: string) {
    return { id: recordId, name: 'Mock Record' };
  }

  async getDraft(formDefinitionId: string, userId: string): Promise<DraftSubmission | null> {
    return this.drafts.get(`${formDefinitionId}:${userId}`) ?? null;
  }

  async saveDraft(draft: DraftSubmission): Promise<DraftSubmission> {
    const saved = { ...draft, id: draft.id ?? `draft-${Date.now()}` };
    this.drafts.set(`${draft.formDefinitionId}:${draft.userId}`, saved);
    return saved;
  }

  async deleteDraft(draftId: string): Promise<void> {
    for (const [key, draft] of this.drafts.entries()) {
      if (draft.id === draftId) {
        this.drafts.delete(key);
        break;
      }
    }
  }
}

export class MockLookupService {
  async searchLookup(params: { searchTerm: string }): Promise<LookupResult[]> {
    const results: LookupResult[] = [
      { id: 'prod-001', displayName: 'Home Finance Classic', entityLogicalName: 'qdb_product' },
      { id: 'prod-002', displayName: 'Home Finance Premier', entityLogicalName: 'qdb_product' },
      { id: 'prod-003', displayName: 'Commercial Facility', entityLogicalName: 'qdb_product' },
    ];
    return results.filter((r) =>
      r.displayName.toLowerCase().includes(params.searchTerm.toLowerCase()),
    );
  }
}

export class MockSubmissionService {
  async submitForm(): Promise<{ parentRecordId: string; parentEntityLogicalName: string; referenceNumber: string }> {
    const year = new Date().getFullYear();
    const seq = Math.floor(Math.random() * 90000) + 10000;
    return {
      parentRecordId: `mock-record-${Date.now()}`,
      parentEntityLogicalName: 'opportunity',
      referenceNumber: `QDB-${year}-${seq}`,
    };
  }
}

export class MockAuditService {
  async writeAuditEntry(): Promise<void> {
    // no-op in mock mode
  }
}

const MOCK_DEFAULT_THEME: ThemeDefinition = {
  id: 'mock-light',
  themeCode: 'light',
  themeName: 'Mock Default Light',
  primaryColor: '#0078d4',
  backgroundColor: '#ffffff',
  surfaceColor: '#f5f5f5',
  textPrimaryColor: '#242424',
  textSecondaryColor: '#616161',
  borderColor: '#d1d1d1',
  errorColor: '#d13438',
  successColor: '#107c10',
  warningColor: '#ca5010',
  fontFamily: 'Segoe UI, system-ui, sans-serif',
  baseFontSize: '14px',
  borderRadius: '4px',
  shadowStyle: 'Subtle',
  spacingScale: 'Normal',
  isDarkMode: false,
  isActive: true,
};

export class MockDesignService {
  async getDesignPayload(_formCode: string, formDefinitionId: string): Promise<DesignPayload> {
    return this.buildMockPayload(formDefinitionId);
  }

  async getAllThemes(): Promise<ThemeDefinition[]> {
    return [MOCK_DEFAULT_THEME];
  }

  getDefaultPayload(): DesignPayload {
    return this.buildMockPayload('default');
  }

  invalidateCache(_formCode: string): void {}

  invalidateAllCache(): void {}

  private buildMockPayload(formDefinitionId: string): DesignPayload {
    return {
      theme: MOCK_DEFAULT_THEME,
      formDesign: {
        id: `mock-design-${formDefinitionId}`,
        formDefinitionId,
        layoutType: 'SingleColumn',
        labelPosition: 'Top',
        sectionStyle: 'Card',
        tabStyle: 'Tabs',
        buttonStyle: 'Primary',
        animationEnabled: true,
        alignment: 'Left',
        stickyActionBar: false,
        skeletonLoaderEnabled: true,
        isActive: true,
      },
      sectionDesigns: {},
      fieldDesigns: {},
      buttonDesigns: { Submit: undefined, SaveDraft: undefined, Cancel: undefined },
      layoutGrid: [],
    };
  }
}

export class MockFileService {
  async uploadToCrmNotes(_params: {
    file: Buffer;
    fileName: string;
    mimeType: string;
    parentEntityLogicalName: string;
    parentRecordId: string;
  }): Promise<string> {
    return `mock-annotation-${Date.now()}`;
  }

  async uploadToSharePoint(_params: {
    file: Buffer;
    fileName: string;
    libraryUrl: string;
    folderPath: string;
    accessToken: string;
  }): Promise<string> {
    return `https://mock.sharepoint.com/files/${Date.now()}`;
  }
}
