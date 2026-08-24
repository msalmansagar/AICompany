import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export function ViewEndNode({ data }: NodeProps) {
  const d = data as { layoutDir?: string; compact?: boolean };
  const isLR = d.layoutDir === 'LR';

  // The compact form is the local end stub: a branch that terminates ends at
  // a small marker beside its own card instead of sweeping across the canvas
  // to the global END — BPMN's end-event-per-branch, at our scale.
  if (d.compact) {
    return (
      <div style={containerStyle} title="This branch ends the process here">
        <Handle
          type="target"
          position={isLR ? Position.Left : Position.Top}
          id="in"
          style={compactHandleStyle}
        />
        <div style={compactCircleStyle} />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <Handle
        type="target"
        position={isLR ? Position.Left : Position.Top}
        id="in"
        style={handleStyle}
      />
      <div style={circleStyle}>
        <span style={labelStyle}>END</span>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const circleStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  background: 'var(--error)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 8px color-mix(in srgb, var(--error) 40%, transparent)',
};

const compactCircleStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: 'var(--surface)',
  border: '3px solid var(--error)',
  boxShadow: '0 1px 4px color-mix(in srgb, var(--error) 25%, transparent)',
};

const compactHandleStyle: React.CSSProperties = {
  background: 'var(--error)',
  width: 6,
  height: 6,
  border: 'none',
  borderRadius: '50%',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-on-primary)',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.06em',
};

const handleStyle: React.CSSProperties = {
  background: 'var(--error)',
  width: 10,
  height: 10,
  border: '2px solid var(--border)',
  borderRadius: '50%',
};
