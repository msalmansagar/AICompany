/**
 * Every `qdb_` name the browser knows, in one place.
 *
 * This is the frontend's counterpart to the service layer's `qdbBindings.ts`. A view never names a
 * column; a query module names one only through this file. That is what lets the schema move without
 * touching twenty-one screens, and it is also what makes the column set *checkable*:
 * `crm/scripts/verify-view-columns.mts` reads `READ_REGISTRY` below and asserts every entry exists on
 * the organisation. KI-52 was a column name that looked right, passed every unit test, and returned
 * nothing from the real platform — so the names here are verified against metadata rather than
 * believed.
 *
 * Choice labels appear here only where the option values are already proven by the service layer and
 * its live smokes. Where they are not, the renderer reads the platform's own formatted value and
 * shows an em dash if there is none. **No option value is guessed**, because a wrong label is a
 * confident lie rather than a visible gap.
 */

/** Entity SET names — what OData takes. `XrmCrmAdapter.toLogicalName` converts for `Xrm.WebApi`. */
export const ENTITY_SETS = {
  collectionCase: 'qdb_collectioncases',
  delinquencySnapshot: 'qdb_delinquencysnapshots',
  collectionActivity: 'qdb_collectionactivities',
  identityException: 'qdb_identityexceptions',
  collectionStrategy: 'qdb_collectionstrategies',
  strategyAction: 'qdb_strategyactions',
  crmLog: 'qdb_crmlogses',
  platformConfiguration: 'qdb_platformconfigurations',
  platformMapping: 'qdb_platformmappings',
  contact: 'contacts',
  account: 'accounts',
} as const;

/**
 * The navigation property to bind each lookup through on a **write**.
 *
 * A lookup has three different names and they are not interchangeable:
 *
 * | | Example |
 * |---|---|
 * | read (`$select`, `$filter`) | `_qdb_collectioncaseid_value` |
 * | **write** (`@odata.bind`) | `qdb_collectioncaseid_qdb_collectionactivity` |
 * | storage (accepted, returns nothing) | `qdb_collectioncaseid` |
 *
 * **None of it is derivable.** `qdb_collectioncaseid` is suffixed with the referencing entity on
 * `qdb_collectionactivity` — because `regardingobjectid` also targets the case, so the relationship
 * name has to be unique — and is *not* suffixed on `qdb_delinquencysnapshot`, where nothing
 * competes. The same attribute, two different navigation properties, decided by what else happens to
 * point at the same table.
 *
 * Read from `ManyToOneRelationships.ReferencingEntityNavigationPropertyName`, never inferred, and
 * checked against the organisation by `crm/scripts/verify-view-columns.mts`. This is the third time
 * this family has cost real debugging — KI-52 (read form), KI-57 (write form), KI-69 (this) — which
 * is why it is a registry rather than a habit.
 *
 * The polymorphic Customer lookup has **one navigation property per target**: binding a contact and
 * binding an account are different property names, which is what makes HL and BFD work from one
 * codebase without branching on the organisation.
 */
export const NAVIGATION_PROPERTIES = {
  activityToCase: 'qdb_collectioncaseid_qdb_collectionactivity',
  activityToType: 'qdb_activitytypeid_qdb_collectionactivity',
  activityToOutcome: 'qdb_outcomeid_qdb_collectionactivity',
  snapshotToCase: 'qdb_collectioncaseid',
  caseToStrategy: 'qdb_strategyid',
  caseToAssignedTeam: 'qdb_assignedteamid',
  caseToCustomerContact: 'qdb_customerid_contact',
  caseToCustomerAccount: 'qdb_customerid_account',
} as const;

/** Every navigation property above, with the entity and attribute it belongs to, for verification. */
export const NAVIGATION_REGISTRY: readonly {
  entity: string; attribute: string; navigationProperty: string;
}[] = [
  { entity: 'qdb_collectionactivity', attribute: 'qdb_collectioncaseid', navigationProperty: NAVIGATION_PROPERTIES.activityToCase },
  { entity: 'qdb_collectionactivity', attribute: 'qdb_activitytypeid', navigationProperty: NAVIGATION_PROPERTIES.activityToType },
  { entity: 'qdb_collectionactivity', attribute: 'qdb_outcomeid', navigationProperty: NAVIGATION_PROPERTIES.activityToOutcome },
  { entity: 'qdb_delinquencysnapshot', attribute: 'qdb_collectioncaseid', navigationProperty: NAVIGATION_PROPERTIES.snapshotToCase },
  { entity: 'qdb_collectioncase', attribute: 'qdb_strategyid', navigationProperty: NAVIGATION_PROPERTIES.caseToStrategy },
  { entity: 'qdb_collectioncase', attribute: 'qdb_assignedteamid', navigationProperty: NAVIGATION_PROPERTIES.caseToAssignedTeam },
  { entity: 'qdb_collectioncase', attribute: 'qdb_customerid', navigationProperty: NAVIGATION_PROPERTIES.caseToCustomerContact },
  { entity: 'qdb_collectioncase', attribute: 'qdb_customerid', navigationProperty: NAVIGATION_PROPERTIES.caseToCustomerAccount },
];

/** Builds an `@odata.bind` entry: the one correct way to point a lookup at a record on a write. */
export function bindLookup(navigationProperty: string, entitySet: string, id: string): Record<string, string> {
  return { [`${navigationProperty}@odata.bind`]: `/${entitySet}(${id})` };
}

/** The lookup annotation that names which table a polymorphic lookup points at. */
export const LOOKUP_TABLE_ANNOTATION = '@Microsoft.Dynamics.CRM.lookuplogicalname';

/** The platform's own display text for a choice, a money value or a lookup. */
export const FORMATTED_VALUE_ANNOTATION = '@OData.Community.Display.V1.FormattedValue';

// ── Columns, per read ────────────────────────────────────────────────────────

/** A case as a list row needs it. */
export const CASE_LIST_COLUMNS = [
  'qdb_collectioncaseid', 'qdb_casenumber', 'qdb_customerbusinessid', 'qdb_facilitynumber',
  'qdb_facilitysourcesystem', 'qdb_organizationcode', 'statuscode', 'qdb_currentarrearbucket',
  'qdb_currentdpd', 'qdb_currenttotalarrears', 'qdb_currentloanbalance', 'qdb_misasofdate',
  'qdb_episodenumber', 'qdb_opendate', '_qdb_customerid_value',
] as const;

/** Everything the Case Workspace summary shows, on top of the list columns. */
export const CASE_DETAIL_COLUMNS = [
  ...CASE_LIST_COLUMNS,
  'qdb_customertype', 'qdb_producttypecode', 'qdb_productdescription', 'qdb_installmentamount',
  'qdb_lastmissyncon', 'qdb_curedate', 'qdb_resolutiontype', 'qdb_closeddate', 'qdb_correlationid',
  'qdb_eligibilityrulesetversion', 'statecode', 'createdon', 'modifiedon',
  '_qdb_strategyid_value', '_ownerid_value',
] as const;

export const ACTIVITY_COLUMNS = [
  'activityid', 'subject', 'qdb_activitynumber', 'qdb_activitydate', 'qdb_followupdate',
  'qdb_amount', 'statuscode', 'statecode', 'createdon',
  '_qdb_collectioncaseid_value', '_qdb_activitytypeid_value', '_ownerid_value',
] as const;

export const PTP_COLUMNS = [
  ...ACTIVITY_COLUMNS,
  'qdb_ptpdate', 'qdb_promisedamount', 'qdb_promisetype', 'qdb_ptpstatus',
  'qdb_amountreceived', 'qdb_paymentreceiveddate', 'qdb_brokendate', 'qdb_brokenreason',
] as const;

export const SNAPSHOT_COLUMNS = [
  'qdb_delinquencysnapshotid', 'qdb_snapshotkey', 'qdb_customerbusinessid', 'qdb_facilitynumber',
  'qdb_facilitysourcesystem', 'qdb_snapshotdate', 'qdb_receivedon', 'qdb_missourcetimestamp',
  'qdb_dpd', 'qdb_arrearbucket', 'qdb_loanbalance', 'qdb_totalarrears', 'qdb_installmentamount',
  'qdb_producttypecode', 'qdb_eligibilityoutcome', 'qdb_eligibilityreason', 'qdb_integrationbatchid',
  '_qdb_collectioncaseid_value',
] as const;

export const STRATEGY_COLUMNS = [
  'qdb_collectionstrategyid', 'qdb_code', 'qdb_name', 'qdb_priority', 'qdb_isactive',
  'qdb_effectivefrom', 'qdb_effectiveto', 'qdb_rulecode', 'qdb_noautomatedcontact', 'qdb_description',
  'qdb_customertype', 'qdb_producttype', 'qdb_dpdfrom', 'qdb_dpdto', 'qdb_arrearsfrom', 'qdb_arrearsto',
  'qdb_exposurefrom', 'qdb_exposureto', 'qdb_risklevel', 'qdb_nplflag', 'qdb_brokenptpcountfrom',
  'qdb_legalstatus', 'qdb_restructurestatus',
] as const;

export const STRATEGY_ACTION_COLUMNS = [
  'qdb_strategyactionid', 'qdb_name', 'qdb_sequence', 'qdb_dayoffset', 'qdb_triggerevent',
  'qdb_communicationchannel', 'qdb_queuename', 'qdb_requiresapproval', 'qdb_ismandatory',
  'qdb_stoponpayment', 'qdb_stoponptp', 'qdb_escalateifnotcompleted', 'qdb_escalationhours',
  'qdb_processcode', 'qdb_rulecode', 'qdb_isactive', '_qdb_strategyid_value', '_qdb_activitytypeid_value',
] as const;

export const IDENTITY_EXCEPTION_COLUMNS = [
  'qdb_identityexceptionid', 'qdb_name', 'qdb_customerbusinessid', 'qdb_facilitynumber',
  'qdb_source', 'qdb_exceptionreason', 'qdb_exceptionstatus', 'qdb_sourcereference',
  'qdb_integrationbatchid', 'qdb_receiveddate', 'qdb_resolution', 'qdb_resolvedfacilitynumber',
] as const;

export const PLATFORM_CONFIGURATION_COLUMNS = [
  'qdb_platformconfigurationid', 'qdb_name', 'qdb_platformtype', 'qdb_organizationcode',
  'qdb_environmentcode', 'qdb_customerentity', 'qdb_customerbusinessidfield', 'qdb_facilityentity',
  'qdb_facilitybusinessidfield', 'qdb_eligibilityrulesetcode', 'qdb_strategyrulesetcode',
  'qdb_contactholdrulesetcode', 'qdb_snapshotpolicy', 'qdb_customertype', 'qdb_featureflags',
  'qdb_misintegrationenabled', 'qdb_misprovider', 'qdb_isactive',
] as const;

export const PLATFORM_MAPPING_COLUMNS = [
  'qdb_platformmappingid', 'qdb_name', 'qdb_businessobject', 'qdb_canonicalfield',
  'qdb_crmentitylogicalname', 'qdb_crmfieldlogicalname', 'qdb_datatype', 'qdb_isrequired',
  'qdb_accessmode', 'qdb_isactive', '_qdb_platformconfigurationid_value',
] as const;

/**
 * `qdb_crmlogs` carries no correlation column: the correlation id, batch id and counters are written
 * into `description` as a JSON diagnostic block. That is why a case's technical trail is found by
 * searching `description` rather than by a lookup, and why `description` is read rather than only
 * filtered on — a trail nobody can inspect is not evidence.
 */
export const CRM_LOG_COLUMNS = [
  'activityid', 'qdb_source', 'qdb_type', 'createdon', 'subject', 'qdb_isexception', 'description',
] as const;

/**
 * The customer, read from whichever table owns it.
 *
 * Housing Loan keeps customers as contacts and BFD as accounts, and which one applies is read from
 * the case's own lookup annotation — never from a constant that assumes an organisation.
 */
export const CONTACT_COLUMNS = [
  'contactid', 'fullname', 'firstname', 'lastname', 'telephone1', 'mobilephone',
  'emailaddress1', 'address1_city', 'statecode',
] as const;

export const ACCOUNT_COLUMNS = [
  'accountid', 'name', 'accountnumber', 'telephone1', 'emailaddress1', 'address1_city', 'statecode',
] as const;

// ── Choice labels, only where the values are already proven ──────────────────

export const BUCKET_LABELS: Readonly<Record<number, string>> = {
  100000000: '1-30', 100000001: '31-60', 100000002: '61-90', 100000003: '91-180', 100000004: '181-270',
  100000005: '271-360', 100000006: '361-500', 100000007: '501-1000', 100000008: '1001-2000', 100000009: '>2000',
};

export const ORG_LABELS: Readonly<Record<number, string>> = { 100000140: 'HL', 100000141: 'BFD' };

export const CASE_STATUS_LABELS: Readonly<Record<number, string>> = {
  100000600: 'New', 100000601: 'Assigned', 100000602: 'In Progress', 100000603: 'Pending Customer Response',
  100000604: 'PTP Active', 100000605: 'PTP Broken', 100000606: 'Restructure Review', 100000607: 'Restructured',
  100000608: 'Pending Legal Review', 100000609: 'Referred to Legal', 100000610: 'Under Legal Action',
  100000611: 'Escalated to Supervisor', 100000612: 'Deceased/Insurance Review', 100000613: 'Settled',
  100000614: 'Closed', 100000615: 'Written Off', 100000616: 'Reopened',
};

export const PTP_STATUS_LABELS: Readonly<Record<number, string>> = {
  100000080: 'Active', 100000081: 'Kept', 100000082: 'Partially Kept',
  100000083: 'Broken', 100000084: 'Rescheduled', 100000085: 'Cancelled',
};

export const PROMISE_TYPE_LABELS: Readonly<Record<number, string>> = { 100000580: 'Full', 100000581: 'Partial' };

export const CUSTOMER_TYPE_LABELS: Readonly<Record<number, string>> = {
  100000020: 'Individual', 100000021: 'SME', 100000022: 'Corporate',
};

export const RESOLUTION_TYPE_LABELS: Readonly<Record<number, string>> = {
  100000340: 'Cured', 100000341: 'Settled', 100000342: 'Restructured', 100000343: 'Written Off',
  100000344: 'Legal', 100000345: 'Deceased', 100000346: 'Closed',
};

export const ELIGIBILITY_OUTCOME_LABELS: Readonly<Record<number, string>> = {
  100000260: 'Eligible — create case', 100000261: 'Existing episode — update', 100000262: 'Grace monitor',
  100000263: 'Excluded — special handling', 100000264: 'Identity exception', 100000265: 'Facility exception',
};

export const EXCEPTION_REASON_LABELS: Readonly<Record<number, string>> = {
  100000300: 'Customer not found', 100000301: 'Facility not found', 100000302: 'Duplicate customer',
  100000303: 'Duplicate facility', 100000304: 'Invalid identifier', 100000305: 'Present in one organisation only',
};

export const EXCEPTION_STATUS_LABELS: Readonly<Record<number, string>> = {
  100000320: 'Open', 100000321: 'Under review', 100000322: 'Resolved', 100000323: 'Rejected',
};

export const TRIGGER_EVENT_LABELS: Readonly<Record<number, string>> = {
  100000240: 'Day offset', 100000241: 'Bucket change', 100000242: 'Broken PTP', 100000243: 'Cure',
  100000244: 'New delinquency', 100000245: 'SLA', 100000246: 'Manual',
};

export const COMMUNICATION_CHANNEL_LABELS: Readonly<Record<number, string>> = {
  100000100: 'SMS', 100000101: 'WhatsApp', 100000102: 'Email', 100000103: 'Call', 100000104: 'Official letter',
};

export const PLATFORM_TYPE_LABELS: Readonly<Record<number, string>> = {
  100000120: 'On-premises', 100000121: 'Cloud',
};

export const SNAPSHOT_POLICY_LABELS: Readonly<Record<number, string>> = {
  100000280: 'All received', 100000281: 'Eligible only', 100000282: 'Changed only',
};

/**
 * Everything the workspace reads, for the metadata verifier.
 *
 * Each entry is an entity set and the columns read from it. The verifier normalises `_x_value` back
 * to `x` and drops annotations before asking the organisation whether each attribute exists.
 */
export const READ_REGISTRY: readonly { entitySet: string; columns: readonly string[] }[] = [
  { entitySet: ENTITY_SETS.collectionCase, columns: CASE_DETAIL_COLUMNS },
  { entitySet: ENTITY_SETS.collectionActivity, columns: PTP_COLUMNS },
  { entitySet: ENTITY_SETS.delinquencySnapshot, columns: SNAPSHOT_COLUMNS },
  { entitySet: ENTITY_SETS.collectionStrategy, columns: STRATEGY_COLUMNS },
  { entitySet: ENTITY_SETS.strategyAction, columns: STRATEGY_ACTION_COLUMNS },
  { entitySet: ENTITY_SETS.identityException, columns: IDENTITY_EXCEPTION_COLUMNS },
  { entitySet: ENTITY_SETS.platformConfiguration, columns: PLATFORM_CONFIGURATION_COLUMNS },
  { entitySet: ENTITY_SETS.platformMapping, columns: PLATFORM_MAPPING_COLUMNS },
  { entitySet: ENTITY_SETS.crmLog, columns: CRM_LOG_COLUMNS },
  { entitySet: ENTITY_SETS.contact, columns: CONTACT_COLUMNS },
  { entitySet: ENTITY_SETS.account, columns: ACCOUNT_COLUMNS },
];

/** `_qdb_strategyid_value` → `qdb_strategyid`; an annotation returns undefined. */
export function toAttributeName(column: string): string | undefined {
  if (column.includes('@')) return undefined;
  const lookup = /^_(.+)_value$/.exec(column);
  return lookup ? lookup[1] : column;
}
