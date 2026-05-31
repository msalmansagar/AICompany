import type { FormDefinition, FormListItem } from '@qdb/shared';

export const MOCK_FORM_LIST: FormListItem[] = [
  {
    formId: 'f001',
    formCode: 'PERSONAL_LOAN',
    displayName: 'Personal Loan Application',
    description: 'Apply for a personal loan up to QAR 500,000',
    requiresDesktop: false,
    hasDraft: false,
    version: 1,
  },
  {
    formId: 'f002',
    formCode: 'SME_FINANCE',
    displayName: 'SME Financing Request',
    description: 'Business financing for small and medium enterprises',
    requiresDesktop: false,
    hasDraft: true,
    version: 2,
  },
  {
    formId: 'f003',
    formCode: 'HOME_FINANCE',
    displayName: 'Home Finance Application',
    description: 'Finance your dream home with QDB',
    requiresDesktop: false,
    hasDraft: false,
    version: 1,
  },
];

export const MOCK_FORMS: Record<string, FormDefinition> = {
  f001: {
    formId: 'f001',
    formCode: 'PERSONAL_LOAN',
    displayName: 'Personal Loan Application',
    description: 'Apply for a personal loan up to QAR 500,000',
    version: 1,
    businessRules: [],
    submissionMappings: [],
    tabs: [
      {
        tabId: 't1',
        displayLabel: 'Personal Info',
        displayOrder: 1,
        sections: [
          {
            sectionId: 's1',
            displayLabel: 'Applicant Details',
            displayOrder: 1,
            isCollapsible: false,
            fields: [
              { fieldId: 'f1', fieldKey: 'full_name', fieldType: 'text', displayLabel: 'Full Name', displayOrder: 1, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              { fieldId: 'f2', fieldKey: 'national_id', fieldType: 'text', displayLabel: 'National ID / QID', displayOrder: 2, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              { fieldId: 'f3', fieldKey: 'date_of_birth', fieldType: 'date', displayLabel: 'Date of Birth', displayOrder: 3, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              {
                fieldId: 'f4', fieldKey: 'nationality', fieldType: 'dropdown', displayLabel: 'Nationality', displayOrder: 4, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [],
                optionValues: [
                  { value: 'QA', label: 'Qatari', displayOrder: 1 },
                  { value: 'SA', label: 'Saudi Arabian', displayOrder: 2 },
                  { value: 'AE', label: 'Emirati', displayOrder: 3 },
                  { value: 'EG', label: 'Egyptian', displayOrder: 4 },
                  { value: 'IN', label: 'Indian', displayOrder: 5 },
                  { value: 'PK', label: 'Pakistani', displayOrder: 6 },
                  { value: 'OTHER', label: 'Other', displayOrder: 7 },
                ],
              },
              { fieldId: 'f5', fieldKey: 'mobile_number', fieldType: 'phone', displayLabel: 'Mobile Number', displayOrder: 5, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              { fieldId: 'f6', fieldKey: 'email_address', fieldType: 'email', displayLabel: 'Email Address', displayOrder: 6, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
            ],
          },
        ],
      },
      {
        tabId: 't2',
        displayLabel: 'Employment',
        displayOrder: 2,
        sections: [
          {
            sectionId: 's2',
            displayLabel: 'Employment Details',
            displayOrder: 1,
            isCollapsible: false,
            fields: [
              { fieldId: 'f7', fieldKey: 'employer_name', fieldType: 'text', displayLabel: 'Employer Name', displayOrder: 1, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              {
                fieldId: 'f8', fieldKey: 'employment_type', fieldType: 'dropdown', displayLabel: 'Employment Type', displayOrder: 2, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [],
                optionValues: [
                  { value: 'govt', label: 'Government', displayOrder: 1 },
                  { value: 'private', label: 'Private Sector', displayOrder: 2 },
                  { value: 'self', label: 'Self-employed', displayOrder: 3 },
                  { value: 'retired', label: 'Retired', displayOrder: 4 },
                ],
              },
              { fieldId: 'f9', fieldKey: 'monthly_salary', fieldType: 'currency', displayLabel: 'Monthly Salary (QAR)', displayOrder: 3, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [], currencySymbol: 'QAR' },
              { fieldId: 'f10', fieldKey: 'years_employed', fieldType: 'number', displayLabel: 'Years Employed', displayOrder: 4, isRequiredDefault: false, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
            ],
          },
        ],
      },
      {
        tabId: 't3',
        displayLabel: 'Loan Details',
        displayOrder: 3,
        sections: [
          {
            sectionId: 's3',
            displayLabel: 'Requested Financing',
            displayOrder: 1,
            isCollapsible: false,
            fields: [
              { fieldId: 'f11', fieldKey: 'loan_amount', fieldType: 'currency', displayLabel: 'Requested Amount (QAR)', displayOrder: 1, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [], currencySymbol: 'QAR' },
              {
                fieldId: 'f12', fieldKey: 'loan_purpose', fieldType: 'dropdown', displayLabel: 'Purpose of Loan', displayOrder: 2, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [],
                optionValues: [
                  { value: 'home_improvement', label: 'Home Improvement', displayOrder: 1 },
                  { value: 'education', label: 'Education', displayOrder: 2 },
                  { value: 'medical', label: 'Medical Expenses', displayOrder: 3 },
                  { value: 'travel', label: 'Travel', displayOrder: 4 },
                  { value: 'other', label: 'Other', displayOrder: 5 },
                ],
              },
              {
                fieldId: 'f13', fieldKey: 'repayment_period', fieldType: 'dropdown', displayLabel: 'Repayment Period', displayOrder: 3, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [],
                optionValues: [
                  { value: '12', label: '1 Year', displayOrder: 1 },
                  { value: '24', label: '2 Years', displayOrder: 2 },
                  { value: '36', label: '3 Years', displayOrder: 3 },
                  { value: '48', label: '4 Years', displayOrder: 4 },
                  { value: '60', label: '5 Years', displayOrder: 5 },
                ],
              },
              { fieldId: 'f14', fieldKey: 'agree_terms', fieldType: 'checkbox', displayLabel: 'I agree to the terms and conditions', displayOrder: 4, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              { fieldId: 'f15', fieldKey: 'additional_notes', fieldType: 'textarea', displayLabel: 'Additional Notes', displayOrder: 5, isRequiredDefault: false, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
            ],
          },
        ],
      },
    ],
  },
  f002: {
    formId: 'f002',
    formCode: 'SME_FINANCE',
    displayName: 'SME Financing Request',
    description: 'Business financing for small and medium enterprises',
    version: 2,
    businessRules: [],
    submissionMappings: [],
    tabs: [
      {
        tabId: 't1',
        displayLabel: 'Business Info',
        displayOrder: 1,
        sections: [
          {
            sectionId: 's1',
            displayLabel: 'Business Details',
            displayOrder: 1,
            isCollapsible: false,
            fields: [
              { fieldId: 'f1', fieldKey: 'business_name', fieldType: 'text', displayLabel: 'Business Name', displayOrder: 1, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              { fieldId: 'f2', fieldKey: 'commercial_reg_no', fieldType: 'text', displayLabel: 'Commercial Registration No.', displayOrder: 2, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              {
                fieldId: 'f3', fieldKey: 'business_type', fieldType: 'dropdown', displayLabel: 'Business Type', displayOrder: 3, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [],
                optionValues: [
                  { value: 'sole', label: 'Sole Proprietorship', displayOrder: 1 },
                  { value: 'llc', label: 'LLC', displayOrder: 2 },
                  { value: 'partnership', label: 'Partnership', displayOrder: 3 },
                  { value: 'joint', label: 'Joint Stock Company', displayOrder: 4 },
                ],
              },
              { fieldId: 'f4', fieldKey: 'established_date', fieldType: 'date', displayLabel: 'Date Established', displayOrder: 4, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              { fieldId: 'f5', fieldKey: 'annual_revenue', fieldType: 'currency', displayLabel: 'Annual Revenue (QAR)', displayOrder: 5, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [], currencySymbol: 'QAR' },
              { fieldId: 'f6', fieldKey: 'finance_amount', fieldType: 'currency', displayLabel: 'Requested Finance Amount (QAR)', displayOrder: 6, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [], currencySymbol: 'QAR' },
              { fieldId: 'f7', fieldKey: 'finance_purpose', fieldType: 'textarea', displayLabel: 'Purpose of Finance', displayOrder: 7, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
            ],
          },
        ],
      },
    ],
  },
  f003: {
    formId: 'f003',
    formCode: 'HOME_FINANCE',
    displayName: 'Home Finance Application',
    description: 'Finance your dream home with QDB',
    version: 1,
    businessRules: [],
    submissionMappings: [],
    tabs: [
      {
        tabId: 't1',
        displayLabel: 'Application',
        displayOrder: 1,
        sections: [
          {
            sectionId: 's1',
            displayLabel: 'Property Details',
            displayOrder: 1,
            isCollapsible: false,
            fields: [
              {
                fieldId: 'f1', fieldKey: 'property_type', fieldType: 'dropdown', displayLabel: 'Property Type', displayOrder: 1, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [],
                optionValues: [
                  { value: 'villa', label: 'Villa', displayOrder: 1 },
                  { value: 'apartment', label: 'Apartment', displayOrder: 2 },
                  { value: 'land', label: 'Land', displayOrder: 3 },
                ],
              },
              { fieldId: 'f2', fieldKey: 'property_value', fieldType: 'currency', displayLabel: 'Estimated Property Value (QAR)', displayOrder: 2, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [], currencySymbol: 'QAR' },
              { fieldId: 'f3', fieldKey: 'finance_amount', fieldType: 'currency', displayLabel: 'Requested Finance Amount (QAR)', displayOrder: 3, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [], currencySymbol: 'QAR' },
              { fieldId: 'f4', fieldKey: 'property_location', fieldType: 'text', displayLabel: 'Property Location / Area', displayOrder: 4, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [], optionValues: [] },
              {
                fieldId: 'f5', fieldKey: 'is_existing_customer', fieldType: 'radio', displayLabel: 'Existing QDB Customer?', displayOrder: 5, isRequiredDefault: true, isReadonlyDefault: false, isVisibleDefault: true, validationRules: [],
                optionValues: [
                  { value: 'yes', label: 'Yes', displayOrder: 1 },
                  { value: 'no', label: 'No', displayOrder: 2 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};
