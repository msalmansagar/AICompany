import { useWorkflowStore } from '@/store/workflowStore';
import type { AutoSimSpeed } from '@/store/workflowStore';

interface AutoSimPlaybackHUDProps {
  onStop: () => void;
}

export function AutoSimPlaybackHUD({ onStop }: AutoSimPlaybackHUDProps) {
  const {
    autoSimPhase,
    autoSimSpeed,
    autoSimCurrentPathIndex,
    autoSimCurrentStepId,
    autoSimPathCount,
    autoSimCurrentPathEndReason,
    setAutoSimSpeed,
  } = useWorkflowStore((s) => ({
    autoSimPhase: s.autoSimPhase,
    autoSimSpeed: s.autoSimSpeed,
    autoSimCurrentPathIndex: s.autoSimCurrentPathIndex,
    autoSimCurrentStepId: s.autoSimCurrentStepId,
    autoSimPathCount: s.autoSimPaths.length,
    autoSimCurrentPathEndReason: s.autoSimPaths[s.autoSimCurrentPathIndex]?.endReason ?? null,
    setAutoSimSpeed: s.setAutoSimSpeed,
  }));

  const currentStepName = useWorkflowStore(
    (s) => (s.autoSimCurrentStepId ? s.steps[s.autoSimCurrentStepId]?.name ?? '' : '')
  );

  const pathLabel = `Path ${autoSimCurrentPathIndex + 1} of ${autoSimPathCount}`;
  const centerLabel = buildCenterLabel(autoSimPhase, autoSimCurrentStepId, currentStepName, autoSimCurrentPathEndReason);

  return (
    <div style={hudStyle}>
      <span style={pathCounterStyle}>{pathLabel}</span>

      <div style={dividerStyle} />

      <span style={stepLabelStyle}>{centerLabel}</span>

      <div style={rightGroupStyle}>
        <div style={speedGroupStyle}>
          <SpeedBtn label="Slow" speed="slow" active={autoSimSpeed === 'slow'} onSelect={setAutoSimSpeed} />
          <SpeedBtn label="Normal" speed="normal" active={autoSimSpeed === 'normal'} onSelect={setAutoSimSpeed} />
          <SpeedBtn label="Fast" speed="fast" active={autoSimSpeed === 'fast'} onSelect={setAutoSimSpeed} />
        </div>
        <div style={dividerStyle} />
        <button type="button" onClick={onStop} style={stopBtnStyle} title="Stop auto simulation">
          ■ Stop
        </button>
      </div>
    </div>
  );
}

function SpeedBtn({
  label,
  speed,
  active,
  onSelect,
}: {
  label: string;
  speed: AutoSimSpeed;
  active: boolean;
  onSelect: (s: AutoSimSpeed) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(speed)}
      style={{ ...speedBtnBase, ...(active ? speedBtnActive : speedBtnInactive) }}
    >
      {label}
    </button>
  );
}

function buildCenterLabel(
  phase: string | null,
  currentStepId: string | null,
  stepName: string,
  endReason: string | null
): string {
  if (phase === 'holding') {
    if (endReason === 'end') return '✓ Path complete';
    if (endReason === 'cycle') return '↩ Loop detected';
    return '⊘ Terminal step';
  }
  if (phase === 'playing' && currentStepId && stepName) return `▶ ${stepName}`;
  return 'Starting…';
}

const hudStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0 16px',
  background: '#ffffff',
  borderTop: '1px solid #e2e8f0',
  zIndex: 100,
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
};

const pathCounterStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#2563eb',
  flexShrink: 0,
  letterSpacing: '0.02em',
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: '#e2e8f0',
  flexShrink: 0,
};

const stepLabelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: '#64748b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const rightGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

const speedGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
};

const speedBtnBase: React.CSSProperties = {
  height: 24,
  padding: '0 10px',
  fontSize: 11,
  fontWeight: 500,
  borderRadius: 4,
  border: '1px solid #e2e8f0',
  cursor: 'pointer',
};

const speedBtnActive: React.CSSProperties = {
  background: '#2563eb',
  color: '#ffffff',
  borderColor: '#2563eb',
};

const speedBtnInactive: React.CSSProperties = {
  background: '#f8fafc',
  color: '#64748b',
};

const stopBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 4,
  border: '1px solid #e2e8f0',
  cursor: 'pointer',
  background: '#f8fafc',
  color: '#0f172a',
};
