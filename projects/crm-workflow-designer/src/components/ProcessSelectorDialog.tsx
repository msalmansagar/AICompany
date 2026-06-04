import { useState } from 'react';
import type { CrmProcess } from '../types/ViewTypes';

interface ProcessSelectorDialogProps {
  processes: CrmProcess[];
  isLoading: boolean;
  error: string | null;
  onSelect(processId: string): void;
  onClose(): void;
}

export function ProcessSelectorDialog({
  processes,
  isLoading,
  error,
  onSelect,
  onClose,
}: ProcessSelectorDialogProps) {
  const [search, setSearch] = useState('');

  const filtered = processes.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={backdropStyle} onClick={onClose} role="dialog" aria-modal="true" aria-label="Open Workflow">
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={dialogHeader}>
          <h3 style={dialogTitle}>Open Workflow</h3>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!isLoading && !error && processes.length > 0 && (
          <input
            type="text"
            placeholder="Search workflows…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInput}
            autoFocus
          />
        )}

        <div style={listContainer}>
          {isLoading && (
            <div style={centeredMsg}>
              <span style={spinner} />
              Loading workflows…
            </div>
          )}

          {!isLoading && error && (
            <div style={errorBox}>
              <strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Failed to load workflows</strong>
              <pre style={errorPre}>{error}</pre>
            </div>
          )}

          {!isLoading && !error && processes.length === 0 && (
            <div style={centeredMsg}>
              No workflow process records found in qdb_work_item_record_type.
            </div>
          )}

          {!isLoading && !error && processes.length > 0 && filtered.length === 0 && (
            <div style={centeredMsg}>No workflows match "{search}".</div>
          )}

          {!isLoading && !error && filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              style={listItem}
              onClick={() => onSelect(p.id)}
            >
              <span style={processName}>{p.name}</span>
              {p.recordEntityName && (
                <span style={entityBadge}>{p.recordEntityName}</span>
              )}
            </button>
          ))}
        </div>

        <div style={dialogFooter}>
          <button type="button" style={cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 10,
  padding: 24,
  width: 440,
  maxWidth: '92vw',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 48px rgba(0,0,0,0.25)',
};

const dialogHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 16,
};

const dialogTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: '#1e293b',
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: '#94a3b8',
  padding: '2px 6px',
};

const searchInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

const listContainer: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minHeight: 80,
  maxHeight: 360,
};

const centeredMsg: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 24,
  color: '#64748b',
  fontSize: 13,
};

const spinner: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  height: 14,
  border: '2px solid #e2e8f0',
  borderTopColor: '#2563eb',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 6,
  padding: '10px 12px',
  color: '#991b1b',
};

const errorPre: React.CSSProperties = {
  fontSize: 11,
  color: '#7f1d1d',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'monospace',
  maxHeight: 200,
  overflowY: 'auto',
};

const listItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '10px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: '#f8fafc',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  transition: 'background 0.1s',
};

const processName: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1e293b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const entityBadge: React.CSSProperties = {
  fontSize: 10,
  background: '#faf5ff',
  color: '#7e22ce',
  border: '1px solid #e9d5ff',
  borderRadius: 4,
  padding: '2px 6px',
  flexShrink: 0,
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const dialogFooter: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: 16,
  paddingTop: 12,
  borderTop: '1px solid #f1f5f9',
};

const cancelBtn: React.CSSProperties = {
  padding: '6px 16px',
  background: '#f1f5f9',
  color: '#374151',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};
