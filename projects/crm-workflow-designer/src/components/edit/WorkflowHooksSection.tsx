import { useEffect, useId, useState } from 'react';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { logError } from '@/services/logError';
import {
  HOOK_INVOCATION,
  HOOK_LABELS,
  workflowHookSummary,
  type WorkflowHookKind,
  type WorkflowHooks,
  type CallableActionOption,
  type CallableWorkflowOption,
} from '@/services/workflowHooks';

/** One pickable process, whichever way the engine invokes it. */
type HookOption = { id: string; name: string; detail: string };

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
  /**
   * Which surface this is rendered on. The edit panels are dark; the process
   * properties panel is a light Fluent surface, and a dark section dropped into
   * it reads as a rendering bug rather than a design choice.
   */
  surface?: 'dark' | 'light';
}

export function WorkflowHooksSection({
  value,
  onChange,
  kinds,
  adapter,
  scopeNote,
  surface = 'dark',
}: WorkflowHooksSectionProps) {
  const sectionId = useId();
  const [expanded, setExpanded] = useState(false);
  const [workflows, setWorkflows] = useState<CallableWorkflowOption[]>([]);
  const [actions, setActions] = useState<CallableActionOption[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const summary = workflowHookSummary(value);
  const style = PALETTE[surface];

  const needsActions = kinds.some((kind) => HOOK_INVOCATION[kind] === 'action');

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

  useEffect(() => {
    if (!expanded || !needsActions || actions.length > 0 || loadFailed) return;
    adapter
      .getCallableTaskActions()
      .then(setActions)
      .catch((error) => {
        logError('WorkflowHooksSection:loadActions', error);
        setLoadFailed(true);
      });
  }, [expanded, needsActions, actions.length, loadFailed, adapter]);

  const optionsFor = (kind: WorkflowHookKind): HookOption[] =>
    HOOK_INVOCATION[kind] === 'action'
      ? actions.map((action) => ({ id: action.id, name: action.name, detail: action.messageName }))
      : workflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          detail: workflow.primaryEntity,
        }));

  const setHook = (kind: WorkflowHookKind, workflowId: string | null) => {
    const chosen = optionsFor(kind).find((option) => option.id === workflowId);
    onChange({
      ...value,
      [kind]: { workflowId, workflowName: chosen?.name ?? null },
    });
  };

  return (
    <div>
      <button type="button" style={style.header} onClick={() => setExpanded((open) => !open)}>
        <span style={style.caret}>{expanded ? '▾' : '▸'}</span>
        <span>Workflows</span>
        {!expanded && summary && <span style={style.summaryBadge}>{summary}</span>}
      </button>

      {expanded && (
        <div style={style.body}>
          {scopeNote && <div style={style.notice}>{scopeNote}</div>}

          {kinds.map((kind) => {
            const options = optionsFor(kind);
            return (
              <div key={kind} style={style.field}>
                <label style={style.label} htmlFor={`${sectionId}-${kind}`}>{HOOK_LABELS[kind]}</label>
                <select
                  id={`${sectionId}-${kind}`}
                  style={style.select}
                  value={value[kind]?.workflowId ?? ''}
                  onChange={(event) => setHook(kind, event.target.value || null)}
                >
                  <option value="">— Run nothing —</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} · {option.detail}
                    </option>
                  ))}
                </select>
                {HOOK_INVOCATION[kind] === 'action' && (
                  <span style={style.hint}>
                    The engine sends this one as a message, so it lists Actions on the task
                    table rather than workflows.
                  </span>
                )}
                {options.length === 0 && !loadFailed && (
                  <span style={style.hint}>
                    {HOOK_INVOCATION[kind] === 'action'
                      ? 'No Actions are bound to the task table in this environment yet.'
                      : 'Only activated workflows marked “run on demand” can be called, because that is exactly the flag the engine’s execute request needs.'}
                  </span>
                )}
              </div>
            );
          })}
          {loadFailed && <div style={style.notice}>Could not load workflows.</div>}
        </div>
      )}
    </div>
  );
}

// --- two surfaces: the dark edit panels, and the light Fluent process panel ---

interface SectionPalette {
  header: React.CSSProperties;
  caret: React.CSSProperties;
  summaryBadge: React.CSSProperties;
  body: React.CSSProperties;
  notice: React.CSSProperties;
  field: React.CSSProperties;
  label: React.CSSProperties;
  select: React.CSSProperties;
  hint: React.CSSProperties;
}

const baseHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 0',
  background: 'transparent', border: 'none', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', textAlign: 'left',
};
const baseBody: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 };
const baseField: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const baseLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
};
const baseSelect: React.CSSProperties = {
  height: 30, padding: '0 8px', borderRadius: 4, fontSize: 12, outline: 'none',
  width: '100%', boxSizing: 'border-box',
};
const baseBadge: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 9, fontWeight: 700, borderRadius: 3, padding: '1px 5px',
  textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap',
};

const PALETTE: Record<'dark' | 'light', SectionPalette> = {
  dark: {
    header: { ...baseHeader, color: '#94a3b8' },
    caret: { fontSize: 10, color: '#64748b' },
    summaryBadge: { ...baseBadge, color: '#a5f3fc', background: '#083344', border: '1px solid #0e7490' },
    body: baseBody,
    notice: {
      fontSize: 10, color: '#a5f3fc', background: '#082f39', border: '1px solid #0e7490',
      borderRadius: 4, padding: '6px 8px', lineHeight: 1.4,
    },
    field: baseField,
    label: { ...baseLabel, color: '#64748b' },
    select: { ...baseSelect, background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' },
    hint: { fontSize: 10, color: '#64748b', lineHeight: 1.4 },
  },
  light: {
    header: { ...baseHeader, color: '#64748b' },
    caret: { fontSize: 10, color: '#94a3b8' },
    summaryBadge: { ...baseBadge, color: '#0e7490', background: '#ecfeff', border: '1px solid #a5f3fc' },
    body: baseBody,
    notice: {
      fontSize: 10, color: '#0e7490', background: '#ecfeff', border: '1px solid #a5f3fc',
      borderRadius: 4, padding: '6px 8px', lineHeight: 1.4,
    },
    field: baseField,
    label: { ...baseLabel, color: '#64748b' },
    select: { ...baseSelect, background: '#fff', border: '1px solid #d1d5db', color: '#1e293b' },
    hint: { fontSize: 10, color: '#6b7280', lineHeight: 1.4 },
  },
};
