import type { NodeProps } from '@xyflow/react';
import type { StageBandData } from '@/services/stageBands';

/**
 * A stage band: a tinted full-width strip labelled at the flow's edge, the
 * way BPMN draws phases. Pure scenery — it takes no pointer events, so the
 * graph on top of it stays fully interactive.
 */
export function StageBandNode({ data }: NodeProps) {
  const band = data as unknown as StageBandData;
  const isTB = band.layoutDir === 'TB';
  return (
    <div
      style={{
        width: band.bandWidth,
        height: band.bandHeight,
        background:
          band.tintIndex === 0
            ? 'color-mix(in srgb, var(--primary) 4%, transparent)'
            : 'color-mix(in srgb, var(--text) 3%, transparent)',
        borderTop: isTB ? '1px dashed var(--border)' : undefined,
        borderLeft: isTB ? undefined : '1px dashed var(--border)',
        pointerEvents: 'none',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      <span style={isTB ? labelTB : labelLR}>{band.label}</span>
    </div>
  );
}

const labelBase: React.CSSProperties = {
  position: 'absolute',
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-disabled)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  userSelect: 'none',
};

const labelTB: React.CSSProperties = {
  ...labelBase,
  top: 10,
  left: 16,
};

const labelLR: React.CSSProperties = {
  ...labelBase,
  top: 12,
  left: 14,
};
