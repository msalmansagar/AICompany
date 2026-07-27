import { useEffect, useId, useState } from 'react';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { logError } from '@/services/logError';
import {
  HOOK_LABELS,
  workflowHookSummary,
  type WorkflowHookKind,
  type WorkflowHooks,
  type CallableWorkflowOption,
} from '@/services/workflowHooks';

// DP-5 — pick a workflow to run at a point in the task's life.
//
// One section, reused by the step, outcome, route and process panels; each passes
// the hooks its own table carries. The engine runs every applicable hook, so a
// step-level and an outcome-level completion workflow both fire — the note says so,
// because that is not obvious and it is the thing most likely to surprise.

interface WorkflowHooksSectionProps {
  value: WorkflowHooks;
  onChange: (hooks: WorkflowHooks) => void;
  kinds: WorkflowHookKind[];
  adapter: ICrmAdapter;
  /** Shown under the heading — what this scope means relative to the others. */
  scopeNote?: string;
}

export function WorkflowHooksSection({
  value,
  onChange,
  kinds,
  adapter,
  scopeNote,
}: WorkflowHooksSectionProps) {
  const sectionId = useId();
  const [expanded, setExpanded] = useState(false);
  const [workflows, setWorkflows] = useState<CallableWorkflowOption[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const summary = workflowHookSummary(value);

  useEffect(() => {
    if (!expanded || workflows.length > 0 || loadFailed) return;
    adapter
      .getCallableWorkflows()
      .then(setWorkflows)
      .catch((error) => {
        logError('WorkflowHooksSection:loadWorkflows', error);
        setLoadFailed(true);
      });
  }, [expanded, workflows.length, loadFailed, adapter]);

  const setHook = (kind: WorkflowHookKind, workflowId: string | null) => {
    const chosen = workflows.find((workflow) => workflow.id === workflowId);
    onChange({
      ...value,
      [kind]: { workflowId, workflowName: chosen?.name ?? null },
    });
  };

  return (
    <div>
      <button type="button" style={headerStyle} onClick={() => setExpanded((open) => !open)}>
        <span style={caretStyle}>{expanded ? '▾' : '▸'}</span>
        <span>Workflows</span>
        {!expanded && summary && <span style={summaryBadgeStyle}>{summary}</span>}
      </button>

      {expanded && (
        <div style={bodyStyle}>
          {scopeNote && <div style={noticeStyle}>{scopeNote}</div>}

          {kinds.map((kind) => (
            <div key={kind} style={fieldStyle}>
              <label style={labelStyle} htmlFor={`${sectionId}-${kind}`}>{HOOK_LABELS[kind]}</label>
              <select
                id={`${sectionId}-${kind}`}
                style={selectStyle}
                value={value[kind]?.workflowId ?? ''}
                onChange={(event) => setHook(kind, event.target.value || null)}
              >
                <option value="">— Run nothing —</option>
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name} · {workflow.primaryEntity}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {workflows.length === 0 && !loadFailed && (
            <span style={hintStyle}>
              Only activated workflows marked &ldquo;run on demand&rdquo; can be called, because
              that is exactly the flag the engine&rsquo;s execute request needs.
            </span>
          )}
          {loadFailed && <div style={noticeStyle}>Could not load workflows.</div>}
        </div>
      )}
    </div>
  );
}

// --- styles (match the dark step panel) ---

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 0',
  background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', textAlign: 'left',
};
const caretStyle: React.CSSProperties = { fontSize: 10, color: '#64748b' };
const summaryBadgeStyle: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#a5f3fc',
  background: '#083344', border: '1px solid #0e7490', borderRadius: 3, padding: '1px 5px',
  textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap',
};
const bodyStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 };
const noticeStyle: React.CSSProperties = {
  fontSize: 10, color: '#a5f3fc', background: '#082f39', border: '1px solid #0e7490',
  borderRadius: 4, padding: '6px 8px', lineHeight: 1.4,
};
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em',
};
const selectStyle: React.CSSProperties = {
  height: 30, padding: '0 8px', background: '#1e293b', border: '1px solid #334155',
  borderRadius: 4, color: '#e2e8f0', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box',
};
const hintStyle: React.CSSProperties = { fontSize: 10, color: '#64748b', lineHeight: 1.4 };
