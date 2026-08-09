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

  const store = useSopStore();

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
                    <th>Name</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th className="num">Derived processes</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sops.map((sop) => (
                    <tr key={sop.id}>
                      <td style={{ fontWeight: 600 }}>{sop.name}</td>
                      <td><StatusBadge status={sop.status} /></td>
                      <td style={{ color: 'var(--text-secondary)' }}>v{sop.version || '1.0'}</td>
                      <td className="num">{sop.derivedProcessCount}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button type="button" className="btn sm" onClick={() => void handleEditSop(sop.id)}>
                            Edit
                          </button>
                          {sop.status === SOP_STATUS.PUBLISHED && (
                            <button
                              type="button"
                              className="btn sm primary"
                              onClick={() => void handleOpenCreateProcessWizard(sop)}
                            >
                              Create process
                            </button>
                          )}
                          {sop.status === SOP_STATUS.DRAFT && (
                            <button
                              type="button"
                              className="btn sm danger"
                              onClick={() => void handleDeleteSop(sop)}
                            >
                              Retire
                            </button>
                          )}
                        </div>
                      </td>
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
  const config: Record<number, { label: string; bg: string; color: string; border: string }> = {
    [SOP_STATUS.DRAFT]: { label: 'Draft', bg: 'var(--warning-bg)', color: 'var(--warning)', border: 'var(--warning)' },
    [SOP_STATUS.PUBLISHED]: { label: 'Published', bg: 'var(--success-bg)', color: 'var(--success)', border: 'var(--success)' },
    [SOP_STATUS.RETIRED]: { label: 'Retired', bg: 'var(--surface-alt)', color: 'var(--text-secondary)', border: 'var(--border)' },
  };
  const c = config[status] ?? config[SOP_STATUS.DRAFT];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      borderRadius: 4, padding: '2px 7px',
    }}>
      {c.label}
    </span>
  );
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
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={dialogCardStyle}>
        <div style={dialogHeaderStyle}>
          <span style={dialogTitleStyle}>New SOP</span>
          <button type="button" style={dialogCloseBtnStyle} onClick={onClose}>×</button>
        </div>
        <div style={dialogBodyStyle}>
          <div style={fieldGroupStyle}>
            <label style={fieldLabelStyle}>SOP Name <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter SOP name"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div style={fieldGroupStyle}>
            <label style={fieldLabelStyle}>Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0"
              style={inputStyle}
            />
          </div>
        </div>
        <div style={dialogFooterStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose}>Cancel</button>
          <button
            type="button"
            style={name.trim() ? confirmBtnStyle : confirmBtnDisabledStyle}
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

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
};

const dialogCardStyle: React.CSSProperties = {
  width: 400, background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  display: 'flex', flexDirection: 'column',
};

const dialogHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '18px 24px 14px', borderBottom: '1px solid var(--border)',
};

const dialogTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--text)' };
const dialogCloseBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--text-disabled)',
  fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0,
};

const dialogBodyStyle: React.CSSProperties = {
  padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16,
};

const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
const fieldLabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text)' };

const inputStyle: React.CSSProperties = {
  height: 34, padding: '0 10px', background: 'var(--surface)',
  border: '1px solid var(--border-strong)', borderRadius: 6,
  color: 'var(--text)', fontSize: 13, outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

const dialogFooterStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
  padding: '14px 24px', borderTop: '1px solid var(--border)',
  background: 'var(--surface-alt)', borderRadius: '0 0 12px 12px',
};

const cancelBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 18px', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};

const confirmBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 18px', background: 'var(--accent-route)',
  border: 'none', borderRadius: 6, color: 'var(--text-on-primary)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const confirmBtnDisabledStyle: React.CSSProperties = {
  ...confirmBtnStyle, background: 'var(--accent-route-bg)', cursor: 'not-allowed',
};

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
