/**
 * The approved HL mapping onto QDB's existing BFD Case Management (`incident` in QDB1).
 *
 * These are the business contract, not tuning values: each one was confirmed against the on-prem
 * organisation on 2026-09-29 (`docs/CaseManagement_HLComplaint_Findings.md`). Records are named
 * here and resolved at runtime by exact name or label — never by a GUID or a numeric option value,
 * because both differ between organisations. A resolution that is missing or ambiguous refuses
 * the complaint; nothing here is guessed.
 *
 * BFD will get its own mapping beside this one when its rules are approved.
 */
export const HL_COMPLAINT_MAPPING = {
  /** Case Management's customer for every HL complaint; the real HL customer travels as values. */
  nonCustomerAccountName: 'Non Customer',
  /** `qdb_businessunit` is a picklist on the Case; its label. */
  businessUnitLabel: 'Housing Loan',
  /** `qdb_department` names a business unit record; its `qdb_manager` becomes Assigned To. */
  departmentName: 'Housing Loan',
  /** `qdb_product` names a `qdb_case_products` row. */
  productName: 'Housing Loan',
  caseTypeLabel: 'Complaint',
  originLabel: 'Phone',
  /** `qdb_case_source`: false is "Internal (QDB)". */
  isExternalSource: false,
  /** `qdb_existing_customer`: false is "No (other)". */
  isExistingCustomer: false,
} as const;

/** The Collection Case organisation code an HL complaint must come from. */
export const HL_SOURCE_SYSTEM = 'HL';
