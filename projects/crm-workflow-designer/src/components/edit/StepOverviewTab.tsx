import { useMemo } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { computeStepRelationships } from '@/services/stepRelationships';
import type { RelationKind, StepRelation } from '@/services/stepRelationships';
import { escalationSummaryText } from '@/services/escalationFields';
import { ASSIGN_TO_LABELS } from '@/services/taskAssignment';
import type { WorkflowStep } from '@/types/WorkflowTypes';

/**
 * The Overview tab of the step panel (CWFD-017 PR3): the selected step's
 * relationships in words — what arrives here, where each decision can send
 * the work, who owns it, and how long they have. Every fact comes from the
 * store; nothing is invented. Entries naming another step are links that
 * select it, so the panel doubles as a way to walk the process.
 */
export function StepOverviewTab({ step }: { step: WorkflowStep }) {
  const { steps, outcomes, routes, validationResults, selectNode } = useWorkflowStore((s) => ({
    steps: s.steps,
    outcomes: s.outcomes,
    routes: s.routes,
    validationResults: s.validationResults,
    selectNode: s.selectNode,
  }));

  const relationships = useMemo(
    () => computeStepRelationships(step.crmId, steps, outcomes, routes),
    [step.crmId, steps, outcomes, routes]
  );

  const issueCount = validationResults.filter(
    (violation) =>
      violation.nodeId === step.crmId || violation.affectedNodeIds?.includes(step.crmId)
  ).length;

  const owner = resolveOwner(step);
  const sla = escalationSummaryText(step);

  return (
    <>
      <div style={counterRow}>
        <CounterChip glyph="◆" count={relationships.counts.decisions} label="decisions" color="var(--warning)" />
        <CounterChip glyph="↩" count={relationships.counts.returns} label="returns" color="var(--accent-branch)" />
        <CounterChip glyph="∥" count={relationships.counts.parallel} label="run at the same time" color="var(--primary)" />
        <CounterChip glyph="⚠" count={issueCount} label="validation findings" color="var(--error)" />
      </div>

      <RelationSection
        title="Incoming from"
        emptyText="Nothing routes into this step — the engine starts here, or it runs as a branch."
        relations={relationships.incoming}
        onPick={(stepId) => selectNode(`step_${stepId}`)}
      />

      <RelationSection
        title="Outgoing to"
        emptyText="No decisions yet — the step is a dead end until one is added."
        relations={relationships.outgoing}
        onPick={(stepId) => selectNode(`step_${stepId}`)}
      />

      {(relationships.parallelParent || relationships.parallelChildren.length > 0) && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>At the same time</div>
          {relationships.parallelParent && (
            <RelationRow
              label="Runs alongside"
              stepId={relationships.parallelParent.stepId}
              stepName={relationships.parallelParent.stepName}
              kind="parallel"
              onPick={(stepId) => selectNode(`step_${stepId}`)}
            />
          )}
          {relationships.parallelChildren.map((child) => (
            <RelationRow
              key={child.stepId}
              label="Starts with this step"
              stepId={child.stepId}
              stepName={child.stepName}
              kind="parallel"
              onPick={(stepId) => selectNode(`step_${stepId}`)}
            />
          ))}
        </div>
      )}

      <div style={sectionStyle}>
        <div style={sectionTitle}>Owner</div>
        <div style={factText}>{owner}</div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitle}>SLA / Escalation</div>
        <div style={factText}>{sla ?? 'No escalation configured'}</div>
      </div>
    </>
  );
}

/** Who does this step, as configured — mode plus the chosen assignee. */
function resolveOwner(step: WorkflowStep): string {
  const mode = ASSIGN_TO_LABELS[step.assignTo];
  if (step.assignTo === 'user') return step.assignedUserName ? `${step.assignedUserName} (${mode})` : `${mode} — nobody chosen yet`;
  if (step.assignTo === 'team') return step.teamName ? `${step.teamName} (${mode})` : `${mode} — no team chosen yet`;
  if (step.assignTo === 'roundRobin') return step.roundRobinTeamName ? `${step.roundRobinTeamName} (${mode})` : `${mode} — no team chosen yet`;
  return step.parentAssignUserFieldName
    ? `From the parent record's "${step.parentAssignUserFieldName}" field`
    : `${mode} — fields not configured yet`;
}

function CounterChip({
  glyph,
  count,
  label,
  color,
}: {
  glyph: string;
  count: number;
  label: string;
  color: string;
}) {
  if (count === 0) return null;
  return (
    <span style={counterChipStyle(color)} title={`${count} ${label}`}>
      {glyph} {count}
    </span>
  );
}

function RelationSection({
  title,
  emptyText,
  relations,
  onPick,
}: {
  title: string;
  emptyText: string;
  relations: StepRelation[];
  onPick(stepId: string): void;
}) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitle}>{title}</div>
      {relations.length === 0 && <div style={emptyTextStyle}>{emptyText}</div>}
      {relations.map((relation, index) => (
        <div key={`${relation.label}_${index}`}>
          <RelationRow
            label={relation.label}
            stepId={relation.stepId}
            stepName={relation.stepName}
            kind={relation.kind}
            onPick={onPick}
          />
          {relation.routes.map((route, routeIndex) => (
            <RelationRow
              key={`${route.label}_${routeIndex}`}
              label={route.isDefault ? `∕ ${route.label}` : route.label}
              stepId={route.stepId}
              stepName={route.stepName}
              kind="conditional"
              indented
              onPick={onPick}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const KIND_GLYPH: Record<RelationKind, { glyph: string; color: string; meaning: string }> = {
  plain: { glyph: '→', color: 'var(--success)', meaning: 'forward transition' },
  conditional: { glyph: '◆', color: 'var(--warning)', meaning: 'conditional routing' },
  return: { glyph: '↩', color: 'var(--accent-branch)', meaning: 'returns to an earlier step' },
  terminal: { glyph: '⊘', color: 'var(--error)', meaning: 'ends the process' },
  parallel: { glyph: '∥', color: 'var(--primary)', meaning: 'runs at the same time' },
};

function RelationRow({
  label,
  stepId,
  stepName,
  kind,
  indented = false,
  onPick,
}: {
  label: string;
  stepId: string | null;
  stepName: string;
  kind: RelationKind;
  indented?: boolean;
  onPick(stepId: string): void;
}) {
  const glyph = KIND_GLYPH[kind];
  const body = (
    <>
      <span style={{ color: glyph.color, flexShrink: 0, width: 14, textAlign: 'center' }} aria-hidden>
        {glyph.glyph}
      </span>
      <span style={rowLabel}>{label}</span>
      <span style={rowTarget(stepId !== null)}>{stepName}</span>
    </>
  );

  if (!stepId) {
    return (
      <div style={rowStyle(indented)} title={glyph.meaning}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      style={{ ...rowStyle(indented), ...rowButtonReset }}
      title={`${glyph.meaning} — click to select "${stepName}"`}
      onClick={() => onPick(stepId)}
    >
      {body}
    </button>
  );
}

const counterRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginBottom: 12,
};

function counterChipStyle(color: string): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    color,
    background: 'var(--surface-alt)',
    border: `1px solid ${color}`,
    borderRadius: 4,
    padding: '2px 8px',
  };
}

const sectionStyle: React.CSSProperties = { marginBottom: 14 };

const sectionTitle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-secondary)',
  marginBottom: 5,
};

const factText: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--text)',
};

const emptyTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  fontStyle: 'italic',
};

function rowStyle(indented: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '3px 4px',
    paddingLeft: indented ? 22 : 4,
    borderRadius: 5,
    fontSize: 11.5,
  };
}

const rowButtonReset: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  color: 'var(--text)',
};

const rowLabel: React.CSSProperties = {
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 1,
};

const rowTarget = (isLink: boolean): React.CSSProperties => ({
  fontSize: 11,
  color: isLink ? 'var(--primary)' : 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  textAlign: 'right',
  textDecoration: isLink ? 'underline' : undefined,
  textUnderlineOffset: 2,
});
