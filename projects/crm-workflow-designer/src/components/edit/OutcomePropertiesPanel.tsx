import { useWorkflowStore } from '@/store/workflowStore';

interface OutcomePropertiesPanelProps {
  outcomeId: string | null;
}

export function OutcomePropertiesPanel({ outcomeId }: OutcomePropertiesPanelProps) {
  const { outcomes, setOutcome } = useWorkflowStore((s) => ({
    outcomes: s.outcomes,
    setOutcome: s.setOutcome,
  }));

  const rawId = outcomeId?.replace('outcome_', '') ?? null;
  const outcome = rawId ? outcomes[rawId] : null;

  if (!outcome) {
    return (
      <div style={panelStyle}>
        <div style={panelHeaderStyle}>Outcome Properties</div>
        <div style={emptyStyle}>No outcome selected</div>
      </div>
    );
  }

  const handleNameChange = (name: string) => {
    setOutcome({ ...outcome, name });
  };

  const handleSequenceNumberChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) setOutcome({ ...outcome, sequenceNumber: parsed });
  };

  const handleApplyFilterToggle = () => {
    setOutcome({ ...outcome, applyFilter: !outcome.applyFilter });
  };

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>Outcome Properties</div>

      <div style={panelBodyStyle}>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={outcome.name}
            onChange={(e) => handleNameChange(e.target.value)}
            style={inputStyle}
            placeholder="Outcome name"
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Sequence Number</label>
          <input
            type="number"
            value={outcome.sequenceNumber}
            onChange={(e) => handleSequenceNumberChange(e.target.value)}
            style={inputStyle}
            min={1}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Apply Filter</label>
          <button
            type="button"
            role="switch"
            aria-checked={outcome.applyFilter}
            onClick={handleApplyFilterToggle}
            style={{
              ...toggleStyle,
              ...(outcome.applyFilter ? toggleOnStyle : toggleOffStyle),
            }}
          >
            {outcome.applyFilter ? 'Yes' : 'No'}
          </button>
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  background: '#0f172a',
  borderLeft: '1px solid #1e293b',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const panelHeaderStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #1e293b',
  flexShrink: 0,
};

const panelBodyStyle: React.CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  overflowY: 'auto',
  flex: 1,
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  height: 30,
  padding: '0 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const toggleStyle: React.CSSProperties = {
  width: 60,
  height: 28,
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
};

const toggleOnStyle: React.CSSProperties = {
  background: '#065f46',
  color: '#6ee7b7',
};

const toggleOffStyle: React.CSSProperties = {
  background: '#334155',
  color: '#94a3b8',
};

const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: '#475569',
  fontStyle: 'italic',
};
