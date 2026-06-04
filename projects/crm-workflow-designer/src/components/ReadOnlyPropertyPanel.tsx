import type { WorkflowData, CrmStep, CrmOutcome } from '../types/ViewTypes';
import { getAssignToLabel } from '../types/ViewTypes';

interface ReadOnlyPropertyPanelProps {
  data: WorkflowData | null;
  selectedId: string | null;
}

type SelectedItem =
  | { type: 'step'; step: CrmStep }
  | { type: 'outcome'; outcome: CrmOutcome }
  | null;

function resolveSelected(selectedId: string | null, data: WorkflowData | null): SelectedItem {
  if (!selectedId || !data) return null;

  if (selectedId.startsWith('step_')) {
    const id = selectedId.slice(5);
    const step = data.steps.find((s) => s.id === id);
    return step ? { type: 'step', step } : null;
  }
  // Back-edge clicks: e_back_{outcomeId}
  if (selectedId.startsWith('e_back_')) {
    const id = selectedId.slice(7);
    const outcome = data.outcomes.find((o) => o.id === id);
    return outcome ? { type: 'outcome', outcome } : null;
  }
  if (selectedId.startsWith('outcome_')) {
    const id = selectedId.slice(8);
    const outcome = data.outcomes.find((o) => o.id === id);
    return outcome ? { type: 'outcome', outcome } : null;
  }
  return null;
}

export function ReadOnlyPropertyPanel({ data, selectedId }: ReadOnlyPropertyPanelProps) {
  const selected = resolveSelected(selectedId, data);

  if (!data) {
    return (
      <div style={panelStyle}>
        <div style={emptyState}>
          <p style={emptyTitle}>No workflow loaded</p>
          <p style={emptyHint}>Open a workflow to see its details here.</p>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div style={panelStyle}>
        <ProcessInfo process={data.process} stepCount={data.steps.length} />
        <div style={emptyState}>
          <p style={emptyHint}>Click a step or a back-edge (↩) to see its details.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <ProcessInfo process={data.process} stepCount={data.steps.length} />
      {selected.type === 'step' && <StepDetails step={selected.step} />}
      {selected.type === 'outcome' && <OutcomeDetails outcome={selected.outcome} />}
    </div>
  );
}

function ProcessInfo({ process, stepCount }: { process: WorkflowData['process']; stepCount: number }) {
  return (
    <Section title="Process">
      <Field label="Name" value={process.name} />
      <Field label="Steps" value={String(stepCount)} />
      <Field label="Task Entity" value={process.recordEntityName} />
      <Field label="Regarding Field" value={process.regardingFieldName} />
      <Field label="Parent Entity" value={process.parentEntityName} />
    </Section>
  );
}

function StepDetails({ step }: { step: CrmStep }) {
  const assignLabel = getAssignToLabel(step.assignToCode);
  const assigneeName =
    assignLabel === 'Specific User'
      ? step.assignedUserName
      : assignLabel === 'Team'
      ? step.teamName
      : step.roundRobinTeamName;

  return (
    <Section title="Step Properties">
      <Field label="Name" value={step.name} bold />
      <Field label="Sequence No." value={String(step.sequenceNo)} />
      {step.schemaName && <Field label="Schema Name" value={step.schemaName} mono />}
      {step.taskSubject && <Field label="Task Subject" value={step.taskSubject} />}
      {step.taskDescription && <Field label="Task Description" value={step.taskDescription} multiline />}

      <Divider />
      <SectionLabel>Assignment</SectionLabel>
      <Field label="Assign To" value={assignLabel} />
      {assigneeName && <Field label={assignLabel === 'Round Robin' ? 'Round Robin Team' : assignLabel} value={assigneeName} />}
      {step.enableRoundRobin && <Field label="Round Robin" value="Enabled" />}

      <Divider />
      <SectionLabel>Entity Mapping</SectionLabel>
      <Field label="Task Entity" value={step.recordEntityName} />
      <Field label="Regarding Field" value={step.regardingFieldName} />
      <Field label="Parent Entity" value={step.parentEntityName} />
    </Section>
  );
}

function OutcomeDetails({ outcome }: { outcome: CrmOutcome }) {
  return (
    <Section title="Decision Properties">
      <Field label="Name" value={outcome.name} bold />
      <Field label="Sequence No." value={String(outcome.sequenceNumber)} />
      <Field label="Parent Step" value={outcome.stepName} />
      <Field label="Next Step" value={outcome.nextStepName ?? (outcome.nextStepId ? outcome.nextStepId : '— Terminal')} />
      <Field label="Apply Filter" value={outcome.applyFilter ? 'Yes — conditional routing active' : 'No'} />
    </Section>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitle}>{title}</div>
      <div style={sectionBody}>{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={subLabel}>{children}</div>;
}

function Divider() {
  return <div style={dividerStyle} />;
}

function Field({
  label,
  value,
  bold,
  mono,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  bold?: boolean;
  mono?: boolean;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div style={fieldRow}>
      <span style={fieldLabel}>{label}</span>
      <span
        style={{
          ...fieldValue,
          fontWeight: bold ? 600 : 400,
          fontFamily: mono ? 'monospace' : 'inherit',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
        }}
      >
        {value}
      </span>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 280,
  minWidth: 280,
  maxWidth: 280,
  background: '#fafafa',
  borderLeft: '1px solid #e2e8f0',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
};

const sectionStyle: React.CSSProperties = {
  borderBottom: '1px solid #e2e8f0',
  padding: '12px 14px',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  marginBottom: 8,
};

const sectionBody: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const subLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#475569',
  marginTop: 2,
  marginBottom: 2,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const fieldRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10,
  color: '#94a3b8',
  fontWeight: 500,
};

const fieldValue: React.CSSProperties = {
  fontSize: 12,
  color: '#1e293b',
  wordBreak: 'break-word',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid #f1f5f9',
  margin: '6px 0',
};

const emptyState: React.CSSProperties = {
  padding: '16px 14px',
};

const emptyTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  margin: '0 0 4px',
};

const emptyHint: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  margin: 0,
};

