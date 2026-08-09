import { emptyWorkflowHooks, PROCESS_HOOKS } from '@/services/workflowHooks';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import type {
  AutoNumberEntityOption,
  AutoNumberFieldOption,
  WorkflowProcess,
  WorkflowStep,
  WorkflowOutcome,
  WorkflowRoute,
} from '@/types/WorkflowTypes';
import { SearchableDropdown } from '@/components/common/SearchableDropdown';
import { PROCESS_TEMPLATES, getTemplate } from '@/services/processTemplates';

type WizardStep = 'method' | 'basics' | 'binding' | 'clone' | 'review';

/** A method is either a starter template id, or one of the special launchers. */
const METHOD_SOP = 'sop';
const METHOD_CLONE = 'clone';

interface ProcessWizardProps {
  adapter: ICrmAdapter;
  sopEnabled: boolean;
  onCreateInMemory: (
    process: WorkflowProcess,
    steps: WorkflowStep[],
    outcomes: WorkflowOutcome[],
    routes: WorkflowRoute[]
  ) => void;
  onClone: (processId: string) => void;
  onStartFromSop: () => void;
  onClose: () => void;
}

export function ProcessWizard({
  adapter,
  sopEnabled,
  onCreateInMemory,
  onClone,
  onStartFromSop,
  onClose,
}: ProcessWizardProps) {
  const [step, setStep] = useState<WizardStep>('method');
  const [method, setMethod] = useState<string | null>(null);

  const [name, setName] = useState('');

  const [entities, setEntities] = useState<AutoNumberEntityOption[]>([]);
  const [fields, setFields] = useState<AutoNumberFieldOption[]>([]);
  const [taskEntityId, setTaskEntityId] = useState<string | null>(null);
  const [taskEntityName, setTaskEntityName] = useState('');
  const [regardingFieldId, setRegardingFieldId] = useState<string | null>(null);
  const [regardingFieldName, setRegardingFieldName] = useState('');
  const [parentEntityId, setParentEntityId] = useState<string | null>(null);
  const [parentEntityName, setParentEntityName] = useState('');
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  const [cloneList, setCloneList] = useState<WorkflowProcess[]>([]);
  const [cloneSearch, setCloneSearch] = useState('');
  const [selectedCloneId, setSelectedCloneId] = useState<string | null>(null);
  const [isLoadingClone, setIsLoadingClone] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const isTemplateMethod = method !== null && method !== METHOD_SOP && method !== METHOD_CLONE;
  const parentSameAsTask = !!taskEntityId && taskEntityId === parentEntityId;
  const activeTemplate = isTemplateMethod && method ? getTemplate(method) : undefined;

  // Entities are needed for the template binding step; load once up-front.
  useEffect(() => {
    adapter.getAutoNumberEntities().then(setEntities).catch((err: unknown) =>
      setError(`Failed to load entities: ${err instanceof Error ? err.message : String(err)}`)
    );
  }, [adapter]);

  const steps: { key: WizardStep; label: string }[] = useMemo(() => {
    if (method === METHOD_CLONE) {
      return [{ key: 'method', label: 'Start' }, { key: 'clone', label: 'Choose process' }, { key: 'review', label: 'Review' }];
    }
    return [
      { key: 'method', label: 'Start' },
      { key: 'basics', label: 'Name' },
      { key: 'binding', label: 'Data binding' },
      { key: 'review', label: 'Review' },
    ];
  }, [method]);

  const handleTaskEntityChange = useCallback(
    (id: string, entityName: string) => {
      setTaskEntityId(id);
      setTaskEntityName(entityName);
      setRegardingFieldId(null);
      setRegardingFieldName('');
      setFields([]);
      setIsLoadingFields(true);
      adapter
        .getAutoNumberEntityFields(id)
        .then(setFields)
        .catch((err: unknown) =>
          setError(`Failed to load fields: ${err instanceof Error ? err.message : String(err)}`)
        )
        .finally(() => setIsLoadingFields(false));
    },
    [adapter]
  );

  const loadCloneList = useCallback(() => {
    setIsLoadingClone(true);
    adapter
      .getProcessList()
      .then(setCloneList)
      .catch((err: unknown) =>
        setError(`Failed to load processes: ${err instanceof Error ? err.message : String(err)}`)
      )
      .finally(() => setIsLoadingClone(false));
  }, [adapter]);

  const canProceed = useMemo(() => {
    switch (step) {
      case 'method': return method !== null;
      case 'basics': return name.trim().length > 0;
      case 'binding': return !!taskEntityId && !!regardingFieldId && !!parentEntityId && taskEntityId !== parentEntityId;
      case 'clone': return selectedCloneId !== null;
      case 'review': return true;
    }
  }, [step, method, name, taskEntityId, regardingFieldId, parentEntityId, selectedCloneId]);

  const handleCreate = useCallback(() => {
    if (method === METHOD_CLONE) {
      if (selectedCloneId) onClone(selectedCloneId);
      return;
    }
    const template = method ? getTemplate(method) : undefined;
    if (!template || !taskEntityId || !regardingFieldId || !parentEntityId) {
      setError('Cannot create process: a template and all data bindings are required.');
      return;
    }

    const processId = `tmp_${crypto.randomUUID()}`;
    const process: WorkflowProcess = {
      crmId: processId,
      name: name.trim(),
      recordEntity: taskEntityId,
      recordEntityName: null,
      regardingField: regardingFieldId,
      parentEntity: parentEntityId,
      parentEntityName: null,
      versionMajor: 1,
      versionMinor: 0,
      workflowHooks: emptyWorkflowHooks(PROCESS_HOOKS),
      workflowState: 'draft',
      snapshot: null,
    };
    const graph = template.build(processId);
    onCreateInMemory(process, graph.steps, graph.outcomes, graph.routes);
  }, [method, selectedCloneId, onClone, taskEntityId, regardingFieldId, parentEntityId, name, onCreateInMemory]);

  const handleNext = useCallback(() => {
    if (!canProceed) return;
    setError(null);
    if (step === 'method') {
      if (method === METHOD_SOP) { onStartFromSop(); return; }
      if (method === METHOD_CLONE) { loadCloneList(); setStep('clone'); return; }
      setStep('basics');
      return;
    }
    if (step === 'basics') { setStep('binding'); return; }
    if (step === 'binding') { setStep('review'); return; }
    if (step === 'clone') { setStep('review'); return; }
    if (step === 'review') { handleCreate(); }
  }, [canProceed, step, method, onStartFromSop, loadCloneList, handleCreate]);

  const handleBack = useCallback(() => {
    setError(null);
    if (step === 'basics' || step === 'clone') setStep('method');
    else if (step === 'binding') setStep('basics');
    else if (step === 'review') setStep(method === METHOD_CLONE ? 'clone' : 'binding');
  }, [step, method]);

  const isLastStep = step === 'review';
  const nextLabel = isLastStep
    ? (method === METHOD_CLONE ? 'Clone & Open' : 'Create & Open')
    : (step === 'method' && method === METHOD_SOP ? 'Open SOP Designer' : 'Next');

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="dialog"
        style={{ width: 760 }}
        role="dialog"
        aria-modal="true"
        aria-label="Create a process"
      >
        <div className="dialog-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>Create a process</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div style={splitStyle}>
          <Stepper steps={steps} current={step} />

          <div style={contentStyle}>
            {error && <div className="notice error" style={{ marginBottom: 12 }}>{error}</div>}

            {step === 'method' && (
              <MethodPicker method={method} sopEnabled={sopEnabled} onPick={setMethod} />
            )}

            {step === 'basics' && isTemplateMethod && (
              <BasicsStep name={name} onName={setName} templateName={activeTemplate?.name ?? ''} />
            )}

            {step === 'binding' && (
              <BindingStep
                entities={entities}
                fields={fields}
                isLoadingFields={isLoadingFields}
                taskEntityId={taskEntityId}
                regardingFieldId={regardingFieldId}
                parentEntityId={parentEntityId}
                onTaskEntity={handleTaskEntityChange}
                onRegardingField={(id, n) => { setRegardingFieldId(id); setRegardingFieldName(n); }}
                onParentEntity={(id, n) => { setParentEntityId(id); setParentEntityName(n); }}
                parentSameAsTask={parentSameAsTask}
              />
            )}

            {step === 'clone' && (
              <CloneStep
                list={cloneList}
                loading={isLoadingClone}
                search={cloneSearch}
                onSearch={setCloneSearch}
                selectedId={selectedCloneId}
                onSelect={setSelectedCloneId}
              />
            )}

            {step === 'review' && (
              <ReviewStep
                method={method}
                templateName={activeTemplate?.name ?? ''}
                stepCount={activeTemplate?.stepCount ?? 0}
                name={name}
                taskEntityName={taskEntityName}
                regardingFieldName={regardingFieldName}
                parentEntityName={parentEntityName}
                cloneName={cloneList.find((p) => p.crmId === selectedCloneId)?.name ?? ''}
              />
            )}
          </div>
        </div>

        <div className="dialog-foot" style={{ justifyContent: 'space-between' }}>
          {step !== 'method' ? (
            <button type="button" className="btn" onClick={handleBack}>Back</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn primary"
              onClick={handleNext}
              disabled={!canProceed}
            >
              {nextLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step: method picker ─────────────────────────────────────────────────────

function MethodPicker({
  method, sopEnabled, onPick,
}: {
  method: string | null;
  sopEnabled: boolean;
  onPick: (m: string) => void;
}) {
  const tiles: { id: string; icon: string; title: string; desc: string; disabled?: boolean }[] = [
    ...PROCESS_TEMPLATES.map((t) => ({
      id: t.id,
      icon: t.icon,
      title: t.name,
      desc: t.description,
    })),
    { id: METHOD_SOP, icon: '📋', title: 'From an SOP', desc: 'Generate a process from a published Standard Operating Procedure.', disabled: !sopEnabled },
    { id: METHOD_CLONE, icon: '📑', title: 'Clone existing', desc: 'Copy an existing process as your starting point.' },
  ];

  return (
    <div>
      <div style={stepTitleStyle}>How do you want to start?</div>
      <div style={tileGridStyle}>
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            onClick={() => onPick(t.id)}
            style={{
              ...tileStyle,
              ...(method === t.id ? tileSelectedStyle : {}),
              ...(t.disabled ? tileDisabledStyle : {}),
            }}
          >
            <span style={tileIconStyle}>{t.icon}</span>
            <span style={tileTitleStyle}>{t.title}</span>
            <span style={tileDescStyle}>{t.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step: basics ────────────────────────────────────────────────────────────

function BasicsStep({
  name, onName, templateName,
}: {
  name: string;
  onName: (v: string) => void;
  templateName: string;
}) {
  return (
    <div>
      <div style={stepTitleStyle}>Name your process</div>
      <div style={subtleStyle}>Starting from the <strong>{templateName}</strong> template.</div>
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Process name <span style={{ color: 'var(--error)' }}>*</span></label>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="e.g. Loan Approval"
          style={inputStyle}
          autoFocus
        />
      </div>
    </div>
  );
}

// ─── Step: data binding ──────────────────────────────────────────────────────

function BindingStep({
  entities, fields, isLoadingFields,
  taskEntityId, regardingFieldId, parentEntityId,
  onTaskEntity, onRegardingField, onParentEntity, parentSameAsTask,
}: {
  entities: AutoNumberEntityOption[];
  fields: AutoNumberFieldOption[];
  isLoadingFields: boolean;
  taskEntityId: string | null;
  regardingFieldId: string | null;
  parentEntityId: string | null;
  onTaskEntity: (id: string, name: string) => void;
  onRegardingField: (id: string, name: string) => void;
  onParentEntity: (id: string, name: string) => void;
  parentSameAsTask: boolean;
}) {
  return (
    <div>
      <div style={stepTitleStyle}>What does this process run on?</div>
      <div style={fieldGroupStyle}>
        <SearchableDropdown label="Task entity" placeholder="Search and select entity…" options={entities} value={taskEntityId} onChange={onTaskEntity} required />
        <div style={hintStyle}>The entity that stores each workflow task (e.g. QDB Task).</div>
      </div>
      <div style={fieldGroupStyle}>
        {isLoadingFields ? (
          <div style={subtleStyle}>Loading fields…</div>
        ) : (
          <SearchableDropdown label="Regarding field" placeholder={taskEntityId ? 'Search and select field…' : 'Select task entity first'} options={fields} value={regardingFieldId} onChange={onRegardingField} disabled={!taskEntityId} required />
        )}
        <div style={hintStyle}>Lookup on the task that links back to the parent record.</div>
      </div>
      <div style={fieldGroupStyle}>
        <SearchableDropdown label="Parent entity" placeholder="Search and select entity…" options={entities} value={parentEntityId} onChange={onParentEntity} required />
        <div style={hintStyle}>The business record the process runs on (e.g. Loan Application).</div>
        {parentSameAsTask && (
          <div style={fieldErrorStyle}>Parent entity must be different from the task entity.</div>
        )}
      </div>
    </div>
  );
}

// ─── Step: clone picker ──────────────────────────────────────────────────────

function CloneStep({
  list, loading, search, onSearch, selectedId, onSelect,
}: {
  list: WorkflowProcess[];
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const filtered = list.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div>
      <div style={stepTitleStyle}>Choose a process to clone</div>
      <input type="text" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Filter…" style={inputStyle} />
      <div style={cloneListStyle}>
        {loading ? (
          <div style={subtleStyle}>Loading processes…</div>
        ) : filtered.length === 0 ? (
          <div style={subtleStyle}>No processes found.</div>
        ) : (
          filtered.map((p) => (
            <button
              key={p.crmId}
              type="button"
              onClick={() => onSelect(p.crmId)}
              style={{ ...cloneRowStyle, ...(selectedId === p.crmId ? cloneRowSelectedStyle : {}) }}
            >
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={cloneStateStyle}>{p.workflowState}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Step: review ────────────────────────────────────────────────────────────

function ReviewStep({
  method, templateName, stepCount, name,
  taskEntityName, regardingFieldName, parentEntityName, cloneName,
}: {
  method: string | null;
  templateName: string;
  stepCount: number;
  name: string;
  taskEntityName: string;
  regardingFieldName: string;
  parentEntityName: string;
  cloneName: string;
}) {
  if (method === METHOD_CLONE) {
    return (
      <div>
        <div style={stepTitleStyle}>Review</div>
        <SummaryRow label="Start from" value={`Clone of “${cloneName}”`} />
        <div style={subtleStyle}>A copy will be created and opened in the designer.</div>
      </div>
    );
  }
  return (
    <div>
      <div style={stepTitleStyle}>Review</div>
      <SummaryRow label="Template" value={`${templateName} (${stepCount} step${stepCount !== 1 ? 's' : ''})`} />
      <SummaryRow label="Name" value={name} />
      <SummaryRow label="Task entity" value={taskEntityName} />
      <SummaryRow label="Regarding field" value={regardingFieldName} />
      <SummaryRow label="Parent entity" value={parentEntityName} />
      <div style={subtleStyle}>The process opens in the designer — nothing is saved until you click Save Draft.</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryRowStyle}>
      <span style={summaryLabelStyle}>{label}</span>
      <span style={summaryValueStyle}>{value || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</span>
    </div>
  );
}

// ─── Stepper rail ────────────────────────────────────────────────────────────

function Stepper({ steps, current }: { steps: { key: WizardStep; label: string }[]; current: WizardStep }) {
  const currentIndex = steps.findIndex((s) => s.key === current);
  return (
    <div style={stepperStyle}>
      {steps.map((s, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'todo';
        return (
          <div key={s.key} style={stepperItemStyle}>
            <span style={{
              ...stepperDotStyle,
              background: state === 'todo' ? 'var(--surface-alt)' : 'var(--primary)',
              color: state === 'todo' ? 'var(--text-disabled)' : 'var(--text-on-primary)',
            }}>
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span style={{ ...stepperLabelStyle, color: state === 'active' ? 'var(--text)' : 'var(--text-disabled)', fontWeight: state === 'active' ? 600 : 500 }}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const splitStyle: React.CSSProperties = { display: 'flex', minHeight: 320 };
const stepperStyle: React.CSSProperties = {
  width: 170, flexShrink: 0, background: 'var(--surface-alt)', borderRight: '1px solid var(--border)',
  padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 18, borderBottomLeftRadius: 12,
};
const stepperItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };
const stepperDotStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center',
  justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
};
const stepperLabelStyle: React.CSSProperties = { fontSize: 12 };
const contentStyle: React.CSSProperties = { flex: 1, padding: '20px 24px', overflowY: 'auto' };
const stepTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 };
const subtleStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 };
const tileGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const tileStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', textAlign: 'left',
  padding: '14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer',
};
const tileSelectedStyle: React.CSSProperties = { border: '2px solid var(--primary)', background: 'var(--primary-tint-2)' };
const tileDisabledStyle: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
const tileIconStyle: React.CSSProperties = { fontSize: 22 };
const tileTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text)' };
const tileDescStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 };
const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text)' };
const hintStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-disabled)', lineHeight: 1.4 };
const fieldErrorStyle: React.CSSProperties = { fontSize: 11, color: 'var(--error)', fontWeight: 600, lineHeight: 1.4 };
const inputStyle: React.CSSProperties = {
  height: 34, padding: '0 10px', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6,
  color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
};
const cloneListStyle: React.CSSProperties = {
  marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto',
};
const cloneRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px',
  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', fontSize: 13, textAlign: 'left',
};
const cloneRowSelectedStyle: React.CSSProperties = { border: '2px solid var(--primary)', background: 'var(--primary-tint-2)' };
const cloneStateStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' };
const summaryRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--border)',
};
const summaryLabelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)' };
const summaryValueStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right' };
