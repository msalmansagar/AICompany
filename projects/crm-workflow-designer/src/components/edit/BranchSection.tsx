import { useState } from 'react';
import type { WorkflowStep } from '@/types/WorkflowTypes';
import { branchSummaryText } from '@/services/branchFields';
import { LookupField } from '@/components/common/LookupDialog';

// CWFD-005 — concurrency, expressed the way the platform engine expresses it.
//
// A step runs "beneath" another: when the parent's task is created the engine
// creates this one alongside it. The maker's vocabulary is "runs at the same time
// as", not "AND-split" — and the parent picker is the whole feature.

interface BranchSectionProps {
  value: Pick<WorkflowStep, 'crmId' | 'parentStepId' | 'applyBranchFilter' | 'branchFilter'>;
  onChange: (patch: Partial<WorkflowStep>) => void;
  /** Steps that could be the parent — every other step in the process. */
  candidateParents: Array<{ id: string; name: string; sequenceNo: number }>;
  /** How many steps already run beneath this one. */
  childCount: number;
  onEditCondition: () => void;
}

export function BranchSection({
  value,
  onChange,
  candidateParents,
  childCount,
  onEditCondition,
}: BranchSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = branchSummaryText(value);
  const isBranch = Boolean(value.parentStepId);

  return (
    <div>
      <button type="button" style={headerStyle} onClick={() => setExpanded((open) => !open)}>
        <span style={caretStyle}>{expanded ? '▾' : '▸'}</span>
        <span>Concurrency</span>
        {!expanded && summary && <span style={summaryBadgeStyle}>{summary}</span>}
        {!expanded && !summary && childCount > 0 && (
          <span style={summaryBadgeStyle}>⧉ {childCount}</span>
        )}
      </button>

      {expanded && (
        <div className="section-body">
          {childCount > 0 && (
            <div className="notice warning">
              {childCount} step{childCount === 1 ? '' : 's'} run{childCount === 1 ? 's' : ''} at the
              same time as this one. Use the outcome panel to make an outcome wait for them.
            </div>
          )}

          <div style={fieldStyle}>
            <LookupField
              label="Runs at the same time as"
              placeholder="— Runs on its own, in sequence —"
              dialogTitle="Runs at the same time as"
              clearLabel="— Runs on its own, in sequence —"
              options={candidateParents.map((step) => ({
                id: step.id,
                name: step.name || 'Unnamed Step',
                hint: `Step ${step.sequenceNo}`,
              }))}
              value={value.parentStepId}
              onChange={(id) =>
                onChange(
                  id
                    ? { parentStepId: id }
                    : { parentStepId: null, parentStepName: null, applyBranchFilter: false, branchFilter: '' }
                )
              }
            />
            <span className="hint-inline">
              When that step&rsquo;s task is created, this step&rsquo;s task is created alongside it.
            </span>
          </div>

          {isBranch && (
            <>
              <label className="toggle" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={value.applyBranchFilter}
                  onChange={(event) => onChange({ applyBranchFilter: event.target.checked })}
                />
                <span style={toggleLabelStyle}>Only run this branch when a condition is met</span>
              </label>

              {value.applyBranchFilter && (
                <div style={fieldStyle}>
                  <button type="button" className="btn sm" onClick={onEditCondition}>
                    {value.branchFilter.trim() ? 'Edit condition' : 'Set condition'}
                  </button>
                  {!value.branchFilter.trim() && (
                    <span className="hint-inline" style={{ color: 'var(--error)' }}>
                      No condition set — this branch would never start.
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- styles (match the dark step panel) ---

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 0',
  background: 'transparent', border: 'none', color: 'var(--text-disabled)', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', textAlign: 'left',
};
const caretStyle: React.CSSProperties = { fontSize: 10, color: 'var(--text-secondary)' };
const summaryBadgeStyle: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: 'var(--accent-branch)',
  background: 'var(--accent-branch-bg)', border: '1px solid var(--accent-branch)', borderRadius: 3, padding: '1px 5px',
  textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap',
};
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const toggleLabelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text)' };
