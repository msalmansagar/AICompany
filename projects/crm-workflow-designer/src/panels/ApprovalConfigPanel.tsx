import { useReactFlow } from '@xyflow/react';
import type { ApprovalNodeData } from '../types/WorkflowTypes';
import { useWorkflowStore } from '../store/workflowStore';
import { field, label, select, input } from './panelStyles';

interface ApprovalConfigPanelProps {
  nodeId: string;
}

export function ApprovalConfigPanel({ nodeId }: ApprovalConfigPanelProps) {
  const { updateNodeData, viewMode } = useWorkflowStore((s) => ({
    updateNodeData: s.updateNodeData,
    viewMode: s.viewMode,
  }));

  const { getNode } = useReactFlow();
  const node = getNode(nodeId);
  const data = (node?.data ?? {}) as unknown as Partial<ApprovalNodeData>;

  function update(patch: Partial<ApprovalNodeData>) {
    updateNodeData(nodeId, patch as Record<string, unknown>);
  }

  return (
    <div>
      <div style={field}>
        <label style={label}>Assign To</label>
        <select style={select} disabled={viewMode}
          value={data.assignToType ?? 'user'}
          onChange={(e) => update({ assignToType: e.target.value as 'user' | 'team' })}>
          <option value="user">User</option>
          <option value="team">Team</option>
        </select>
      </div>
      <div style={field}>
        <label style={label}>Name</label>
        <input style={input} type="text" disabled={viewMode}
          value={data.assignToName ?? ''}
          onChange={(e) => update({ assignToName: e.target.value })} />
      </div>
      <div style={field}>
        <label style={label}>ID (GUID)</label>
        <input style={input} type="text" disabled={viewMode}
          value={data.assignToId ?? ''}
          onChange={(e) => update({ assignToId: e.target.value })} />
      </div>
      <div style={field}>
        <label style={label}>Approval Field</label>
        <input style={input} type="text" disabled={viewMode}
          value={data.approvalField ?? ''}
          onChange={(e) => update({ approvalField: e.target.value })}
          placeholder="e.g. statuscode" />
      </div>
      <div style={field}>
        <label style={label}>Approved Value</label>
        <input style={input} type="text" disabled={viewMode}
          value={data.approvedValue ?? ''}
          onChange={(e) => update({ approvedValue: e.target.value })} />
      </div>
      <div style={field}>
        <label style={label}>Rejected Value</label>
        <input style={input} type="text" disabled={viewMode}
          value={data.rejectedValue ?? ''}
          onChange={(e) => update({ rejectedValue: e.target.value })} />
      </div>
    </div>
  );
}
