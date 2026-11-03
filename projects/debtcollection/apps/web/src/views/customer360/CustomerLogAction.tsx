import { useState } from 'react';
import type { FinancialUnit } from '../../data/customerAggregate.js';
import { financialUnitTerms } from '../../data/financialUnit.js';
import { Dialog } from '../../components/forms.js';
import { formatCount, formatMoney } from '../../components/primitives.js';

/**
 * "+ Log action" from the customer header, which must never guess the case.
 *
 *   0 open cases — disabled, with the reason;
 *   1 open case  — that case is used, and the Log Action dialog says so;
 *   2 or more    — the officer chooses the Loan Account / Facility and case; Continue stays disabled
 *                  until they have. Not the first, not the worst DPD, not the selected row.
 */
export function CustomerLogActionButton({ openUnits, onChosen }: { openUnits: readonly FinancialUnit[]; onChosen: (unit: FinancialUnit, note: string) => void }) {
  const [choosing, setChoosing] = useState(false);
  const noCase = openUnits.length === 0 ? 'No open Collection Case' : undefined;
  const start = () => {
    if (openUnits.length === 1) { onChosen(openUnits[0]!, `${describeUnit(openUnits[0]!)} — the customer's only open Collection Case — is used.`); return; }
    setChoosing(true);
  };
  return (
    <>
      <button type="button" className="btn" onClick={noCase ? undefined : start} disabled={Boolean(noCase)} title={noCase ?? 'Log action'} data-testid="c360-log-action">
        + Log action
      </button>
      {noCase && <span className="c360-hint" data-testid="c360-log-action-reason">{noCase}</span>}
      {choosing && (
        <CaseChooser units={openUnits} onClose={() => setChoosing(false)} onContinue={unit => { setChoosing(false); onChosen(unit, `${describeUnit(unit)} was chosen.`); }} />
      )}
    </>
  );
}

function describeUnit(unit: FinancialUnit): string {
  return `${financialUnitTerms(unit.organization).noun} ${unit.unitNumber}, case ${unit.case.caseNumber}`;
}

function CaseChooser({ units, onClose, onContinue }: { units: readonly FinancialUnit[]; onClose: () => void; onContinue: (unit: FinancialUnit) => void }) {
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const unit = units.find(candidate => candidate.case.id === chosen);
  return (
    <Dialog
      title="Which case?" subtitle="This customer has more than one open Collection Case. Choose the Loan Account or Facility the action concerns."
      onClose={onClose} testId="c360-case-picker"
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!unit} onClick={unit ? () => onContinue(unit) : undefined} data-testid="c360-picker-continue">Continue</button>
        </>
      )}
    >
      <fieldset className="c360-picker" data-testid="c360-case-options">
        <legend className="c360-visually-hidden">Open Collection Cases</legend>
        {units.map(candidate => (
          <label key={candidate.case.id} className="c360-picker-option">
            <input type="radio" name="c360-case" value={candidate.case.id} checked={chosen === candidate.case.id} onChange={() => setChosen(candidate.case.id)} data-testid={`c360-pick-${candidate.case.id}`} />
            <span>
              <b>{financialUnitTerms(candidate.organization).noun} {candidate.unitNumber}</b>
              <span className="c360-hint"> · {candidate.case.caseNumber} · {formatMoney(candidate.totalArrears)} overdue · {formatCount(candidate.dpd)} DPD</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
