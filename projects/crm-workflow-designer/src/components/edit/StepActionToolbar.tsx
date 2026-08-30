import { NodeToolbar, Position } from '@xyflow/react';
import { create } from 'zustand';
import { useWorkflowStore, selectCanvasIsReadOnly } from '@/store/workflowStore';
import { confirm } from '@/components/ui/ConfirmDialog';
import { ToolbarIcon } from '@/components/common/ToolbarIcons';
import type { ToolbarIconName } from '@/components/common/ToolbarIcons';
import { ToolbarOverflow } from '@/components/common/ToolbarButton';
import { requestStepPanelTab } from './stepPanelBus';

/**
 * The floating action toolbar above a step card (CWFD-018).
 *
 * Rendered through React Flow's NodeToolbar, so it rides the node through
 * pan, zoom and drag while staying unscaled — icons keep their screen size
 * at any zoom. One toolbar at a time: hover claims it, and with nothing
 * hovered it belongs to the selected step.
 *
 * Every action delegates to functionality the designer already has — the
 * store's step operations, the shared confirm dialog, the step panel via
 * the tab bus. No business logic lives here.
 */

// ── Which card owns the toolbar ────────────────────────────────────────────
//
// A dedicated three-field store, NOT the workflow store: hover must never
// touch zundo's history or rebuild the blueprint. Only the cards whose
// visibility actually changes re-render.

interface ToolbarInteractionState {
  activeNodeId: string | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
  claim: (nodeId: string) => void;
  scheduleRelease: (nodeId: string) => void;
  cancelRelease: () => void;
}

/** The grace during which the cursor may travel from card to toolbar. */
const RELEASE_DELAY_MS = 250;

const useToolbarInteraction = create<ToolbarInteractionState>((set, get) => ({
  activeNodeId: null,
  hideTimer: null,
  claim: (nodeId) => {
    const { hideTimer } = get();
    if (hideTimer) clearTimeout(hideTimer);
    set({ activeNodeId: nodeId, hideTimer: null });
  },
  scheduleRelease: (nodeId) => {
    const { hideTimer } = get();
    if (hideTimer) clearTimeout(hideTimer);
    const timer = setTimeout(() => {
      // Only the card that scheduled the release may complete it — a claim
      // by another card in the meantime wins.
      if (get().activeNodeId === nodeId) set({ activeNodeId: null, hideTimer: null });
    }, RELEASE_DELAY_MS);
    set({ hideTimer: timer });
  },
  cancelRelease: () => {
    const { hideTimer } = get();
    if (hideTimer) clearTimeout(hideTimer);
    set({ hideTimer: null });
  },
}));

/** Hover handlers a step card spreads onto its outermost element. */
export function useStepToolbarHover(stepId: string): {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const claim = useToolbarInteraction((s) => s.claim);
  const scheduleRelease = useToolbarInteraction((s) => s.scheduleRelease);
  return {
    onMouseEnter: () => claim(stepId),
    onMouseLeave: () => scheduleRelease(stepId),
  };
}

// ── The toolbar itself ─────────────────────────────────────────────────────

export function StepActionToolbar({
  stepId,
  isSelected,
}: {
  stepId: string;
  isSelected: boolean;
}) {
  const isReadOnly = useWorkflowStore(selectCanvasIsReadOnly);
  // Hover claims the single toolbar; with nothing hovered it belongs to the
  // selected card. Selective subscription: only affected cards re-render.
  const isVisible = useToolbarInteraction((s) =>
    s.activeNodeId ? s.activeNodeId === stepId : isSelected
  );
  const cancelRelease = useToolbarInteraction((s) => s.cancelRelease);
  const scheduleRelease = useToolbarInteraction((s) => s.scheduleRelease);
  const stepIndex = useWorkflowStore((s) => s.stepOrder.indexOf(stepId));
  const stepCount = useWorkflowStore((s) => s.stepOrder.length);

  if (isReadOnly) return null;

  const store = () => useWorkflowStore.getState();

  const openPanelTab = (tab: Parameters<typeof requestStepPanelTab>[0]) => {
    store().selectNode(`step_${stepId}`);
    requestStepPanelTab(tab);
  };

  const handleDelete = () => {
    void confirm({
      title: 'Delete step',
      message: 'Delete this step? All connected outcomes will also be deleted.',
      tone: 'danger',
    }).then((confirmed) => {
      if (!confirmed) return;
      store().deleteStep(stepId);
      store().selectNode(null);
    });
  };

  return (
    <NodeToolbar
      isVisible={isVisible}
      position={Position.Top}
      align="center"
      offset={6}
      className="nodrag nopan"
    >
      <div
        role="toolbar"
        aria-label="Step actions"
        style={barStyle}
        onMouseEnter={cancelRelease}
        onMouseLeave={() => scheduleRelease(stepId)}
      >
        <ActionButton icon="edit" label="Edit step" onClick={() => openPanelTab('general')} />
        <ActionButton icon="person" label="Assignment" onClick={() => openPanelTab('assignment')} />
        <ActionButton icon="clone" label="Clone step" onClick={() => store().duplicateStep(stepId)} />
        <ActionButton icon="discard" label="Delete step" tone="danger" onClick={handleDelete} />
        <ToolbarOverflow
          label="More actions"
          items={[
            { icon: 'summary', label: 'Step details', onClick: () => openPanelTab('overview') },
            { icon: 'settings', label: 'SLA / escalation', onClick: () => openPanelTab('sla') },
            { icon: 'auto', label: 'Automation', onClick: () => openPanelTab('automation') },
            { icon: 'addStep', label: 'Add step after', onClick: () => store().addStepAfter(stepId) },
            {
              icon: 'undo',
              label: 'Move earlier',
              disabled: stepIndex <= 0,
              onClick: () => store().moveStepUp(stepId),
            },
            {
              icon: 'redo',
              label: 'Move later',
              disabled: stepIndex < 0 || stepIndex >= stepCount - 1,
              onClick: () => store().moveStepDown(stepId),
            },
          ]}
        />
      </div>
    </NodeToolbar>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: ToolbarIconName;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      className="cmd"
      title={label}
      aria-label={label}
      style={tone === 'danger' ? { ...buttonStyle, color: 'var(--error)' } : buttonStyle}
      // A press must never start a node drag or a canvas pan.
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <ToolbarIcon name={icon} />
    </button>
  );
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: 3,
  boxShadow: '0 4px 12px color-mix(in srgb, var(--text) 18%, transparent)',
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  padding: 0,
};
