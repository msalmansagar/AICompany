import { useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { SopGatewayNodeData } from '@/store/sopSelectors';
import type { SopStepType } from '@/types/SopTypes';
import { useSopStore } from '@/store/sopStore';
import { SopAddNodeToolbar } from './SopAddNodeToolbar';

// Slightly wider diamond to fit a decision label phrase
const W      = 140;
const H      = 80;
const ACCENT = '#7c3aed';

export function SopGatewayNode({ data, selected }: NodeProps) {
  const d = data as unknown as SopGatewayNodeData;
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

  const isActive  = selected || d.isSelected;
  const bg        = d.hasError ? '#fff8f8' : isActive ? '#f5f3ff' : '#faf5ff';
  const border    = d.hasError ? '#ef4444' : ACCENT;
  const shadow    = d.hasError
    ? '0 0 0 3px rgba(239,68,68,0.2)'
    : isActive
    ? `0 0 0 3px ${ACCENT}30`
    : '0 2px 8px rgba(124,58,237,0.15)';

  const label = d.decisionLabel?.trim() || null;

  return (
    <div
      style={{ width: W, height: H, position: 'relative' }}
      onMouseEnter={showToolbar}
      onMouseLeave={hideToolbar}
    >
      {hovered && (
        <SopAddNodeToolbar
          onAdd={(type: SopStepType) => addTypedStepAfterStep(d.stepId, type)}
          onMouseEnter={showToolbar}
          onMouseLeave={hideToolbar}
        />
      )}

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{
          background: ACCENT, width: 10, height: 10,
          border: '2px solid #fff', borderRadius: '50%',
          left: -5, top: '50%', transform: 'translateY(-50%)',
        }}
      />

      {/* XOR gateway diamond */}
      <div style={{
        position: 'absolute', inset: 0,
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        background: bg,
        border: `2px solid ${border}`,
        boxShadow: shadow,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        cursor: 'pointer',
        padding: '0 24px',  // horizontal inset so text stays inside the diamond
      }}>
        {label ? (
          <span style={{
            fontSize: 10, fontWeight: 700, color: ACCENT,
            textAlign: 'center', lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            maxWidth: 72,
          }}>
            {label}
          </span>
        ) : (
          <>
            <span style={{ fontSize: 13, color: ACCENT, lineHeight: 1, fontWeight: 700 }}>✕</span>
            <span style={{ fontSize: 8, color: '#a78bfa', fontStyle: 'italic', lineHeight: 1 }}>
              set question
            </span>
          </>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{
          background: '#2563eb', width: 10, height: 10,
          border: '2px solid #fff', borderRadius: '50%',
          right: -5, top: '50%', transform: 'translateY(-50%)',
        }}
      />
    </div>
  );
}
