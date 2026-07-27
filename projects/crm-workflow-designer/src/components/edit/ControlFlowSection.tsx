import { useId, useState } from 'react';
import type { ControlFlowFields, SplitType, JoinType } from '@/types/WorkflowTypes';
import { controlFlowSummaryText } from '@/services/controlFlowFields';

// DP-1 — how a step's branches relate to each other. The vocabulary here is the
// maker's ("run all of the following"), not BPMN's ("AND-split"): the person
// configuring this models loan approvals, not workflow nets.

interface ControlFlowSectionProps {
  value: ControlFlowFields;
  onChange: (patch: Partial<ControlFlowFields>) => void;
  /** How many outcomes the step has — a parallel split needs at least two. */
  outcomeCount: number;
}

const SPLIT_OPTIONS: Array<{ value: SplitType; label: string }> = [
  { value: 'Exclusive', label: 'Run one of the following branches' },
  { value: 'Parallel', label: 'Run all of the following branches at the same time' },
];

const JOIN_OPTIONS: Array<{ value: JoinType; label: string }> = [
  { value: 'None', label: 'Start as soon as one branch arrives' },
  { value: 'AndJoin', label: 'Wait for all incoming branches' },
];

const MIN_PARALLEL_BRANCHES = 2;

export function ControlFlowSection({ value, onChange, outcomeCount }: ControlFlowSectionProps) {
  const sectionId = useId();
  const [expanded, setExpanded] = useState(false);
  const summary = controlFlowSummaryText(value);
  const canGoParallel = outcomeCount >= MIN_PARALLEL_BRANCHES;

  return (
    <div>
      <button type="button" style={headerStyle} onClick={() => setExpanded((open) => !open)}>
        <span style={caretStyle}>{expanded ? '▾' : '▸'}</span>
        <span>Branching</span>
        {!expanded && summary && <span style={summaryBadgeStyle}>{summary}</span>}
      </button>

      {expanded && (
        <div style={bodyStyle}>
          <div style={noticeStyle}>
            Concurrent branches can be designed, validated and exported now, but the platform
            cannot run them yet — a process that uses them cannot be published.
          </div>

          <Choice
            label="When this step completes"
            groupName={`${sectionId}-split`}
            value={value.splitType}
            options={SPLIT_OPTIONS}
            disabledValues={canGoParallel ? [] : ['Parallel']}
            onChange={(splitType) => onChange({ splitType })}
          />
          {!canGoParallel && (
            <span style={hintStyle}>
              Add a second outcome to this step before it can run branches at the same time.
            </span>
          )}

          <Choice
            label="Before this step starts"
            groupName={`${sectionId}-join`}
            value={value.joinType}
            options={JOIN_OPTIONS}
            disabledValues={[]}
            onChange={(joinType) => onChange({ joinType })}
          />
        </div>
      )}
    </div>
  );
}

/** A labelled radio group. Radios, not a dropdown — both options must be readable at once. */
function Choice<T extends string>({
  label,
  groupName,
  value,
  options,
  disabledValues,
  onChange,
}: {
  label: string;
  /** Shared by every radio in this group — radio names are document-global. */
  groupName: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  disabledValues: T[];
  onChange: (value: T) => void;
}) {
  return (
    <div style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {options.map((option) => (
        <label key={option.value} style={radioRowStyle}>
          <input
            type="radio"
            name={groupName}
            checked={value === option.value}
            disabled={disabledValues.includes(option.value)}
            onChange={() => onChange(option.value)}
          />
          <span style={disabledValues.includes(option.value) ? radioLabelDisabledStyle : radioLabelStyle}>
            {option.label}
          </span>
        </label>
      ))}
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
const radioRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer',
};
const radioLabelStyle: React.CSSProperties = { fontSize: 12, color: '#e2e8f0', lineHeight: 1.4 };
const radioLabelDisabledStyle: React.CSSProperties = { fontSize: 12, color: '#475569', lineHeight: 1.4 };
const hintStyle: React.CSSProperties = { fontSize: 10, color: '#64748b', lineHeight: 1.4 };
