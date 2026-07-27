import { useId, useState } from 'react';
import type { WorkflowStep } from '@/types/WorkflowTypes';
import { branchSummaryText } from '@/services/branchFields';

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
  const sectionId = useId();
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
        <div style={bodyStyle}>
          {childCount > 0 && (
            <div style={noticeStyle}>
              {childCount} step{childCount === 1 ? '' : 's'} run{childCount === 1 ? 's' : ''} at the
              same time as this one. Use the outcome panel to make an outcome wait for them.
            </div>
          )}

          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor={`${sectionId}-parent`}>Runs at the same time as</label>
            <select
              id={`${sectionId}-parent`}
              style={selectStyle}
              value={value.parentStepId ?? ''}
              onChange={(event) =>
                onChange(
                  event.target.value
                    ? { parentStepId: event.target.value }
                    : { parentStepId: null, parentStepName: null, applyBranchFilter: false, branchFilter: '' }
                )
              }
            >
              <option value="">— Runs on its own, in sequence —</option>
              {candidateParents.map((step) => (
                <option key={step.id} value={step.id}>
                  {step.sequenceNo}. {step.name || 'Unnamed Step'}
                </option>
              ))}
            </select>
            <span style={hintStyle}>
              When that step&rsquo;s task is created, this step&rsquo;s task is created alongside it.
            </span>
          </div>

          {isBranch && (
            <>
              <label style={toggleRowStyle}>
                <input
                  type="checkbox"
                  checked={value.applyBranchFilter}
                  onChange={(event) => onChange({ applyBranchFilter: event.target.checked })}
                />
                <span style={toggleLabelStyle}>Only run this branch when a condition is met</span>
              </label>

              {value.applyBranchFilter && (
                <div style={fieldStyle}>
                  <button type="button" style={conditionBtnStyle} onClick={onEditCondition}>
                    {value.branchFilter.trim() ? 'Edit condition' : 'Set condition'}
                  </button>
                  {!value.branchFilter.trim() && (
                    <span style={errorStyle}>
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
  background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', textAlign: 'left',
};
const caretStyle: React.CSSProperties = { fontSize: 10, color: '#64748b' };
const summaryBadgeStyle: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#ddd6fe',
  background: '#4c1d95', border: '1px solid #7c3aed', borderRadius: 3, padding: '1px 5px',
  textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap',
};
const bodyStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 };
const noticeStyle: React.CSSProperties = {
  fontSize: 10, color: '#c4b5fd', background: '#1e1b4b', border: '1px solid #4c1d95',
  borderRadius: 4, padding: '6px 8px', lineHeight: 1.4,
};
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em',
};
const selectStyle: React.CSSProperties = {
  height: 30, padding: '0 8px', background: '#1e293b', border: '1px solid #334155',
  borderRadius: 4, color: '#e2e8f0', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box',
};
const hintStyle: React.CSSProperties = { fontSize: 10, color: '#64748b', lineHeight: 1.4 };
const errorStyle: React.CSSProperties = { fontSize: 10, color: '#f87171', fontWeight: 600, lineHeight: 1.4 };
const toggleRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
};
const toggleLabelStyle: React.CSSProperties = { fontSize: 12, color: '#e2e8f0' };
const conditionBtnStyle: React.CSSProperties = {
  height: 30, padding: '0 12px', background: '#1e293b', border: '1px solid #334155',
  borderRadius: 4, color: '#e2e8f0', fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start',
};
