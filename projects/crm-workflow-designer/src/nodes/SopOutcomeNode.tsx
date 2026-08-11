import { useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useSopStore } from '@/store/sopStore';
import type { SopOutcomeNodeData } from '@/store/sopSelectors';
import { SopAddNodeToolbar } from './SopAddNodeToolbar';

const W = 130;
const H = 72;
const ACCENT = 'var(--accent-route)';

export function SopOutcomeNode({ data, selected }: NodeProps) {
  const d = data as unknown as SopOutcomeNodeData;
  const addTypedStepAfterOutcome = useSopStore((s) => s.addTypedStepAfterOutcome);

  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToolbar = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHovered(true);
  };

  const hideToolbar = () => {
    hideTimer.current = setTimeout(() => setHovered(false), 150);
  };

  const showAddToolbar = hovered && !d.nextSopStepId;

  const borderColor = d.hasError ? 'var(--error)' : selected ? ACCENT : ACCENT;
  const bg          = d.hasError ? 'var(--error)' : selected ? 'var(--accent-route)' : 'var(--success)';
  const shadow      = d.hasError
    ? '0 0 0 3px rgba(239,68,68,0.2)'
    : selected
    ? `0 0 0 3px ${ACCENT}30`
    : '0 2px 8px rgba(15,118,110,0.15)';

  return (
    <div
      style={{ width: W, height: H, position: 'relative' }}
      onMouseEnter={showToolbar}
      onMouseLeave={hideToolbar}
    >
      {showAddToolbar && (
        <SopAddNodeToolbar
          onAdd={(type) => addTypedStepAfterOutcome(d.outcomeId, type)}
          onMouseEnter={showToolbar}
          onMouseLeave={hideToolbar}
        />
      )}

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: ACCENT, width: 10, height: 10, border: '2px solid var(--border)', borderRadius: '50%', left: -5, top: '50%', transform: 'translateY(-50%)' }}
      />

      <div style={{
        position: 'absolute', inset: 0,
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        background: bg,
        border: `2px solid ${borderColor}`,
        boxShadow: shadow,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 2,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        cursor: 'pointer',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: ACCENT,
          maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', textAlign: 'center',
        }}>
          {d.name || 'Outcome'}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-disabled)', fontWeight: 500 }}>
          {d.sequenceNo}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: 'var(--primary)', width: 10, height: 10, border: '2px solid var(--border)', borderRadius: '50%', right: -5, top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  );
}
