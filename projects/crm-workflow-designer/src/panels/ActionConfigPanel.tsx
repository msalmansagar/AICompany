import { useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { ActionNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { MetadataService } from '../services/MetadataService';
import { ALLOWED_ENTITIES } from '../config/allowedEntities';
import { field, label, select, input } from './panelStyles';

interface ActionConfigPanelProps {
  nodeId: string;
}

export function ActionConfigPanel({ nodeId }: ActionConfigPanelProps) {
  const { updateNodeData, crmContext, viewMode } = useWorkflowStore((s) => ({
    updateNodeData: s.updateNodeData,
    crmContext: s.crmContext,
    viewMode: s.viewMode,
  }));

  const { getNode } = useReactFlow();
  const node = getNode(nodeId);
  const data = (node?.data ?? { actionType: 'updateField' }) as unknown as ActionNodeData;
  const actionType = 'actionType' in data ? data.actionType : 'updateField';

  const [attributes, setAttributes] = useState<Array<{ logicalName: string; displayName: string }>>([]);
  const [entityForAttrs, setEntityForAttrs] = useState('');

  useEffect(() => {
    if (!entityForAttrs || !crmContext) return;
    const service = new MetadataService(crmContext);
    service.getEntityMetadata(entityForAttrs).then((meta) => {
      setAttributes(meta.attributes);
    }).catch(() => setAttributes([]));
  }, [entityForAttrs, crmContext]);

  function update(patch: Partial<Record<string, unknown>>) {
    updateNodeData(nodeId, { ...data, ...patch } as Partial<ActionNodeData>);
  }

  return (
    <div>
      <div style={field}>
        <label style={label}>Action Type</label>
        <select
          style={select}
          value={actionType}
          disabled={viewMode}
          onChange={(e) => updateNodeData(nodeId, { actionType: e.target.value } as Partial<ActionNodeData>)}
        >
          <option value="updateField">Update Field</option>
          <option value="createRecord">Create Record</option>
          <option value="sendEmail">Send Email</option>
          <option value="assign">Assign</option>
          <option value="wait">Wait</option>
        </select>
      </div>

      {actionType === 'updateField' && (
        <>
          <div style={field}>
            <label style={label}>Entity</label>
            <select style={select} disabled={viewMode} value={entityForAttrs} onChange={(e) => { setEntityForAttrs(e.target.value); update({ entity: e.target.value }); }}>
              <option value="">Select entity…</option>
              {ALLOWED_ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={label}>Field</label>
            <select style={select} disabled={viewMode || attributes.length === 0}
              value={'field' in data ? data.field : ''}
              onChange={(e) => update({ field: e.target.value })}>
              <option value="">Select field…</option>
              {attributes.map((a) => <option key={a.logicalName} value={a.logicalName}>{a.displayName}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={label}>Value</label>
            <input style={input} type="text" disabled={viewMode}
              value={'value' in data ? String(data.value ?? '') : ''}
              onChange={(e) => update({ value: e.target.value })} />
          </div>
        </>
      )}

      {actionType === 'createRecord' && (
        <div style={field}>
          <label style={label}>Target Entity</label>
          <select style={select} disabled={viewMode}
            value={'entity' in data ? data.entity : ''}
            onChange={(e) => update({ entity: e.target.value })}>
            <option value="">Select entity…</option>
            {ALLOWED_ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      )}

      {actionType === 'sendEmail' && (
        <>
          <div style={field}>
            <label style={label}>Template ID</label>
            <input style={input} type="text" disabled={viewMode}
              value={'templateId' in data ? data.templateId : ''}
              onChange={(e) => update({ templateId: e.target.value })}
              placeholder="CRM email template GUID" />
          </div>
          <div style={field}>
            <label style={label}>Recipient Field</label>
            <input style={input} type="text" disabled={viewMode}
              value={'recipientField' in data ? data.recipientField : ''}
              onChange={(e) => update({ recipientField: e.target.value })}
              placeholder="e.g. emailaddress1" />
          </div>
        </>
      )}

      {actionType === 'assign' && (
        <>
          <div style={field}>
            <label style={label}>Assign To</label>
            <select style={select} disabled={viewMode}
              value={'assignToType' in data ? data.assignToType : 'user'}
              onChange={(e) => update({ assignToType: e.target.value })}>
              <option value="user">User</option>
              <option value="team">Team</option>
            </select>
          </div>
          <div style={field}>
            <label style={label}>Name</label>
            <input style={input} type="text" disabled={viewMode}
              value={'assignToName' in data ? data.assignToName : ''}
              onChange={(e) => update({ assignToName: e.target.value })} />
          </div>
          <div style={field}>
            <label style={label}>ID (GUID)</label>
            <input style={input} type="text" disabled={viewMode}
              value={'assignToId' in data ? data.assignToId : ''}
              onChange={(e) => update({ assignToId: e.target.value })} />
          </div>
        </>
      )}

      {actionType === 'wait' && (
        <div style={field}>
          <label style={label}>Duration (minutes)</label>
          <input style={input} type="number" min={1} disabled={viewMode}
            value={'durationMinutes' in data ? String(data.durationMinutes) : ''}
            onChange={(e) => update({ durationMinutes: parseInt(e.target.value, 10) || 1 })} />
        </div>
      )}
    </div>
  );
}
