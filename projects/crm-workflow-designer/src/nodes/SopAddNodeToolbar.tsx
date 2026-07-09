import { SOP_STEP_TYPE_META } from '@/types/SopTypes';
import type { SopStepType } from '@/types/SopTypes';

const ROW_1: SopStepType[] = ['step', 'approval', 'milestone', 'manual'];
const ROW_2: SopStepType[] = ['system', 'notification', 'wait', 'subprocess'];

interface SopAddNodeToolbarProps {
  onAdd(type: SopStepType): void;
  onMouseEnter(): void;
  onMouseLeave(): void;
}

export function SopAddNodeToolbar({ onAdd, onMouseEnter, onMouseLeave }: SopAddNodeToolbarProps) {
  return (
    <div
      style={toolbarStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {[ROW_1, ROW_2].map((row, rowIndex) => (
        <div key={rowIndex} style={rowStyle}>
          {row.map((type) => {
            const meta = SOP_STEP_TYPE_META[type];
            return (
              <button
                key={type}
                type="button"
                title={meta.label}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onAdd(type); }}
                style={btnStyle(meta.accent)}
              >
                <span style={iconStyle}>{meta.icon || '▭'}</span>
                <span style={labelStyle}>{meta.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      ))}
      <div style={arrowStyle} />
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 10px)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 2000,
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '6px 6px 4px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  minWidth: 192,
  pointerEvents: 'all',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
};

function btnStyle(accent: string): React.CSSProperties {
  return {
    width: 44, height: 36,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2,
    background: '#f8fafc',
    border: `1px solid #e2e8f0`,
    borderRadius: 6,
    cursor: 'pointer',
    padding: 0,
    transition: 'background 0.1s, border-color 0.1s',
    color: accent,
  };
}

const iconStyle: React.CSSProperties = {
  fontSize: 13, lineHeight: 1,
};

const labelStyle: React.CSSProperties = {
  fontSize: 8, fontWeight: 600, color: '#64748b',
  letterSpacing: '0.02em', lineHeight: 1,
};

const arrowStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: -5,
  left: '50%',
  transform: 'translateX(-50%) rotate(45deg)',
  width: 8, height: 8,
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderTop: 'none',
  borderLeft: 'none',
};
