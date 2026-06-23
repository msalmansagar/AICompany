import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useSopStore } from '@/store/sopStore';
import type { SopOutcomeNodeData } from '@/store/sopSelectors';

export function SopOutcomeNode({ data, selected }: NodeProps) {
  const d = data as unknown as SopOutcomeNodeData;
  const addStepAfterOutcome = useSopStore((s) => s.addStepAfterOutcome);

  function handleAddStep(e: React.MouseEvent) {
    e.stopPropagation();
    addStepAfterOutcome(d.outcomeId);
  }

  return (
    <div style={containerStyle(selected ?? false, d.hasError)}>
      <Handle type="target" position={Position.Left} id="in" style={targetHandleStyle} />

      <span style={nameStyle}>{d.name || 'Outcome'}</span>
      <span style={seqStyle}>{d.sequenceNo}</span>

      {!d.nextSopStepId && (
        <button type="button" style={addBtnStyle} onClick={handleAddStep} title="Add next step">
          +
        </button>
      )}

      <Handle type="source" position={Position.Right} id="out" style={sourceHandleStyle} />
    </div>
  );
}

function containerStyle(selected: boolean, hasError: boolean): React.CSSProperties {
  const borderColor = hasError ? '#ef4444' : selected ? '#0f766e' : '#99f6e4';
  const borderWidth = hasError || selected ? '2px' : '1.5px';
  const boxShadow = hasError
    ? '0 0 0 3px rgba(239,68,68,0.2)'
    : selected
    ? '0 0 0 3px rgba(15,118,110,0.15)'
    : '0 1px 4px rgba(0,0,0,0.08)';
  return {
    position: 'relative',
    background: hasError ? '#fff8f8' : '#f0fdf4',
    border: `${borderWidth} solid ${borderColor}`,
    borderRadius: 20, padding: '5px 14px',
    display: 'flex', alignItems: 'center', gap: 6,
    minWidth: 80,
    boxShadow,
    transition: 'border-color 0.15s',
    cursor: 'pointer',
  };
}

const nameStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#0f766e', whiteSpace: 'nowrap',
};

const seqStyle: React.CSSProperties = {
  fontSize: 10, color: '#94a3b8', fontWeight: 500,
};

const addBtnStyle: React.CSSProperties = {
  width: 18, height: 18, borderRadius: '50%',
  background: '#0f766e', border: 'none',
  color: '#fff', fontSize: 14, fontWeight: 700, lineHeight: '16px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', padding: 0, flexShrink: 0,
  boxShadow: '0 1px 4px rgba(15,118,110,0.4)',
};

const targetHandleStyle: React.CSSProperties = {
  background: '#0f766e', width: 10, height: 10,
  border: '2px solid #fff', borderRadius: '50%', left: -5,
};

const sourceHandleStyle: React.CSSProperties = {
  background: '#2563eb', width: 10, height: 10,
  border: '2px solid #fff', borderRadius: '50%', right: -5,
};
