// src/components/SopListScreen/SopListScreen.tsx
import { useState, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useSopStore } from '@/store/sopStore';
import { SopCanvas } from '@/components/SopCanvas/SopCanvas';
import { CreateProcessWizardModal } from '@/components/CreateProcessWizard/CreateProcessWizardModal';
import { SOP_STATUS } from '@/types/SopTypes';
import type { SopSummary, Sop, SopStep } from '@/types/SopTypes';
import { emptyEscalationFields } from '@/services/escalationFields';
import type { ISopAdapter } from '@/services/ISopAdapter';
import { confirm } from '@/components/ui/ConfirmDialog';
import { notify } from '@/components/ui/Notify';

type ScreenView = 'list' | 'canvas';

interface SopListScreenProps {
  adapter: ISopAdapter;
  onBack(): void;
  onManageRoles(): void;
}

export function SopListScreen({ adapter, onBack, onManageRoles }: SopListScreenProps) {
  const [view, setView] = useState<ScreenView>('list');
  const [sops, setSops] = useState<SopSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCanvas, setIsLoadingCanvas] = useState(false);
  const [canvasLoadLabel, setCanvasLoadLabel] = useState('Loading SOP…');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [wizardSop, setWizardSop] = useState<Sop | null>(null);
  const [wizardSteps, setWizardSteps] = useState<SopStep[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const store = useSopStore();

  // Actions live on the command bar and read the selected row, so which of them
  // apply is a property of the selection rather than of a button inside a row.
  const selectedSop = sops.find((s) => s.id === selectedId) ?? null;
  const canCreateProcess = selectedSop?.status === SOP_STATUS.PUBLISHED;
  const canRetire = selectedSop?.status === SOP_STATUS.DRAFT;

  const loadSops = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    adapter.getSopList()
      .then(setSops)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load SOPs.');
      })
      .finally(() => setIsLoading(false));
  }, [adapter]);

  useEffect(() => {
    loadSops();
  }, [loadSops]);

  const handleEditSop = useCallback(async (sopId: string) => {
    setIsLoadingCanvas(true);
    setCanvasLoadLabel('Loading SOP…');
    try {
      const [sop, steps, roles] = await Promise.all([
        adapter.getSop(sopId),
        adapter.getSopSteps(sopId),
        adapter.getRoles(),
      ]);

      const roleById = new Map(roles.map((r) => [r.id, r]));

      setCanvasLoadLabel(`Loading ${steps.length} steps…`);
      const outcomeArrays = await Promise.all(
        steps.map((s) => adapter.getSopOutcomes(s.id))
      );
      const allOutcomes = outcomeArrays.flat();

      store.resetSopCanvas();
      store.setSop(sop);

      steps.forEach((step) => {
        const role = step.roleId ? roleById.get(step.roleId) : null;
        const enrichedStep = {
          ...step,
          roleName: role?.name ?? step.roleName,
          roleStatus: role?.status ?? step.roleStatus,
        };
        store.addStep(enrichedStep, { x: 0, y: 0 });
      });

      const outcomesByStep = new Map<string, typeof allOutcomes>();
      allOutcomes.forEach((o) => {
        const list = outcomesByStep.get(o.sopStepId) ?? [];
        list.push(o);
        outcomesByStep.set(o.sopStepId, list);
      });

      steps.forEach((step) => {
        const stepOutcomes = outcomesByStep.get(step.id) ?? [];
        stepOutcomes.forEach((o) => {
          store.addOutcome(o);
        });
      });

      store.markSaved();
      store.setSop(sop);

      setView('canvas');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load SOP.');
    } finally {
      setIsLoadingCanvas(false);
    }
  }, [adapter, store]);

  const handleCanvasBack = useCallback(() => {
    store.resetSopCanvas();
    setView('list');
    loadSops();
  }, [store, loadSops]);

  const handleDeleteSop = useCallback(async (sop: SopSummary) => {
    if (sop.status !== SOP_STATUS.DRAFT) {
      notify('Only Draft SOPs can be deleted. Retire the SOP first.', 'error');
      return;
    }
    if (sop.derivedProcessCount > 0) {
      notify('This SOP has derived processes and cannot be deleted.', 'error');
      return;
    }
    const confirmed = await confirm({
      title: 'Delete SOP',
      message: `Delete SOP "${sop.name}"? This cannot be undone.`,
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      // No deleteSop in ISopAdapter — mark as retired instead
      await adapter.updateSop(sop.id, { status: SOP_STATUS.RETIRED });
      loadSops();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }, [adapter, loadSops]);

  const handleOpenCreateProcessWizard = useCallback(async (summary: SopSummary) => {
    setIsLoadingCanvas(true);
    setCanvasLoadLabel('Loading process wizard…');
    try {
      const [sop, steps] = await Promise.all([
        adapter.getSop(summary.id),
        adapter.getSopSteps(summary.id),
      ]);
      setWizardSop(sop);
      setWizardSteps(steps);
      setShowWizard(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load SOP details.', 'error');
    } finally {
      setIsLoadingCanvas(false);
    }
  }, [adapter]);

  const handleNewSop = useCallback(async (name: string, version: string) => {
    try {
      const tmpId = `tmp_sop_${crypto.randomUUID()}`;
      const newSop: Sop = {
        id: tmpId, name, description: '', purpose: '',
        status: SOP_STATUS.DRAFT, version,
        recordTypeId: null, recordTypeName: null,
      };
      store.resetSopCanvas();
      store.initNewSop(newSop);
      store.addStep(
        {
          id: `tmp_step_${crypto.randomUUID()}`,
          name: 'Step 1', description: '',
          sequenceNo: 1, sopId: tmpId,
          roleId: null, roleName: null, roleStatus: null,
          ...emptyEscalationFields(),
          stepType: 'step' as const,
        },
        { x: 300, y: 80 }
      );
      setShowCreateDialog(false);
      setView('canvas');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to create SOP.', 'error');
    }
  }, [store]);

  if (view === 'canvas') {
    return (
      <ReactFlowProvider>
        <SopCanvas adapter={adapter} onBack={handleCanvasBack} />
      </ReactFlowProvider>
    );
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Full-screen overlay while fetching canvas data */}
      {isLoadingCanvas && (
        <div style={canvasOverlayStyle}>
          <div style={canvasLoadCardStyle}>
            <span style={spinnerLargeStyle} />
            <span style={canvasLoadTitleStyle}>{canvasLoadLabel}</span>
            <span style={canvasLoadSubStyle}>Please wait…</span>
          </div>
        </div>
      )}

      <div className="cmdbar">
        <button type="button" className="cmd primary" onClick={() => setShowCreateDialog(true)}>
          + New SOP
        </button>
        <span className="cmd-sep" />
        <button
          type="button"
          className="cmd"
          disabled={!selectedSop}
          onClick={() => selectedSop && void handleEditSop(selectedSop.id)}
        >
          Edit
        </button>
        <button
          type="button"
          className="cmd"
          disabled={!canCreateProcess}
          title={
            selectedSop && !canCreateProcess
              ? 'Only a published SOP can be turned into a process'
              : undefined
          }
          onClick={() => selectedSop && void handleOpenCreateProcessWizard(selectedSop)}
        >
          Create process
        </button>
        <button
          type="button"
          className="cmd danger"
          disabled={!canRetire}
          title={selectedSop && !canRetire ? 'Only a draft SOP can be retired' : undefined}
          onClick={() => selectedSop && void handleDeleteSop(selectedSop)}
        >
          Retire
        </button>
        <span className="cmd-sep" />
        <button type="button" className="cmd" onClick={loadSops} disabled={isLoading}>
          Refresh
        </button>
        <button type="button" className="cmd" onClick={onManageRoles}>
          Manage roles
        </button>
        <span className="cmd-spacer" />
        <button type="button" className="cmd" onClick={onBack}>
          ← Processes
        </button>
      </div>

      {loadError && <div className="message-bar" role="alert">{loadError}</div>}

      <div className="scroll">
        <div className="page">
          <div className="page-head">
            <div>
              <h1>SOP Designer</h1>
              <div className="page-sub">
                Standard operating procedures · the templates workflow processes are derived from
              </div>
            </div>
          </div>

          <div className="grid-wrap">
            {isLoading ? (
              <div className="empty-state">
                <span className="spinner" />
                <span>Loading SOPs…</span>
              </div>
            ) : sops.length === 0 ? (
              <div className="empty-state">
                <span className="es-title">No SOPs yet</span>
                <span>Create your first standard operating procedure.</span>
                <button type="button" className="btn primary" onClick={() => setShowCreateDialog(true)}>
                  + New SOP
                </button>
              </div>
            ) : (
              <table className="grid" role="grid">
                <thead>
                  <tr>
                    <th className="row-check" />
                    <th>Name</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th className="num">Derived processes</th>
                  </tr>
                </thead>
                <tbody>
                  {sops.map((sop) => (
                    <tr
                      key={sop.id}
                      className={sop.id === selectedId ? 'selected' : undefined}
                      style={{ cursor: 'pointer' }}
                      aria-selected={sop.id === selectedId}
                      onClick={() => setSelectedId(sop.id === selectedId ? null : sop.id)}
                      onDoubleClick={() => void handleEditSop(sop.id)}
                    >
                      <td className="row-check">
                        <div className="box">
                          {sop.id === selectedId && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                              <path d="M1 4l3 3L9 1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="link-cell"
                          onClick={(e) => { e.stopPropagation(); void handleEditSop(sop.id); }}
                        >
                          {sop.name}
                        </button>
                      </td>
                      <td><StatusBadge status={sop.status} /></td>
                      <td style={{ color: 'var(--text-secondary)' }}>v{sop.version || '1.0'}</td>
                      <td className="num">{sop.derivedProcessCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showCreateDialog && (
        <CreateSopDialog
          onConfirm={handleNewSop}
          onClose={() => setShowCreateDialog(false)}
        />
      )}

      {showWizard && wizardSop && (
        <CreateProcessWizardModal
          sop={wizardSop}
          sopSteps={wizardSteps}
          isOpen={showWizard}
          onDismiss={() => setShowWizard(false)}
          onSuccess={(newProcessId) => {
            setShowWizard(false);
            notify(`Process created successfully (ID: ${newProcessId.slice(0, 8)}…)`, 'success');
          }}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: number }) {
  const pill: Record<number, { className: string; label: string }> = {
    [SOP_STATUS.DRAFT]: { className: 'pill warning', label: 'Draft' },
    [SOP_STATUS.PUBLISHED]: { className: 'pill published', label: 'Published' },
    [SOP_STATUS.RETIRED]: { className: 'pill archived', label: 'Retired' },
  };
  const chosen = pill[status] ?? pill[SOP_STATUS.DRAFT];
  return <span className={chosen.className}>{chosen.label}</span>;
}

function CreateSopDialog({
  onConfirm,
  onClose,
}: {
  onConfirm(name: string, version: string): void;
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0');

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="dialog-backdrop"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="New SOP"
    >
      <div className="dialog" style={{ width: 440 }}>
        <div className="dialog-head"><h2>New SOP</h2></div>
        <div className="dialog-body">
          <div className="field-grid">
            <div className="field col-2">
              <label className="lbl" htmlFor="sop-name">SOP name<span className="req">*</span></label>
              <input
                id="sop-name"
                type="text"
                className="fluent-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter SOP name"
                autoFocus
              />
            </div>
            <div className="field col-2">
              <label className="lbl" htmlFor="sop-version">Version</label>
              <input
                id="sop-version"
                type="text"
                className="fluent-input"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0"
              />
            </div>
          </div>
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => { if (name.trim()) onConfirm(name.trim(), version.trim() || '1.0'); }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Styles ---

const canvasOverlayStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, zIndex: 9500,
  background: 'rgba(248,250,252,0.88)',
  backdropFilter: 'blur(3px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const canvasLoadCardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  background: 'var(--surface)', borderRadius: 12, padding: '32px 48px',
  border: '1px solid var(--border)',
  boxShadow: '0 8px 32px rgba(15,23,42,0.10)',
};

const spinnerLargeStyle: React.CSSProperties = {
  display: 'inline-block', width: 36, height: 36,
  border: '3px solid var(--border)', borderTopColor: 'var(--accent-route)',
  borderRadius: '50%', animation: 'spin 0.75s linear infinite',
};

const canvasLoadTitleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: 'var(--text)',
};

const canvasLoadSubStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-secondary)',
};
