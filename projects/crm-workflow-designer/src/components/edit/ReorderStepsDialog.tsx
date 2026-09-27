import { useMemo, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { stepAccent } from '@/styles/stepAccents';
import type { WorkflowStep } from '@/types/WorkflowTypes';

/**
 * Reordering without the one-notch shuffle (CWFD-016 B8).
 *
 * Order used to move a step a single place per click: getting step 30 to
 * position 5 was twenty-five clicks. This is the whole running order in one
 * list — drag a row, or type the number you want. Each move is one store
 * action, so one Ctrl+Z takes it back.
 */
export function ReorderStepsDialog({ onClose }: { onClose: () => void }) {
  const { steps, stepOrder, moveStepTo } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    moveStepTo: s.moveStepTo,
  }));

  const ordered = useMemo(
    () => stepOrder.map((id) => steps[id]).filter((s): s is WorkflowStep => Boolean(s)),
    [stepOrder, steps]
  );

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDrop = (targetIndex: number) => {
    if (draggingId) moveStepTo(draggingId, targetIndex);
    setDraggingId(null);
    setDropIndex(null);
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="dialog"
        style={{ width: 'min(560px, 94vw)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Reorder steps"
      >
        <div className="dialog-head">
          <h2>Reorder steps</h2>
        </div>

        <div className="dialog-body" style={bodyStyle}>
          <p className="hint-inline" style={{ margin: 0 }}>
            Drag a step, or type its position. Sequence numbers follow this order.
          </p>

          <div style={listStyle}>
            {ordered.map((step, index) => (
              <div
                key={step.crmId}
                draggable
                onDragStart={() => setDraggingId(step.crmId)}
                onDragEnd={() => { setDraggingId(null); setDropIndex(null); }}
                onDragOver={(e) => { e.preventDefault(); setDropIndex(index); }}
                onDrop={(e) => { e.preventDefault(); handleDrop(index); }}
                style={rowStyle(draggingId === step.crmId, dropIndex === index, stepAccent(step.crmId))}
              >
                <span style={gripStyle} aria-hidden>⠿</span>
                <input
                  type="number"
                  min={1}
                  max={ordered.length}
                  value={step.sequenceNo}
                  aria-label={`Position of ${step.name}`}
                  style={positionInputStyle}
                  onChange={(e) => {
                    const wanted = Number(e.target.value);
                    if (!Number.isFinite(wanted)) return;
                    moveStepTo(step.crmId, wanted - 1);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span style={nameStyle} title={step.name}>{step.name || 'Unnamed step'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dialog-foot">
          <button type="button" className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  maxHeight: '64vh',
  overflowY: 'auto',
};

const listStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };

function rowStyle(isDragging: boolean, isDropTarget: boolean, accent: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 10px',
    background: isDropTarget ? 'var(--primary-tint-2)' : 'var(--surface)',
    border: '1px solid var(--border)',
    borderLeft: `4px solid ${accent}`,
    borderRadius: 6,
    opacity: isDragging ? 0.45 : 1,
    cursor: 'grab',
  };
}

const gripStyle: React.CSSProperties = {
  color: 'var(--text-disabled)',
  fontSize: 13,
  flexShrink: 0,
};

const positionInputStyle: React.CSSProperties = {
  width: 52,
  height: 26,
  fontSize: 12,
  textAlign: 'center',
  border: '1px solid var(--border-strong)',
  borderRadius: 4,
  background: 'var(--surface)',
  color: 'var(--text)',
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
