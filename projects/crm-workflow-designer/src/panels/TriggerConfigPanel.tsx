import { useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { TriggerNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { MetadataService } from '../services/MetadataService';
import { ALLOWED_ENTITIES } from '../config/allowedEntities';
import { field, label, select } from './panelStyles';

interface TriggerConfigPanelProps {
  nodeId: string;
}

export function TriggerConfigPanel({ nodeId }: TriggerConfigPanelProps) {
  const { updateNodeData, crmContext, viewMode } = useWorkflowStore((s) => ({
    updateNodeData: s.updateNodeData,
    crmContext: s.crmContext,
    viewMode: s.viewMode,
  }));

  const { getNode } = useReactFlow();
  const node = getNode(nodeId);
  const data = (node?.data ?? {}) as unknown as Partial<TriggerNodeData>;

  const [attributes, setAttributes] = useState<Array<{ logicalName: string; displayName: string }>>([]);

  useEffect(() => {
    if (!data.entity || !crmContext) return;
    const service = new MetadataService(crmContext);
    service.getEntityMetadata(data.entity).then((meta) => {
      setAttributes(meta.attributes);
    }).catch(() => setAttributes([]));
  }, [data.entity, crmContext]);

  function update(patch: Partial<TriggerNodeData>) {
    updateNodeData(nodeId, patch as Record<string, unknown>);
  }

  return (
    <div>
      <div style={field}>
        <label style={label}>Entity</label>
        <select
          style={select}
          value={data.entity ?? ''}
          disabled={viewMode}
          onChange={(e) => update({ entity: e.target.value, filterField: undefined })}
        >
          <option value="">Select entity…</option>
          {ALLOWED_ENTITIES.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      <div style={field}>
        <label style={label}>Event</label>
        <select
          style={select}
          value={data.event ?? ''}
          disabled={viewMode}
          onChange={(e) => update({ event: e.target.value as TriggerNodeData['event'] })}
        >
          <option value="">Select event…</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      {attributes.length > 0 && (
        <div style={field}>
          <label style={label}>Filter Field (optional)</label>
          <select
            style={select}
            value={data.filterField ?? ''}
            disabled={viewMode}
            onChange={(e) => update({ filterField: e.target.value })}
          >
            <option value="">None</option>
            {attributes.map((a) => (
              <option key={a.logicalName} value={a.logicalName}>{a.displayName}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
