// src/components/RolesScreen/RolesScreen.tsx
import { useState, useEffect, useCallback } from 'react';
import { ROLE_STATUS } from '@/types/SopTypes';
import type { CrmRole, CreateRoleRequest } from '@/types/SopTypes';
import type { ISopAdapter } from '@/services/ISopAdapter';
import { confirm } from '@/components/ui/ConfirmDialog';
import { notify } from '@/components/ui/Notify';

interface RolesScreenProps {
  adapter: ISopAdapter;
}

interface EditingRole {
  id: string | null; // null = creating new
  name: string;
  description: string;
  department: string;
}

export function RolesScreen({ adapter }: RolesScreenProps) {
  const [roles, setRoles] = useState<CrmRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Actions live on the command bar and read the selected row.
  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;

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
      notify(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  }, [adapter, loadRoles]);

  const handleDelete = useCallback(async (role: CrmRole) => {
    const confirmed = await confirm({
      title: 'Delete role',
      message: `Delete role "${role.name}"? This will fail if the role is assigned to any SOP steps.`,
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await adapter.deleteRole(role.id);
      loadRoles();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed. The role may be in use by SOP steps.', 'error');
    }
  }, [adapter, loadRoles]);

  return (
    <div style={shellStyle}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="cmdbar">
        <button type="button" className="cmd primary" onClick={handleNew}>
          + New role
        </button>
        <span className="cmd-sep" />
        <button
          type="button"
          className="cmd"
          disabled={!selectedRole}
          onClick={() => selectedRole && handleEdit(selectedRole)}
        >
          Edit
        </button>
        <button
          type="button"
          className="cmd"
          disabled={!selectedRole}
          onClick={() => selectedRole && void handleToggleStatus(selectedRole)}
        >
          {selectedRole?.status === ROLE_STATUS.INACTIVE ? 'Activate' : 'Deactivate'}
        </button>
        <button
          type="button"
          className="cmd danger"
          disabled={!selectedRole}
          onClick={() => selectedRole && void handleDelete(selectedRole)}
        >
          Delete
        </button>
        <span className="cmd-sep" />
        <button type="button" className="cmd" onClick={loadRoles} disabled={isLoading}>
          Refresh
        </button>
      </div>

      <div className="page-head" style={{ padding: '16px 20px 0', marginBottom: 0 }}>
        <div>
          <h1>Roles Management</h1>
          <div className="page-sub">Assignable roles for SOP steps</div>
        </div>
      </div>

      {loadError && <div className="message-bar" role="alert">{loadError}</div>}

      <div className="scroll">
        <div className="page">
          <div className="grid-wrap">
            {isLoading ? (
              <div className="empty-state">
                <span className="spinner" />
                <span>Loading roles…</span>
              </div>
            ) : roles.length === 0 ? (
              <div className="empty-state">
                <span className="es-title">No roles yet</span>
                <span>Create roles to assign to SOP steps.</span>
                <button type="button" className="btn primary" onClick={handleNew}>
                  + New role
                </button>
              </div>
            ) : (
              <table className="grid" role="grid">
                <thead>
                  <tr>
                    <th className="row-check" />
                    <th>Name</th>
                    <th>Department</th>
                    <th>Description</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr
                      key={role.id}
                      className={role.id === selectedId ? 'selected' : undefined}
                      style={{ cursor: 'pointer' }}
                      aria-selected={role.id === selectedId}
                      onClick={() => setSelectedId(role.id === selectedId ? null : role.id)}
                      onDoubleClick={() => handleEdit(role)}
                    >
                      <td className="row-check">
                        <div className="box">
                          {role.id === selectedId && (
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
                          onClick={(e) => { e.stopPropagation(); handleEdit(role); }}
                        >
                          {role.name}
                        </button>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{role.department || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)', maxWidth: 260 }}>
                        {role.description || '—'}
                      </td>
                      <td><StatusBadge status={role.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
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
    <span className={isActive ? 'pill published' : 'pill draft'}>
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
    <div
      className="dialog-backdrop"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? 'New role' : 'Edit role'}
    >
      <div className="dialog" style={{ width: 460 }}>
        <div className="dialog-head">
          <h2>{isNew ? 'New role' : 'Edit role'}</h2>
        </div>
        <div className="dialog-body">
          {saveError && <div className="notice error" style={{ marginBottom: 12 }}>{saveError}</div>}

          <div className="field-grid">
            <div className="field col-2">
              <label className="lbl" htmlFor="role-name">Name<span className="req">*</span></label>
              <input
                id="role-name"
                type="text"
                className="fluent-input"
                value={editing.name}
                onChange={(e) => onChange({ ...editing, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="field col-2">
              <label className="lbl" htmlFor="role-department">Department</label>
              <input
                id="role-department"
                type="text"
                className="fluent-input"
                value={editing.department}
                onChange={(e) => onChange({ ...editing, department: e.target.value })}
                placeholder="e.g. Operations, Finance"
              />
            </div>
            <div className="field col-2">
              <label className="lbl" htmlFor="role-description">Description</label>
              <textarea
                id="role-description"
                className="fluent-input"
                value={editing.description}
                onChange={(e) => onChange({ ...editing, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : isNew ? 'Create role' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Styles ---

const shellStyle: React.CSSProperties = {
  width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
  background: 'var(--surface-alt)', fontFamily: '"Segoe UI", system-ui, sans-serif',
};

