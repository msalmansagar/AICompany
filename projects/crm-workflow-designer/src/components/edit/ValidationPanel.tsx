import { useWorkflowStore } from '@/store/workflowStore';
import type { Violation } from '@/services/ValidationService';

interface ValidationPanelProps {
  onNodeFocus: (canvasNodeId: string) => void;
  onClose: () => void;
}

export function ValidationPanel({ onNodeFocus, onClose }: ValidationPanelProps) {
  const validationResults = useWorkflowStore((s) => s.validationResults);

  if (validationResults.length === 0) return null;

  const errors = validationResults.filter((v) => v.severity === 'error');
  const warnings = validationResults.filter((v) => v.severity === 'warning');

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Validation Results</span>
        <div style={summaryStyle}>
          {errors.length > 0 && (
            <span style={errorBadge}>{errors.length} error{errors.length > 1 ? 's' : ''}</span>
          )}
          {warnings.length > 0 && (
            <span style={warnBadge}>{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <button type="button" onClick={onClose} style={closeBtn} title="Dismiss results">×</button>
      </div>

      <div style={listStyle}>
        {validationResults.map((v, idx) => (
          <ViolationRow key={idx} violation={v} onNodeFocus={onNodeFocus} />
        ))}
      </div>
    </div>
  );
}

function ViolationRow({
  violation,
  onNodeFocus,
}: {
  violation: Violation;
  onNodeFocus: (canvasNodeId: string) => void;
}) {
  const isError = violation.severity === 'error';
  const canNavigate = Boolean(violation.nodeId);

  const handleClick = () => {
    if (!violation.nodeId) return;
    const type = violation.nodeType ?? 'step';
    const canvasId = type === 'outcome' ? `outcome_${violation.nodeId}` : `step_${violation.nodeId}`;
    onNodeFocus(canvasId);
  };

  return (
    <div
      style={rowStyle(isError, canNavigate)}
      onClick={canNavigate ? handleClick : undefined}
      role={canNavigate ? 'button' : undefined}
      tabIndex={canNavigate ? 0 : undefined}
      onKeyDown={canNavigate ? (e) => { if (e.key === 'Enter') handleClick(); } : undefined}
    >
      <span style={iconStyle(isError)}>{isError ? '✕' : '⚠'}</span>
      <div style={messageCol}>
        <span style={codeStyle(isError)}>{violation.code}</span>
        <span style={messageStyle}>{violation.message}</span>
      </div>
      {canNavigate && <span style={arrowStyle}>›</span>}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 300,
  flexShrink: 0,
  background: '#fff',
  borderLeft: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  maxHeight: '50%',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderBottom: '1px solid #e2e8f0',
  background: '#f8fafc',
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#1e293b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  flex: 1,
};

const summaryStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexShrink: 0,
};

const errorBadge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  background: '#fef2f2',
  color: '#dc2626',
  border: '1px solid #fca5a5',
  borderRadius: 10,
  padding: '1px 6px',
};

const warnBadge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  background: '#fffbeb',
  color: '#d97706',
  border: '1px solid #fcd34d',
  borderRadius: 10,
  padding: '1px 6px',
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 16,
  color: '#94a3b8',
  cursor: 'pointer',
  padding: '0 2px',
  lineHeight: 1,
  flexShrink: 0,
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

function rowStyle(isError: boolean, clickable: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid #f1f5f9',
    cursor: clickable ? 'pointer' : 'default',
    transition: 'background 0.1s',
    background: isError ? '#fff8f8' : '#fffbeb',
  };
}

function iconStyle(isError: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    color: isError ? '#dc2626' : '#d97706',
    flexShrink: 0,
    marginTop: 1,
    width: 14,
    textAlign: 'center',
  };
}

const messageCol: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

function codeStyle(isError: boolean): React.CSSProperties {
  return {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: isError ? '#dc2626' : '#d97706',
    textTransform: 'uppercase',
  };
}

const messageStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#374151',
  lineHeight: 1.5,
  wordBreak: 'break-word',
};

const arrowStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#94a3b8',
  flexShrink: 0,
  lineHeight: 1,
  marginTop: 2,
};
