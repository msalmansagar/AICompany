import type { NodeProps } from '@xyflow/react';
import type { ParallelGroupData } from '@/services/parallelGroups';

/**
 * The tinted box around steps that run at the same time (CWFD-017 PR4).
 * Pure scenery, like the stage bands: no pointer events, dashed outline so
 * it reads as a grouping and not as a card, label naming the step the group
 * runs alongside.
 */
export function ParallelGroupNode({ data }: NodeProps) {
  const group = data as unknown as ParallelGroupData;
  return (
    <div
      style={{
        width: group.groupWidth,
        height: group.groupHeight,
        background: 'color-mix(in srgb, var(--accent-branch) 6%, transparent)',
        border: '1.5px dashed var(--accent-branch)',
        borderRadius: 12,
        pointerEvents: 'none',
        position: 'relative',
        boxSizing: 'border-box',
        opacity: 0.9,
      }}
    >
      <span style={labelStyle}>{group.label}</span>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 5,
  left: 12,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--accent-branch)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 'calc(100% - 24px)',
  pointerEvents: 'none',
  userSelect: 'none',
};
