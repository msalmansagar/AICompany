import { useState, useEffect, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { useWorkflowSave } from '@/hooks/useWorkflowSave';
import { usePublish } from '@/hooks/usePublish';
import { useAutoLayout } from '@/hooks/useAutoLayout';
import { useExport } from '@/hooks/useExport';
import { useLoadWorkflow } from '@/hooks/useLoadWorkflow';
import { useCrmAdapter } from '@/app/CrmAdapterContext';

export function Toolbar() {
  const { process, isDirty, isPreviewMode, setPreviewMode } = useWorkflowStore((s) => ({
    process: s.process,
    isDirty: s.isDirty,
    isPreviewMode: s.isPreviewMode,
    setPreviewMode: s.setPreviewMode,
  }));

  const { save, isSaving } = useWorkflowSave();
  const { publish, isPublishing, violations } = usePublish();
  const { applyAutoLayout } = useAutoLayout();
  const { exportJson, exportPng } = useExport();
  const { loadProcess, loadProcessList, isLoading: isLoadingProcess } = useLoadWorkflow();
  const adapter = useCrmAdapter();

  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [processList, setProcessList] = useState<Array<{ id: string; name: string; state: string }>>([]);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const processName = process?.name ?? 'Untitled Workflow';
  const versionLabel = process ? `v${process.versionMajor}.${process.versionMinor} — ${process.workflowState}` : '';
  const hasErrors = violations.filter((v) => v.severity === 'error').length > 0;

  const handleOpen = useCallback(async () => {
    setShowOpenDialog(true);
    try {
      const list = await loadProcessList();
      setProcessList(list);
    } catch {
      setProcessList([]);
    }
  }, [loadProcessList]);

  const handleSelectProcess = useCallback(async (id: string) => {
    setShowOpenDialog(false);
    await loadProcess(id);
  }, [loadProcess]);

  const handleNew = useCallback(async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const id = await adapter.createProcess({
        name: newName.trim(), recordEntity: '', regardingField: '', parentEntity: '',
        versionMajor: 1, versionMinor: 0, workflowState: 'draft', snapshot: null,
      });
      await loadProcess(id);
      setShowNewDialog(false);
      setNewName('');
    } catch {
      // surface via toast if needed
    } finally {
      setIsCreating(false);
    }
  }, [adapter, newName, loadProcess]);

  // Close dialogs on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setShowOpenDialog(false); setShowNewDialog(false); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div style={barStyle} role="toolbar" aria-label="Workflow Designer Toolbar">
        {/* Identity */}
        <div style={identityStyle}>
          <span style={titleStyle}>{processName}</span>
          {versionLabel && <span style={versionStyle}>{versionLabel}</span>}
          {isDirty && <span style={dirtyDot} title="Unsaved changes">●</span>}
        </div>

        <div style={actionsStyle}>
          <Btn label="New" onClick={() => setShowNewDialog(true)} title="Create new workflow" />
          <Btn label={isLoadingProcess ? 'Loading…' : 'Open'} onClick={() => void handleOpen()} disabled={isLoadingProcess} title="Open existing workflow" />
          <Divider />
          <Btn label={isSaving ? 'Saving…' : 'Save'} onClick={() => void save()} disabled={isSaving || !isDirty} title="Save draft (Ctrl+S)" />
          <Btn label={isPublishing ? 'Publishing…' : 'Publish'} onClick={() => void publish()} disabled={isPublishing || !process || hasErrors} primary title="Validate and publish" />
          <Divider />
          <Btn label="Auto Layout" onClick={() => void applyAutoLayout()} title="Auto-arrange nodes" />
          <Btn label={isPreviewMode ? 'Exit Preview' : 'Preview'} onClick={() => setPreviewMode(!isPreviewMode)} title="Toggle preview mode" />
          <Divider />
          <div style={{ position: 'relative' }}>
            <Btn label="Export ▾" onClick={() => setExportOpen((o) => !o)} />
            {exportOpen && (
              <div style={dropdownStyle} onMouseLeave={() => setExportOpen(false)}>
                <DropItem label="Export JSON" onClick={() => { exportJson(); setExportOpen(false); }} />
                <DropItem label="Export PNG" onClick={() => {
                  const el = document.querySelector<HTMLElement>('.react-flow');
                  if (el) void exportPng(el);
                  setExportOpen(false);
                }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Open process dialog */}
      {showOpenDialog && (
        <Backdrop onClick={() => setShowOpenDialog(false)}>
          <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={dialogTitle}>Open Workflow</h3>
            {processList.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: 13 }}>No workflows found.</p>
            ) : (
              <div style={listStyle}>
                {processList.map((p) => (
                  <button key={p.id} style={listItemStyle} onClick={() => void handleSelectProcess(p.id)}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    <span style={stateBadge(p.state)}>{p.state}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Btn label="Cancel" onClick={() => setShowOpenDialog(false)} />
            </div>
          </div>
        </Backdrop>
      )}

      {/* New process dialog */}
      {showNewDialog && (
        <Backdrop onClick={() => setShowNewDialog(false)}>
          <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={dialogTitle}>New Workflow</h3>
            <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 6 }}>Workflow Name</label>
            <input
              autoFocus
              style={inputStyle}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleNew(); }}
              placeholder="e.g. Loan Application Workflow"
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <Btn label="Cancel" onClick={() => setShowNewDialog(false)} />
              <Btn label={isCreating ? 'Creating…' : 'Create'} primary onClick={() => void handleNew()} disabled={!newName.trim() || isCreating} />
            </div>
          </div>
        </Backdrop>
      )}
    </>
  );
}

function Btn({ label, onClick, disabled = false, primary = false, title }: {
  label: string; onClick: () => void; disabled?: boolean; primary?: boolean; title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ ...btnBase, ...(primary ? btnPrimary : btnSecondary), ...(disabled ? btnDisabled : {}) }}>
      {label}
    </button>
  );
}

function Divider() { return <div style={{ width: 1, height: 20, background: '#475569', margin: '0 4px' }} />; }

function DropItem({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={dropItemStyle}>{label}</button>;
}

function Backdrop({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div style={backdropStyle} onClick={onClick} role="dialog" aria-modal="true">
      {children}
    </div>
  );
}

function stateBadge(state: string): React.CSSProperties {
  const colors: Record<string, string> = { draft: '#94a3b8', published: '#16a34a', archived: '#9ca3af' };
  return { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: colors[state] ?? '#94a3b8', letterSpacing: '0.06em' };
}

const barStyle: React.CSSProperties = { height: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', background: '#1e293b', borderBottom: '1px solid #334155', flexShrink: 0, zIndex: 10 };
const identityStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 };
const titleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const versionStyle: React.CSSProperties = { fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' };
const dirtyDot: React.CSSProperties = { fontSize: 10, color: '#f59e0b' };
const actionsStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 };
const btnBase: React.CSSProperties = { height: 28, padding: '0 12px', fontSize: 12, fontWeight: 500, borderRadius: 4, border: 'none', cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { background: '#334155', color: '#e2e8f0' };
const btnPrimary: React.CSSProperties = { background: '#2563eb', color: '#fff' };
const btnDisabled: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
const dropdownStyle: React.CSSProperties = { position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: 4, minWidth: 130, zIndex: 100 };
const dropItemStyle: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 12, color: '#e2e8f0', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer' };
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const dialogStyle: React.CSSProperties = { background: '#fff', borderRadius: 10, padding: 24, minWidth: 380, maxWidth: 480, boxShadow: '0 20px 48px rgba(0,0,0,0.25)' };
const dialogTitle: React.CSSProperties = { margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1e293b' };
const listStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' };
const listItemStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', textAlign: 'left', width: '100%' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
