// src/nodes/SopStepNode.tsx
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { SopStepNodeData } from '@/store/sopSelectors';
import { ROLE_STATUS } from '@/types/SopTypes';

export function SopStepNode({ data, selected }: NodeProps) {
  const d = data as unknown as SopStepNodeData;
  const isRoleInactive = d.roleStatus === ROLE_STATUS.INACTIVE;

  return (
    <div style={containerStyle(selected ?? false, d.hasError)}>
      <Handle type="target" position={Position.Top} id="in" style={targetHandleStyle} />

      <div style={headerStyle}>
        <span style={seqBadgeStyle}>{d.sequenceNo}</span>
        <span style={nameStyle}>{d.name || 'Unnamed Step'}</span>
      </div>

      {d.roleName ? (
        <div style={roleBadgeStyle(isRoleInactive)}>
          {d.roleName}
          {isRoleInactive && <span style={inactiveDotStyle} title="Role is inactive"> ●</span>}
        </div>
      ) : (
        <div style={noRoleStyle}>No role assigned</div>
      )}

      <Handle type="source" position={Position.Bottom} id="out" style={sourceHandleStyle} />
    </div>
  );
}

function containerStyle(selected: boolean, hasError: boolean): React.CSSProperties {
  const borderColor = hasError ? '#ef4444' : selected ? '#2563eb' : '#e2e8f0';
  const borderWidth = hasError || selected ? '2px' : '1.5px';
  const boxShadow = hasError
    ? '0 0 0 3px rgba(239,68,68,0.2)'
    : selected
    ? '0 0 0 3px rgba(37,99,235,0.15)'
    : '0 2px 8px rgba(0,0,0,0.08)';
  return {
    background: hasError ? '#fff8f8' : '#fff',
    border: `${borderWidth} solid ${borderColor}`,
    borderRadius: 8,
    padding: '10px 14px',
    minWidth: 180,
    maxWidth: 240,
    boxShadow,
    transition: 'border-color 0.15s, box-shadow 0.15s',
    fontFamily: 'inherit',
    cursor: 'pointer',
  };
}

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7,
};

const seqBadgeStyle: React.CSSProperties = {
  background: '#0f766e', color: '#fff',
  borderRadius: 4, fontSize: 10, fontWeight: 700,
  padding: '1px 6px', flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#1e293b',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
};

function roleBadgeStyle(isInactive: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    background: isInactive ? '#f8fafc' : '#ccfbf1',
    color: isInactive ? '#94a3b8' : '#0f766e',
    border: `1px solid ${isInactive ? '#e2e8f0' : '#99f6e4'}`,
    borderRadius: 4, padding: '2px 8px',
    display: 'inline-flex', alignItems: 'center', gap: 2,
    maxWidth: '100%', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
}

const noRoleStyle: React.CSSProperties = {
  fontSize: 10, color: '#cbd5e1', fontStyle: 'italic',
};

const inactiveDotStyle: React.CSSProperties = { color: '#f59e0b', fontSize: 8 };

const targetHandleStyle: React.CSSProperties = {
  background: '#94a3b8', width: 12, height: 12,
  border: '2px solid #fff', borderRadius: '50%', top: -6,
};

const sourceHandleStyle: React.CSSProperties = {
  background: '#0f766e', width: 12, height: 12,
  border: '2px solid #fff', borderRadius: '50%', bottom: -6,
};
