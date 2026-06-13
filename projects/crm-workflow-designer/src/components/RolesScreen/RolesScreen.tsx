// src/components/RolesScreen/RolesScreen.tsx
import { useState, useEffect, useCallback } from 'react';
import { ROLE_STATUS } from '@/types/SopTypes';
import type { CrmRole, CreateRoleRequest } from '@/types/SopTypes';
import type { ISopAdapter } from '@/services/ISopAdapter';

interface RolesScreenProps {
  adapter: ISopAdapter;
  onBack(): void;
}

interface EditingRole {
  id: string | null; // null = creating new
  name: string;
  description: string;
  department: string;
}

export function RolesScreen({ adapter, onBack }: RolesScreenProps) {
  const [roles, setRoles] = useState<CrmRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadRoles = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    adapter.getRoles()
      .then(setRoles)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load roles.');
      })
      .finally(() => setIsLoading(false));
  }, [adapter]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleNew = useCallback(() => {
    setEditing({ id: null, name: '', description: '', department: '' });
    setSaveError(null);
  }, []);

  const handleEdit = useCallback((role: CrmRole) => {
    setEditing({
      id: role.id,
      name: role.name,
      description: role.description,
      department: role.department,
    });
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing || !editing.name.trim()) {
      setSaveError('Role name is required.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      if (editing.id) {
        await adapter.updateRole(editing.id, {
          name: editing.name.trim(),
          description: editing.description.trim(),
          department: editing.department.trim(),
        });
      } else {
        const req: CreateRoleRequest = {
          name: editing.name.trim(),
          description: editing.description.trim(),
          department: editing.department.trim(),
        };
        await adapter.createRole(req);
      }
      setEditing(null);
      loadRoles();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  }, [editing, adapter, loadRoles]);

  const handleToggleStatus = useCallback(async (role: CrmRole) => {
    const newStatus = role.status === ROLE_STATUS.ACTIVE ? ROLE_STATUS.INACTIVE : ROLE_STATUS.ACTIVE;
    try {
      await adapter.updateRole(role.id, { status: newStatus });
      loadRoles();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed.');
    }
  }, [adapter, loadRoles]);

  const handleDelete = useCallback(async (role: CrmRole) => {
    if (!window.confirm(`Delete role "${role.name}"? This will fail if the role is assigned to any SOP steps.`)) return;
    try {
      await adapter.deleteRole(role.id);
      loadRoles();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed. The role may be in use by SOP steps.');
    }
  }, [adapter, loadRoles]);

  return (
    <div style={shellStyle}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          <button type="button" style={backBtnStyle} onClick={onBack}>
            ← SOPs
          </button>
          <div>
            <div style={pageTitleStyle}>Roles Management</div>
            <div style={pageSubtitleStyle}>Manage assignable roles for SOP steps</div>
          </div>
        </div>
        <button type="button" style={newRoleBtnStyle} onClick={handleNew}>
          + New Role
        </button>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {isLoading && (
          <div style={spinnerCenterStyle}>
            <span style={spinnerStyle} /> Loading roles…
          </div>
        )}

        {loadError && <div style={errorBannerStyle}>{loadError}</div>}

        {!isLoading && !loadError && roles.length === 0 && (
          <div style={emptyStateStyle}>
            <div style={emptyIconStyle}>👥</div>
            <div style={emptyTitleStyle}>No roles yet</div>
            <div style={emptySubStyle}>Create roles to assign to SOP steps.</div>
            <button type="button" style={emptyNewBtnStyle} onClick={handleNew}>
              + New Role
            </button>
          </div>
        )}

        {!isLoading && roles.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Department</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} style={tbodyRowStyle}>
                  <td style={tdStyle}>
                    <span style={roleNameStyle}>{role.name}</span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#475569' }}>
                    {role.department || '—'}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#64748b', maxWidth: 240 }}>
                    {role.description || '—'}
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={role.status} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={actionGroupStyle}>
                      <button type="button" style={editBtnStyle} onClick={() => handleEdit(role)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        style={role.status === ROLE_STATUS.ACTIVE ? deactivateBtnStyle : activateBtnStyle}
                        onClick={() => void handleToggleStatus(role)}
                      >
                        {role.status === ROLE_STATUS.ACTIVE ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        style={deleteBtnStyle}
                        onClick={() => void handleDelete(role)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit dialog */}
      {editing && (
        <RoleEditDialog
          editing={editing}
          isSaving={isSaving}
          saveError={saveError}
          onChange={setEditing}
          onSave={() => void handleSave()}
          onClose={() => { setEditing(null); setSaveError(null); }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  const isActive = status === ROLE_STATUS.ACTIVE;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      background: isActive ? '#f0fdf4' : '#f8fafc',
      color: isActive ? '#166534' : '#64748b',
      border: `1px solid ${isActive ? '#86efac' : '#e2e8f0'}`,
      borderRadius: 4, padding: '2px 7px',
    }}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function RoleEditDialog({
  editing,
  isSaving,
  saveError,
  onChange,
  onSave,
  onClose,
}: {
  editing: EditingRole;
  isSaving: boolean;
  saveError: string | null;
  onChange(v: EditingRole): void;
  onSave(): void;
  onClose(): void;
}) {
  const isNew = !editing.id;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={dialogCardStyle}>
        <div style={dialogHeaderStyle}>
          <span style={dialogTitleStyle}>{isNew ? 'New Role' : 'Edit Role'}</span>
          <button type="button" style={dialogCloseBtnStyle} onClick={onClose}>×</button>
        </div>
        <div style={dialogBodyStyle}>
          {saveError && <div style={dialogErrorStyle}>{saveError}</div>}

          <div style={fieldGroupStyle}>
            <label style={fieldLabelStyle}>Name <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) => onChange({ ...editing, name: e.target.value })}
              style={inputStyle}
              autoFocus
            />
          </div>
          <div style={fieldGroupStyle}>
            <label style={fieldLabelStyle}>Department</label>
            <input
              type="text"
              value={editing.department}
              onChange={(e) => onChange({ ...editing, department: e.target.value })}
              placeholder="e.g. Operations, Finance"
              style={inputStyle}
            />
          </div>
          <div style={fieldGroupStyle}>
            <label style={fieldLabelStyle}>Description</label>
            <textarea
              value={editing.description}
              onChange={(e) => onChange({ ...editing, description: e.target.value })}
              rows={2}
              style={textareaStyle}
            />
          </div>
        </div>
        <div style={dialogFooterStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            style={isSaving ? saveBtnDisabledStyle : saveBtnStyle}
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : isNew ? 'Create Role' : 'Save Changes'}
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

const backBtnStyle: React.CSSProperties = {
  height: 30, padding: '0 12px', background: 'transparent',
  border: '1px solid #e2e8f0', borderRadius: 5,
  fontSize: 12, fontWeight: 500, color: '#475569', cursor: 'pointer',
};

const pageTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: '#0f172a' };
const pageSubtitleStyle: React.CSSProperties = { fontSize: 12, color: '#64748b' };

const newRoleBtnStyle: React.CSSProperties = {
  height: 32, padding: '0 16px', background: '#2563eb',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
  color: '#fff', cursor: 'pointer',
};

const contentStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '24px' };

const spinnerCenterStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 10, fontSize: 13, color: '#64748b', padding: '60px 0',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block', width: 16, height: 16,
  border: '2px solid #e2e8f0', borderTopColor: '#2563eb',
  borderRadius: '50%', animation: 'spin 0.7s linear infinite',
};

const errorBannerStyle: React.CSSProperties = {
  padding: '12px 16px', background: '#fef2f2',
  border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13,
};

const emptyStateStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: 12, padding: '80px 0',
};

const emptyIconStyle: React.CSSProperties = { fontSize: 48 };
const emptyTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#0f172a' };
const emptySubStyle: React.CSSProperties = { fontSize: 13, color: '#64748b' };
const emptyNewBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 20px', background: '#2563eb',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
  color: '#fff', cursor: 'pointer', marginTop: 4,
};

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse',
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden',
};

const theadRowStyle: React.CSSProperties = { background: '#f8fafc' };
const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 600, color: '#64748b',
  borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
};

const tbodyRowStyle: React.CSSProperties = { borderBottom: '1px solid #f1f5f9' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };
const roleNameStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1e293b' };

const actionGroupStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 6,
};

const editBtnStyle: React.CSSProperties = {
  height: 26, padding: '0 10px', background: '#eff6ff',
  border: '1px solid #bfdbfe', borderRadius: 4,
  fontSize: 11, fontWeight: 500, color: '#1d4ed8', cursor: 'pointer',
};

const deactivateBtnStyle: React.CSSProperties = {
  height: 26, padding: '0 10px', background: '#fffbeb',
  border: '1px solid #fde68a', borderRadius: 4,
  fontSize: 11, fontWeight: 500, color: '#92400e', cursor: 'pointer',
};

const activateBtnStyle: React.CSSProperties = {
  height: 26, padding: '0 10px', background: '#f0fdf4',
  border: '1px solid #86efac', borderRadius: 4,
  fontSize: 11, fontWeight: 500, color: '#166534', cursor: 'pointer',
};

const deleteBtnStyle: React.CSSProperties = {
  height: 26, padding: '0 10px', background: '#fef2f2',
  border: '1px solid #fecaca', borderRadius: 4,
  fontSize: 11, fontWeight: 500, color: '#dc2626', cursor: 'pointer',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
};

const dialogCardStyle: React.CSSProperties = {
  width: 440, background: '#fff', border: '1px solid #e2e8f0',
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

const dialogErrorStyle: React.CSSProperties = {
  padding: '10px 14px', background: '#fef2f2',
  border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13,
};

const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
const fieldLabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151' };

const inputStyle: React.CSSProperties = {
  height: 34, padding: '0 10px', background: '#fff',
  border: '1px solid #cbd5e1', borderRadius: 6,
  color: '#1e293b', fontSize: 13, outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  padding: '8px 10px', background: '#fff',
  border: '1px solid #cbd5e1', borderRadius: 6,
  color: '#1e293b', fontSize: 13, outline: 'none',
  width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
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

const saveBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 20px', background: '#2563eb',
  border: 'none', borderRadius: 6, color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const saveBtnDisabledStyle: React.CSSProperties = {
  ...saveBtnStyle, background: '#93c5fd', cursor: 'not-allowed',
};
