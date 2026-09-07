import { useMemo, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { Violation } from '@/services/ValidationService';

interface ValidationPanelProps {
  onNodeFocus: (canvasNodeId: string) => void;
  onClose: () => void;
}

/**
 * The problems list, grouped by rule (CWFD-009 P4).
 *
 * The Loan process produced 77 violations; as a flat list, "Specific User
 * with no user selected" appeared 28 separate times and the two structural
 * problems drowned. One rule = one collapsible group with a count, and the
 * ‹ › stepper walks every navigable issue in order without hunting.
 */
export function ValidationPanel({ onNodeFocus, onClose }: ValidationPanelProps) {
  const validationResults = useWorkflowStore((s) => s.validationResults);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [stepIndex, setStepIndex] = useState(-1);

  const groups = useMemo(() => groupByCode(validationResults), [validationResults]);
  const navigable = useMemo(
    () => groups.flatMap((g) => g.items).filter((v) => Boolean(v.nodeId)),
    [groups]
  );

  if (validationResults.length === 0) return null;

  const errors = validationResults.filter((v) => v.severity === 'error');
  const warnings = validationResults.filter((v) => v.severity === 'warning');
  const infos = validationResults.filter((v) => v.severity === 'info');

  const isOpen = (group: ViolationGroup) =>
    openGroups[group.key] ?? group.items.length <= 3;

  const focusViolation = (violation: Violation) => {
    if (!violation.nodeId) return;
    const type = violation.nodeType ?? 'step';
    onNodeFocus(type === 'outcome' ? `outcome_${violation.nodeId}` : `step_${violation.nodeId}`);
  };

  const stepTo = (offset: number) => {
    if (navigable.length === 0) return;
    const next = (stepIndex + offset + navigable.length) % navigable.length;
    setStepIndex(next);
    focusViolation(navigable[next]);
  };

  return (
    <div className="panel">
      <div style={headerStyle}>
        <span style={titleStyle}>Validation</span>
        <div style={summaryStyle}>
          {errors.length > 0 && (
            <span style={errorBadge}>{errors.length} error{errors.length > 1 ? 's' : ''}</span>
          )}
          {warnings.length > 0 && (
            <span style={warnBadge}>{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>
          )}
          {infos.length > 0 && (
            <span style={infoBadge}>{infos.length} info</span>
          )}
        </div>
        {navigable.length > 0 && (
          <div style={stepperStyle}>
            <button type="button" style={stepBtn} title="Previous issue" onClick={() => stepTo(-1)}>‹</button>
            <span style={stepCount}>
              {stepIndex >= 0 ? `${stepIndex + 1}/${navigable.length}` : navigable.length}
            </span>
            <button type="button" style={stepBtn} title="Next issue" onClick={() => stepTo(1)}>›</button>
          </div>
        )}
        <button type="button" onClick={onClose} style={closeBtn} title="Dismiss results">×</button>
      </div>

      <div style={listStyle}>
        {groups.map((group) => (
          <div key={group.key}>
            <button
              type="button"
              style={groupHeaderStyle(group.severity === 'error')}
              onClick={() =>
                setOpenGroups((open) => ({ ...open, [group.key]: !isOpen(group) }))
              }
              aria-expanded={isOpen(group)}
            >
              <span style={iconStyle(group.severity === 'error')}>
                {group.severity === 'error' ? '✕' : group.severity === 'warning' ? '⚠' : 'ⓘ'}
              </span>
              <span style={groupTitleStyle}>{humanizeCode(group.key)}</span>
              <span style={group.severity === 'error' ? errorBadge : group.severity === 'warning' ? warnBadge : infoBadge}>
                {group.items.length}
              </span>
              <span style={chevronStyle}>{isOpen(group) ? '▾' : '▸'}</span>
            </button>
            {isOpen(group) &&
              group.items.map((violation, index) => (
                <ViolationRow
                  key={`${group.key}_${index}`}
                  violation={violation}
                  onFocus={() => {
                    setStepIndex(navigable.indexOf(violation));
                    focusViolation(violation);
                  }}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ViolationGroup {
  key: string;
  severity: Violation['severity'];
  items: Violation[];
}

/** One group per rule code, errors before warnings, biggest groups first. */
function groupByCode(violations: Violation[]): ViolationGroup[] {
  const byCode = new Map<string, ViolationGroup>();
  for (const violation of violations) {
    const group = byCode.get(violation.code) ?? {
      key: violation.code,
      severity: violation.severity,
      items: [],
    };
    group.items.push(violation);
    // A group wears its worst member's severity.
    if (severityRank(violation.severity) > severityRank(group.severity)) {
      group.severity = violation.severity;
    }
    byCode.set(violation.code, group);
  }
  return [...byCode.values()].sort((a, b) => {
    if (a.severity !== b.severity) return severityRank(b.severity) - severityRank(a.severity);
    return b.items.length - a.items.length;
  });
}

function humanizeCode(code: string): string {
  const words = code.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function ViolationRow({ violation, onFocus }: { violation: Violation; onFocus: () => void }) {
  const canNavigate = Boolean(violation.nodeId);
  return (
    <div
      style={rowStyle(canNavigate)}
      onClick={canNavigate ? onFocus : undefined}
      role={canNavigate ? 'button' : undefined}
      tabIndex={canNavigate ? 0 : undefined}
      onKeyDown={canNavigate ? (e) => { if (e.key === 'Enter') onFocus(); } : undefined}
    >
      <span style={messageStyle}>{violation.message}</span>
      {canNavigate && <span style={arrowStyle}>›</span>}
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--surface-alt)',
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  flex: 1,
};

const summaryStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexShrink: 0,
};

const stepperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flexShrink: 0,
};

const stepBtn: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 12,
  lineHeight: '14px',
  width: 18,
  height: 18,
  padding: 0,
  cursor: 'pointer',
};

const stepCount: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  minWidth: 28,
  textAlign: 'center',
};

const errorBadge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  background: 'var(--error-bg)',
  color: 'var(--error)',
  border: '1px solid var(--error)',
  borderRadius: 10,
  padding: '1px 6px',
  flexShrink: 0,
};

function severityRank(severity: Violation['severity']): number {
  return severity === 'error' ? 2 : severity === 'warning' ? 1 : 0;
}

const infoBadge: React.CSSProperties = {
  background: 'var(--primary-tint-2)',
  color: 'var(--primary-pressed)',
  border: '1px solid var(--primary-tint)',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  padding: '0 7px',
  lineHeight: '16px',
};

const warnBadge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  background: 'var(--warning-bg)',
  color: 'var(--warning)',
  border: '1px solid var(--warning)',
  borderRadius: 10,
  padding: '1px 6px',
  flexShrink: 0,
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 16,
  color: 'var(--text-disabled)',
  cursor: 'pointer',
  padding: '0 2px',
  lineHeight: 1,
  flexShrink: 0,
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  // Without this the flex item will not shrink below its content, so overflowY
  // never engages and the panel is clipped instead of scrolling.
  minHeight: 0,
};

function groupHeaderStyle(isError: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    background: isError ? 'var(--error-bg)' : 'var(--warning-bg)',
    border: 'none',
    borderBottomStyle: 'solid',
    width: '100%',
    cursor: 'pointer',
    textAlign: 'left',
  };
}

function iconStyle(isError: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    color: isError ? 'var(--error)' : 'var(--warning)',
    flexShrink: 0,
    width: 14,
    textAlign: 'center',
  };
}

const groupTitleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const chevronStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-disabled)',
  flexShrink: 0,
};

function rowStyle(clickable: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '6px 12px 6px 32px',
    borderBottom: '1px solid var(--border)',
    cursor: clickable ? 'pointer' : 'default',
    transition: 'background 0.1s',
  };
}

const messageStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 11,
  color: 'var(--text)',
  lineHeight: 1.5,
  wordBreak: 'break-word',
};

const arrowStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-disabled)',
  flexShrink: 0,
  lineHeight: 1,
  marginTop: 2,
};
