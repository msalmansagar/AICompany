import { useEffect, useState } from 'react';
import type { ConditionNodeData, CompareOperator } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { MetadataService } from '../services/MetadataService';
import { ALLOWED_ENTITIES } from '../config/allowedEntities';
import { field, label, select, input } from './panelStyles';

interface ConditionConfigPanelProps {
  nodeId: string;
}

const OPERATORS: Array<{ value: CompareOperator; label: string }> = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Not equals' },
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
  { value: 'ge', label: 'Greater or equal' },
  { value: 'le', label: 'Less or equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'beginswith', label: 'Begins with' },
  { value: 'null', label: 'Is null' },
  { value: 'notnull', label: 'Is not null' },
];

const NO_VALUE_OPERATORS: CompareOperator[] = ['null', 'notnull'];

export function ConditionConfigPanel({ nodeId }: ConditionConfigPanelProps) {
  const { nodes, updateNodeData, crmContext, viewMode } = useWorkflowStore((s) => ({
    nodes: s.nodes,
    updateNodeData: s.updateNodeData,
    crmContext: s.crmContext,
    viewMode: s.viewMode,
  }));

  const node = nodes.find((n) => n.id === nodeId);
  const data = (node?.data ?? {}) as Partial<ConditionNodeData>;

  const [selectedEntity, setSelectedEntity] = useState('');
  const [attributes, setAttributes] = useState<Array<{ logicalName: string; displayName: string }>>([]);

  useEffect(() => {
    if (!selectedEntity || !crmContext) return;
    const service = new MetadataService(crmContext);
    service.getEntityMetadata(selectedEntity).then((meta) => {
      setAttributes(meta.attributes);
    }).catch(() => setAttributes([]));
  }, [selectedEntity, crmContext]);

  function update(patch: Partial<ConditionNodeData>) {
    updateNodeData(nodeId, patch);
  }

  const showValue = data.operator && !NO_VALUE_OPERATORS.includes(data.operator);

  return (
    <div>
      <div style={field}>
        <label style={label}>Entity (for field list)</label>
        <select
          style={select}
          value={selectedEntity}
          disabled={viewMode}
          onChange={(e) => { setSelectedEntity(e.target.value); update({ field: '' }); }}
        >
          <option value="">Select entity…</option>
          {ALLOWED_ENTITIES.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      <div style={field}>
        <label style={label}>Field</label>
        <select
          style={select}
          value={data.field ?? ''}
          disabled={viewMode || attributes.length === 0}
          onChange={(e) => update({ field: e.target.value })}
        >
          <option value="">Select field…</option>
          {attributes.map((a) => (
            <option key={a.logicalName} value={a.logicalName}>{a.displayName}</option>
          ))}
        </select>
      </div>

      <div style={field}>
        <label style={label}>Operator</label>
        <select
          style={select}
          value={data.operator ?? ''}
          disabled={viewMode}
          onChange={(e) => update({ operator: e.target.value as CompareOperator, value: '' })}
        >
          <option value="">Select operator…</option>
          {OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
      </div>

      {showValue && (
        <div style={field}>
          <label style={label}>Value</label>
          <input
            style={input}
            type="text"
            value={data.value ?? ''}
            disabled={viewMode}
            onChange={(e) => update({ value: e.target.value })}
            placeholder="Enter value…"
          />
        </div>
      )}
    </div>
  );
}
