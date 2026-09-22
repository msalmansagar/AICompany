/**
 * Dataverse entity-set names (OData plural logical names).
 * ONE authoritative definition — never hardcode these in service code.
 */
export const ENTITY_SETS = {
  CUSTOMER: 'msst_dcpcustomers',
  LOAN_FACILITY: 'msst_dcploanfacilities',
  DELINQUENCY_SNAPSHOT: 'msst_dcpdelinquencysnapshots',
  COLLECTION_CASE: 'msst_dcpcollectioncases',
  COLLECTION_ACTION: 'msst_dcpcollectionactions',
  COMMUNICATION: 'msst_dcpcommunications',
  PTP_RECORD: 'msst_dcpptprecords',
  CONSENT: 'msst_dcpconsents',
  STRATEGY_CONFIG: 'msst_dcpstrategyconfigs',
  AUDIT_LOG: 'msst_dcpauditlogs',
  IDENTITY_EXCEPTION: 'msst_dcpidentityexceptions',
} as const satisfies Record<string, string>;

/**
 * Correlation ID header name — agreed across the full stack (§5.5 arch doc).
 * The router reads/generates it, propagates it to CRM as this header, and
 * the audit plugin stores it in msst_dcpauditlog.msst_sourcepath.
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id' as const;

/** PII fields that are masked for callers without the View Sensitive PII claim. */
export const PII_FIELDS = ['msst_mobile', 'msst_email', 'msst_address'] as const;

/** Claim value that grants unmasked PII access (FR-014 / FR-114). */
export const VIEW_SENSITIVE_PII_CLAIM = 'View Sensitive PII' as const;
