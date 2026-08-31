import { useEffect, useId, useState } from 'react';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { logError } from '@/services/logError';
import {
  HOOK_INVOCATION,
  HOOK_LABELS,
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
}

export function WorkflowHooksSection({
  value,
  onChange,
  kinds,
  adapter,
  scopeNote,
}: WorkflowHooksSectionProps) {
  const sectionId = useId();
  const [workflows, setWorkflows] = useState<CallableWorkflowOption[]>([]);
  const [actions, setActions] = useState<CallableActionOption[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const needsActions = kinds.some((kind) => HOOK_INVOCATION[kind] === 'action');

  useEffect(() => {
    if (workflows.length > 0 || loadFailed) return;
    adapter
      .getCallableWorkflows()
      .then(setWorkflows)
      .catch((error) => {
        logError('WorkflowHooksSection:loadWorkflows', error);
        setLoadFailed(true);
      });
  }, [workflows.length, loadFailed, adapter]);

  useEffect(() => {
    if (!needsActions || actions.length > 0 || loadFailed) return;
    adapter
      .getCallableTaskActions()
      .then(setActions)
      .catch((error) => {
        logError('WorkflowHooksSection:loadActions', error);
        setLoadFailed(true);
      });
  }, [needsActions, actions.length, loadFailed, adapter]);

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
      {/* Always open (agentation feedback): a hook that exists should be seen,
          not discovered behind a fold. */}
      <div className="panel-section">Workflows</div>

      <div className="section-body">
          {scopeNote && <div className="notice">{scopeNote}</div>}

          {kinds.map((kind) => {
            const options = optionsFor(kind);
            return (
              <div key={kind} className="field">
                <label className="lbl" htmlFor={`${sectionId}-${kind}`}>{HOOK_LABELS[kind]}</label>
                <select
                  id={`${sectionId}-${kind}`}
                  className="fluent-select"
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
                  <span className="hint-inline">
                    The engine sends this one as a message, so it lists Actions on the task
                    table rather than workflows.
                  </span>
                )}
                {options.length === 0 && !loadFailed && (
                  <span className="hint-inline">
                    {HOOK_INVOCATION[kind] === 'action'
                      ? 'No Actions are bound to the task table in this environment yet.'
                      : 'Only activated workflows marked “run on demand” can be called, because that is exactly the flag the engine’s execute request needs.'}
                  </span>
                )}
              </div>
            );
          })}
          {loadFailed && <div className="notice">Could not load workflows.</div>}
      </div>
    </div>
  );
}

// --- two surfaces: the dark edit panels, and the light Fluent process panel ---

