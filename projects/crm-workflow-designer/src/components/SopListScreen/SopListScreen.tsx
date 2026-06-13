// src/components/SopListScreen/SopListScreen.tsx
import { useState, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useSopStore } from '@/store/sopStore';
import { SopCanvas } from '@/components/SopCanvas/SopCanvas';
import { CreateProcessWizardModal } from '@/components/CreateProcessWizard/CreateProcessWizardModal';
import { SOP_STATUS } from '@/types/SopTypes';
import type { SopSummary, Sop, SopStep } from '@/types/SopTypes';
import type { ISopAdapter } from '@/services/ISopAdapter';

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
    try {
      const [sop, steps, roles] = await Promise.all([
        adapter.getSop(sopId),
        adapter.getSopSteps(sopId),
        adapter.getRoles(),
      ]);

      const roleById = new Map(roles.map((r) => [r.id, r]));

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
          // swimlane layout computes positions — no manual position needed
        });
      });

      // After loading, mark not dirty
      store.markSaved();
      store.setSop(sop);

      setView('canvas');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load SOP.');
    }
  }, [adapter, store]);

  const handleCanvasBack = useCallback(() => {
    store.resetSopCanvas();
    setView('list');
    loadSops();
  }, [store, loadSops]);

  const handleDeleteSop = useCallback(async (sop: SopSummary) => {
    if (sop.status !== SOP_STATUS.DRAFT) {
      alert('Only Draft SOPs can be deleted. Retire the SOP first.');
      return;
    }
    if (sop.derivedProcessCount > 0) {
      alert('This SOP has derived processes and cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete SOP "${sop.name}"? This cannot be undone.`)) return;
    try {
      // No deleteSop in ISopAdapter — mark as retired instead
      await adapter.updateSop(sop.id, { status: SOP_STATUS.RETIRED });
      loadSops();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed.');
    }
  }, [adapter, loadSops]);

  const handleOpenCreateProcessWizard = useCallback(async (summary: SopSummary) => {
    try {
      const [sop, steps] = await Promise.all([
        adapter.getSop(summary.id),
        adapter.getSopSteps(summary.id),
      ]);
      setWizardSop(sop);
      setWizardSteps(steps);
      setShowWizard(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load SOP details.');
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
        },
        { x: 300, y: 80 }
      );
      setShowCreateDialog(false);
      setView('canvas');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create SOP.');
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
    <div style={shellStyle}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          <button type="button" style={backBtnStyle} onClick={onBack}>
            ← Processes
          </button>
          <div>
            <div style={pageTitleStyle}>SOP Designer</div>
            <div style={pageSubtitleStyle}>Standard Operating Procedures</div>
          </div>
        </div>
        <div style={headerRightStyle}>
          <button type="button" style={rolesBtn} onClick={onManageRoles}>
            Manage Roles
          </button>
          <button type="button" style={newSopBtnStyle} onClick={() => setShowCreateDialog(true)}>
            + New SOP
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {isLoading && (
          <div style={spinnerCenterStyle}>
            <span style={spinnerStyle} /> Loading SOPs…
          </div>
        )}

        {loadError && (
          <div style={errorBannerStyle}>{loadError}</div>
        )}

        {!isLoading && !loadError && sops.length === 0 && (
          <div style={emptyStateStyle}>
            <div style={emptyIconStyle}>📋</div>
            <div style={emptyTitleStyle}>No SOPs yet</div>
            <div style={emptySubStyle}>Create your first Standard Operating Procedure.</div>
            <button type="button" style={emptyNewBtnStyle} onClick={() => setShowCreateDialog(true)}>
              + New SOP
            </button>
          </div>
        )}

        {!isLoading && sops.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Version</th>
                <th style={thStyle}>Derived Processes</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sops.map((sop) => (
                <tr key={sop.id} style={tbodyRowStyle}>
                  <td style={tdStyle}>
                    <span style={sopNameStyle}>{sop.name}</span>
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={sop.status} />
                  </td>
                  <td style={{ ...tdStyle, color: '#64748b', fontSize: 12 }}>
                    v{sop.version || '1.0'}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#374151' }}>
                    {sop.derivedProcessCount}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={actionGroupStyle}>
                      <button
                        type="button"
                        style={editBtnStyle}
                        onClick={() => void handleEditSop(sop.id)}
                      >
                        Edit
                      </button>
                      {sop.status === SOP_STATUS.PUBLISHED && (
                        <button
                          type="button"
                          style={createProcessBtnStyle}
                          onClick={() => void handleOpenCreateProcessWizard(sop)}
                        >
                          Create Process
                        </button>
                      )}
                      {sop.status === SOP_STATUS.DRAFT && (
                        <button
                          type="button"
                          style={deleteBtnStyle}
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
            alert(`Process created successfully (ID: ${newProcessId.slice(0, 8)}…)`);
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  const config: Record<number, { label: string; bg: string; color: string; border: string }> = {
    [SOP_STATUS.DRAFT]: { label: 'Draft', bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
    [SOP_STATUS.PUBLISHED]: { label: 'Published', bg: '#f0fdf4', color: '#166534', border: '#86efac' },
    [SOP_STATUS.RETIRED]: { label: 'Retired', bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
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
            <label style={fieldLabelStyle}>SOP Name <span style={{ color: '#dc2626' }}>*</span></label>
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

const shellStyle: React.CSSProperties = {
  width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
  background: '#f8fafc', fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 24px', background: '#fff',
  borderBottom: '1px solid #e2e8f0', flexShrink: 0,
};

const headerLeftStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 16 };
const headerRightStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

const backBtnStyle: React.CSSProperties = {
  height: 30, padding: '0 12px',
  background: 'transparent', border: '1px solid #e2e8f0',
  borderRadius: 5, fontSize: 12, fontWeight: 500,
  color: '#475569', cursor: 'pointer',
};

const pageTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: '#0f172a' };
const pageSubtitleStyle: React.CSSProperties = { fontSize: 12, color: '#64748b' };

const rolesBtn: React.CSSProperties = {
  height: 32, padding: '0 14px',
  background: '#fff', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: 13, fontWeight: 500,
  color: '#374151', cursor: 'pointer',
};

const newSopBtnStyle: React.CSSProperties = {
  height: 32, padding: '0 16px',
  background: '#0f766e', border: 'none',
  borderRadius: 6, fontSize: 13, fontWeight: 600,
  color: '#fff', cursor: 'pointer',
};

const contentStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '24px',
};

const spinnerCenterStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 10, fontSize: 13, color: '#64748b', padding: '60px 0',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block', width: 16, height: 16,
  border: '2px solid #e2e8f0', borderTopColor: '#0f766e',
  borderRadius: '50%', animation: 'spin 0.7s linear infinite',
};

const errorBannerStyle: React.CSSProperties = {
  padding: '12px 16px', background: '#fef2f2',
  border: '1px solid #fecaca', borderRadius: 6,
  color: '#991b1b', fontSize: 13,
};

const emptyStateStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: 12, padding: '80px 0',
};

const emptyIconStyle: React.CSSProperties = { fontSize: 48 };
const emptyTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#0f172a' };
const emptySubStyle: React.CSSProperties = { fontSize: 13, color: '#64748b' };
const emptyNewBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 20px', background: '#0f766e',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
  color: '#fff', cursor: 'pointer', marginTop: 4,
};

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse',
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
  overflow: 'hidden',
};

const theadRowStyle: React.CSSProperties = { background: '#f8fafc' };

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 600, color: '#64748b',
  borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
};

const tbodyRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
};

const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };

const sopNameStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#1e293b',
};

const actionGroupStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 6,
};

const editBtnStyle: React.CSSProperties = {
  height: 28, padding: '0 12px',
  background: '#eff6ff', border: '1px solid #bfdbfe',
  borderRadius: 5, fontSize: 12, fontWeight: 500,
  color: '#1d4ed8', cursor: 'pointer',
};

const deleteBtnStyle: React.CSSProperties = {
  height: 28, padding: '0 12px',
  background: '#fef2f2', border: '1px solid #fecaca',
  borderRadius: 5, fontSize: 12, fontWeight: 500,
  color: '#dc2626', cursor: 'pointer',
};

const createProcessBtnStyle: React.CSSProperties = {
  height: 28, padding: '0 12px',
  background: '#f5f3ff', border: '1px solid #ddd6fe',
  borderRadius: 5, fontSize: 12, fontWeight: 500,
  color: '#7c3aed', cursor: 'pointer',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
};

const dialogCardStyle: React.CSSProperties = {
  width: 400, background: '#fff', border: '1px solid #e2e8f0',
  borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  display: 'flex', flexDirection: 'column',
};

const dialogHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '18px 24px 14px', borderBottom: '1px solid #f1f5f9',
};

const dialogTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#0f172a' };
const dialogCloseBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#94a3b8',
  fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0,
};

const dialogBodyStyle: React.CSSProperties = {
  padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16,
};

const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
const fieldLabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151' };

const inputStyle: React.CSSProperties = {
  height: 34, padding: '0 10px', background: '#fff',
  border: '1px solid #cbd5e1', borderRadius: 6,
  color: '#1e293b', fontSize: 13, outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

const dialogFooterStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
  padding: '14px 24px', borderTop: '1px solid #f1f5f9',
  background: '#f8fafc', borderRadius: '0 0 12px 12px',
};

const cancelBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 18px', background: '#fff',
  border: '1px solid #e2e8f0', borderRadius: 6,
  color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};

const confirmBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 18px', background: '#0f766e',
  border: 'none', borderRadius: 6, color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const confirmBtnDisabledStyle: React.CSSProperties = {
  ...confirmBtnStyle, background: '#99f6e4', cursor: 'not-allowed',
};
