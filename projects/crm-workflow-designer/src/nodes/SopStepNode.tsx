import { useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { SopStepNodeData } from '@/store/sopSelectors';
import { ROLE_STATUS, SOP_STEP_TYPE_META } from '@/types/SopTypes';
import type { SopStepType } from '@/types/SopTypes';
import { useSopStore } from '@/store/sopStore';
import { SopAddNodeToolbar } from './SopAddNodeToolbar';

export function SopStepNode({ data, selected }: NodeProps) {
  const d = data as unknown as SopStepNodeData;
  const stepType: SopStepType = d.stepType ?? 'step';
  const meta = SOP_STEP_TYPE_META[stepType];
  const isRoleInactive = d.roleStatus === ROLE_STATUS.INACTIVE;
  const isGeneric = stepType === 'step';

  const addTypedStepAfterStep = useSopStore((s) => s.addTypedStepAfterStep);

  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToolbar = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHovered(true);
  };

  const hideToolbar = () => {
    hideTimer.current = setTimeout(() => setHovered(false), 150);
  };

  return (
    <div style={{ position: 'relative' }} onMouseEnter={showToolbar} onMouseLeave={hideToolbar}>
      {hovered && (
        <SopAddNodeToolbar
          onAdd={(type) => addTypedStepAfterStep(d.stepId, type)}
          onMouseEnter={showToolbar}
          onMouseLeave={hideToolbar}
        />
      )}

      <div style={containerStyle(selected ?? false, d.hasError, meta.accent)}>
        <Handle type="target" position={Position.Top} id="in" style={targetHandleStyle(meta.accent)} />

        {!isGeneric && (
          <div style={typeBadgeStyle(meta.accent)}>
            {meta.icon && <span style={typeIconStyle}>{meta.icon}</span>}
            {meta.label}
          </div>
        )}

        <div style={headerStyle}>
          <span style={seqBadgeStyle(meta.accent)}>{d.sequenceNo}</span>
          {d.executionChannel && (
            <span style={channelBadgeStyle(d.executionChannel)}>
              {d.executionChannel === 'crm' ? 'CRM' : 'Manual'}
            </span>
          )}
          <span style={nameStyle}>{d.name || 'Unnamed Step'}</span>
        </div>

        {d.roleName ? (
          <div style={roleBadgeStyle(isRoleInactive, meta.accent)}>
            {d.roleName}
            {isRoleInactive && <span style={inactiveDotStyle} title="Role is inactive"> ●</span>}
          </div>
        ) : (
          <div style={noRoleStyle}>No role assigned</div>
        )}

        {d.description && (
          <p style={descPreviewStyle}>{d.description}</p>
        )}

        <Handle type="source" position={Position.Bottom} id="out" style={sourceHandleStyle(meta.accent)} />
      </div>
    </div>
  );
}

function containerStyle(selected: boolean, hasError: boolean, accent: string): React.CSSProperties {
  const borderColor = hasError ? '#ef4444' : selected ? accent : '#e2e8f0';
  const borderWidth = hasError || selected ? '2px' : '1.5px';
  const boxShadow = hasError
    ? '0 0 0 3px rgba(239,68,68,0.2)'
    : selected
    ? `0 0 0 3px ${accent}26`
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
    overflow: 'hidden',
  };
}

function typeBadgeStyle(accent: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
    color: accent, background: `${accent}14`,
    border: `1px solid ${accent}30`,
    borderRadius: 3, padding: '1px 6px',
    marginBottom: 6, textTransform: 'uppercase',
  };
}

const typeIconStyle: React.CSSProperties = { fontSize: 10 };

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7,
};

function seqBadgeStyle(accent: string): React.CSSProperties {
  return {
    background: accent, color: '#fff',
    borderRadius: 4, fontSize: 10, fontWeight: 700,
    padding: '1px 6px', flexShrink: 0,
  };
}

const nameStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#1e293b',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
};

function roleBadgeStyle(isInactive: boolean, accent: string): React.CSSProperties {
  return {
    fontSize: 10,
    background: isInactive ? '#f8fafc' : `${accent}14`,
    color: isInactive ? '#94a3b8' : accent,
    border: `1px solid ${isInactive ? '#e2e8f0' : `${accent}30`}`,
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

function channelBadgeStyle(channel: 'crm' | 'manual'): React.CSSProperties {
  const isCrm = channel === 'crm';
  return {
    fontSize: 8, fontWeight: 700, letterSpacing: '0.04em',
    color: isCrm ? '#1d4ed8' : '#92400e',
    background: isCrm ? '#dbeafe' : '#fef3c7',
    border: `1px solid ${isCrm ? '#bfdbfe' : '#fde68a'}`,
    borderRadius: 3, padding: '1px 5px',
    flexShrink: 0, lineHeight: '14px',
  };
}

const descPreviewStyle: React.CSSProperties = {
  margin: '5px 0 0',
  fontSize: 10,
  color: '#64748b',
  lineHeight: '1.4',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
};

function targetHandleStyle(accent: string): React.CSSProperties {
  return {
    background: '#94a3b8', width: 12, height: 12,
    border: `2px solid ${accent}`, borderRadius: '50%', top: -6,
  };
}

function sourceHandleStyle(accent: string): React.CSSProperties {
  return {
    background: accent, width: 12, height: 12,
    border: '2px solid #fff', borderRadius: '50%', bottom: -6,
  };
}
