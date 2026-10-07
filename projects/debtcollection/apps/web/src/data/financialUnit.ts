/**
 * What a collection financial unit is called, by the system that owns it (user instruction,
 * 2026-09-28).
 *
 * Housing Loan delinquency sits on a **loan account** of a CRM contact; BFD delinquency sits on a
 * **facility** of a CRM account. The platform carries both under one technical key —
 * `qdb_facilitynumber` + `qdb_facilitysourcesystem`, the canonical `facilityNumber` + `sourceSystem`
 * of the MIS contract — because a case, a snapshot and an activity must not branch on the source.
 * That key stays. What changes is the word an officer reads: an HL unit is never labelled a
 * facility.
 */

export type FinancialUnitKind = 'loanAccount' | 'facility';

export interface FinancialUnitTerms {
  kind: FinancialUnitKind;
  /** "Loan Account" or "Facility". */
  noun: string;
  /** "Housing Loan" or "BFD". */
  source: string;
  /** What the balance figure is called for this kind of unit. */
  balanceLabel: string;
  /** The CRM table the customer lives in. */
  customerTable: 'contact' | 'account';
}

const HOUSING_LOAN: FinancialUnitTerms = { kind: 'loanAccount', noun: 'Loan Account', source: 'Housing Loan', balanceLabel: 'Loan balance', customerTable: 'contact' };
const BFD: FinancialUnitTerms = { kind: 'facility', noun: 'Facility', source: 'BFD', balanceLabel: 'Facility exposure', customerTable: 'account' };

/**
 * The terms for a source system code as the case carries it (`HL` / `BFD`). An unknown code is read
 * as a facility with its own code as the source name — never guessed to be Housing Loan.
 */
export function financialUnitTerms(sourceSystem: string | undefined): FinancialUnitTerms {
  if (sourceSystem === 'HL') return HOUSING_LOAN;
  if (sourceSystem === 'BFD') return BFD;
  return { ...BFD, source: sourceSystem ?? 'Unknown source' };
}

/** "HL Loan Account HL-001245" / "BFD Facility BFD-00982" — the unit named in full, for a timeline line. */
export function describeFinancialUnit(sourceSystem: string | undefined, unitNumber: string | undefined): string {
  const terms = financialUnitTerms(sourceSystem);
  return `${sourceSystem ?? terms.source} ${terms.noun} ${unitNumber ?? '—'}`;
}

/** The plural heading for a customer's units: what they actually hold, not a generic word. */
export function financialUnitsHeading(kinds: readonly FinancialUnitKind[]): string {
  const hasLoan = kinds.includes('loanAccount');
  const hasFacility = kinds.includes('facility');
  if (hasLoan && hasFacility) return 'Loan Accounts & Facilities';
  if (hasLoan) return 'Loan Accounts';
  if (hasFacility) return 'Facilities';
  return 'Loan Accounts & Facilities';
}
