import { useMemo, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { analyzeComplexity } from '@/services/ComplexityAnalyzer';
import type { ComplexityMetric, ComplexityLevel } from '@/services/ComplexityAnalyzer';
import type { SimPath, SimConcurrentBranch } from '@/services/PathEnumerator';

interface AutoSimulationPanelProps {
  onClose: () => void;
}

export function AutoSimulationPanel({ onClose }: AutoSimulationPanelProps) {
  const { processName, steps, outcomes, outcomeOrder, stepOrder, autoSimPaths } = useWorkflowStore((s) => ({
    processName: s.process?.name ?? 'Process',
    steps: s.steps,
    outcomes: s.outcomes,
    outcomeOrder: s.outcomeOrder,
    stepOrder: s.stepOrder,
    autoSimPaths: s.autoSimPaths,
  }));

  const [selectedPathIndex, setSelectedPathIndex] = useState(0);

  const complexity = useMemo(
    () => analyzeComplexity(stepOrder, steps, outcomes, outcomeOrder, autoSimPaths),
    [stepOrder, steps, outcomes, outcomeOrder, autoSimPaths]
  );

  const selectedPath = autoSimPaths[selectedPathIndex] ?? null;
  const longestPath = autoSimPaths.reduce((max, p) => Math.max(max, p.steps.length), 0);
  const shortestPath = autoSimPaths.reduce((min, p) => Math.min(min, p.steps.length), Infinity);

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>

        {/* Header */}
        <div style={headerStyle}>
          <div style={headerLeftStyle}>
            <span style={doneBadgeStyle}>✓ Simulation Complete</span>
            <span style={processTitleStyle}>{processName}</span>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle} title="Close">✕</button>
        </div>

        {/* Complexity */}
        <ComplexitySection complexity={complexity} />

        {/* Summary bar */}
        <div style={summaryBarStyle}>
          <Stat label="Total Paths" value={autoSimPaths.length} />
          <div style={statDividerStyle} />
          <Stat label="Longest" value={`${longestPath} steps`} />
          <div style={statDividerStyle} />
          <Stat label="Shortest" value={`${shortestPath === Infinity ? 0 : shortestPath} steps`} />
        </div>

        {autoSimPaths.length === 0 ? (
          <div style={emptyStyle}>No paths found. Add steps and connect them.</div>
        ) : (
          <div style={bodyStyle}>
            <div style={pathListStyle}>
              <div style={listHeaderStyle}>All Paths</div>
              {autoSimPaths.map((path, i) => (
                <PathListItem
                  key={path.id}
                  path={path}
                  index={i}
                  isSelected={i === selectedPathIndex}
                  onClick={() => setSelectedPathIndex(i)}
                />
              ))}
            </div>
            <div style={pathDetailStyle}>
              {selectedPath && <PathDetail path={selectedPath} index={selectedPathIndex} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PathListItem({
  path, index, isSelected, onClick,
}: { path: SimPath; index: number; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...listItemStyle,
        background: isSelected ? '#eff6ff' : 'transparent',
        borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
      }}
    >
      <div style={listItemTopStyle}>
        <span style={listItemTitleStyle}>Path {index + 1}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: endReasonColor(path.endReason) }}>
          {endReasonLabel(path.endReason)}
        </span>
      </div>
      <div style={listItemSubStyle}>{path.steps.length} step{path.steps.length !== 1 ? 's' : ''}</div>
    </button>
  );
}

function PathDetail({ path, index }: { path: SimPath; index: number }) {
  return (
    <div style={detailWrapStyle}>
      <div style={detailHeaderStyle}>
        <span style={detailTitleStyle}>Path {index + 1}</span>
        <span style={detailSubStyle}>{path.steps.length} steps</span>
      </div>
      <div style={flowStyle}>
        <div style={startTagStyle}>START</div>
        {path.steps.map((step, i) => (
          <div key={`${step.stepId}_${i}`}>
            <div style={connectorStyle}>↓</div>
            <StepCard
              stepName={step.stepName}
              assignType={step.assignType}
              assigneeName={step.assigneeName}
            />
            {step.concurrentBranches && <ConcurrentBranches branches={step.concurrentBranches} />}
            {step.outcomeTaken && (
              <div style={outcomeTagStyle}>
                <span style={outcomeArrowStyle}>↓</span>
                <span style={outcomeNameStyle}>{step.outcomeTaken.outcomeName}</span>
                {step.outcomeTaken.routeName && (
                  <span style={routeTagStyle}>◈ {step.outcomeTaken.routeName}</span>
                )}
              </div>
            )}
          </div>
        ))}
        <div style={connectorStyle}>↓</div>
        <div style={endTagBlockStyle}>
          <span style={{ color: endReasonColor(path.endReason), fontSize: 12, fontWeight: 600 }}>
            {path.endReason === 'end' ? '✓ Process Complete'
              : path.endReason === 'cycle' ? `↩ Loops to: ${path.cycleStepName ?? 'step'}`
              : path.endReason === 'unmatched-parallel' ? '⧉ Concurrent branches never come back together'
              : '⊘ No further outcomes'}
          </span>
        </div>
      </div>
    </div>
  );
}

function ComplexitySection({ complexity }: { complexity: ReturnType<typeof analyzeComplexity> }) {
  const overallLabel = {
    green: 'Low Complexity',
    yellow: 'Medium Complexity',
    red: 'High Complexity',
  }[complexity.overallLevel];

  return (
    <div style={complexitySectionStyle}>
      <div style={complexityHeaderStyle}>
        <span style={complexityTitleStyle}>Process Complexity</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: levelColor(complexity.overallLevel) }}>
          {overallLabel}
        </span>
      </div>
      <div style={metricsRowStyle}>
        <MetricCard metric={complexity.totalSteps} />
        <MetricCard metric={complexity.totalDecisions} />
        <MetricCard metric={complexity.totalReturnPaths} />
        <MetricCard metric={complexity.maxPathDepth} />
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: ComplexityMetric }) {
  return (
    <div style={metricCardStyle}>
      <div style={{ ...metricValueStyle, color: levelColor(metric.level) }}>{metric.value}</div>
      <div style={metricLabelStyle}>{metric.label}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: levelColor(metric.level), marginTop: 4 }}>
        {metric.level === 'green' ? 'Low' : metric.level === 'yellow' ? 'Medium' : 'High'}
      </div>
      <div style={thresholdRowStyle}>
        <span style={{ color: '#16a34a', fontSize: 9 }}>● {metric.greenRange}</span>
        <span style={{ color: '#d97706', fontSize: 9 }}>● {metric.yellowRange}</span>
        <span style={{ color: '#dc2626', fontSize: 9 }}>● {metric.redRange}</span>
      </div>
    </div>
  );
}

/**
 * DP-1: the branches of a parallel region, shown as one block. They all run — the
 * path list must not present them as alternatives, and interleaving them would
 * explode combinatorially (ADR-1-004).
 */
function ConcurrentBranches({ branches }: { branches: SimConcurrentBranch[] }) {
  return (
    <div style={concurrentBlockStyle}>
      <div style={concurrentTitleStyle}>⧉ These {branches.length} branches run at the same time</div>
      {branches.map((branch) => (
        <div key={branch.entryStepName} style={concurrentBranchStyle}>
          {branch.stepNames.join(' → ')}
        </div>
      ))}
    </div>
  );
}

function StepCard({
  stepName,
  assignType,
  assigneeName,
}: {
  stepName: string;
  assignType: string;
  assigneeName: string | null;
}) {
  const { bg, text } = assignHeaderColor(assignType);
  return (
    <div style={stepCardStyle}>
      <div style={{ ...stepCardHeaderStyle, background: bg }}>
        <span style={{ ...stepCardNameStyle, color: text }}>{stepName || 'Unnamed Step'}</span>
      </div>
      <div style={stepCardBodyStyle}>
        <span style={{ ...assignTypeStyle, background: `${bg}80`, color: text, borderColor: `${bg}` }}>
          {assignType}
        </span>
        {assigneeName && <span style={assigneeStyle}>{assigneeName}</span>}
      </div>
    </div>
  );
}

function assignHeaderColor(assignType: string): { bg: string; text: string } {
  if (assignType === 'Team') return { bg: '#ccfbf1', text: '#0f766e' };
  if (assignType === 'Round Robin') return { bg: '#ede9fe', text: '#5b21b6' };
  return { bg: '#dbeafe', text: '#1e40af' };
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={statStyle}>
      <span style={statValueStyle}>{value}</span>
      <span style={statLabelStyle}>{label}</span>
    </div>
  );
}

function levelColor(level: ComplexityLevel): string {
  if (level === 'green') return '#16a34a';
  if (level === 'yellow') return '#d97706';
  return '#dc2626';
}

function endReasonColor(reason: SimPath['endReason']): string {
  if (reason === 'end') return '#16a34a';
  if (reason === 'cycle') return '#7c3aed';
  return '#94a3b8';
}

function endReasonLabel(reason: SimPath['endReason']): string {
  if (reason === 'end') return 'Complete';
  if (reason === 'cycle') return 'Loop';
  return 'Terminal';
}

// --- Styles ---

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(248,250,252,0.94)',
  zIndex: 200,
  display: 'flex',
  alignItems: 'stretch',
  backdropFilter: 'blur(4px)',
};

const panelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: '#ffffff',
  overflow: 'hidden',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxShadow: '0 0 0 1px #e2e8f0',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 20px',
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  flexShrink: 0,
};

const headerLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const doneBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: '#16a34a',
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: 4,
  padding: '3px 10px',
};

const processTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#0f172a',
};

const closeBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  color: '#64748b',
  cursor: 'pointer',
  fontSize: 14,
};

const complexitySectionStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderBottom: '1px solid #f1f5f9',
  background: '#fafafa',
  flexShrink: 0,
};

const complexityHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 10,
};

const complexityTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const metricsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const metricCardStyle: React.CSSProperties = {
  flex: '1 1 120px',
  maxWidth: 180,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '10px 14px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
  lineHeight: 1,
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  fontWeight: 500,
  marginTop: 2,
};

const thresholdRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 5,
  marginTop: 6,
  flexWrap: 'wrap',
};

const summaryBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 20px',
  borderBottom: '1px solid #f1f5f9',
  background: '#f8fafc',
  flexShrink: 0,
  gap: 0,
};

const statStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '0 16px',
};

const statDividerStyle: React.CSSProperties = {
  width: 1,
  height: 30,
  background: '#e2e8f0',
};

const statValueStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: '#0f172a',
  lineHeight: 1,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#94a3b8',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginTop: 2,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
  minHeight: 0,
};

const pathListStyle: React.CSSProperties = {
  width: 200,
  borderRight: '1px solid #f1f5f9',
  overflowY: 'auto',
  flexShrink: 0,
  background: '#fafafa',
};

const listHeaderStyle: React.CSSProperties = {
  padding: '10px 14px 6px',
  fontSize: 10,
  fontWeight: 700,
  color: '#cbd5e1',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const listItemStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 14px',
  textAlign: 'left',
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.1s',
};

const listItemTopStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  marginBottom: 2,
};

const listItemTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#1e293b',
};

const listItemSubStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
};

const pathDetailStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0 0 24px',
  background: '#ffffff',
};

const detailWrapStyle: React.CSSProperties = {
  padding: '20px 28px',
};

const detailHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  marginBottom: 20,
};

const detailTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#0f172a',
};

const detailSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
};

const flowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
};

const startTagStyle: React.CSSProperties = {
  background: '#f1f5f9',
  color: '#64748b',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  borderRadius: 99,
  padding: '3px 14px',
  border: '1px solid #e2e8f0',
};

const connectorStyle: React.CSSProperties = {
  fontSize: 16,
  color: '#e2e8f0',
  lineHeight: 1,
  margin: '3px 0 3px 14px',
};

const concurrentBlockStyle: React.CSSProperties = {
  margin: '6px 0',
  padding: '8px 10px',
  background: '#f5f3ff',
  border: '1px dashed #a78bfa',
  borderRadius: 6,
  minWidth: 240,
  maxWidth: 380,
};

const concurrentTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#6d28d9',
  marginBottom: 4,
};

const concurrentBranchStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#4c1d95',
  lineHeight: 1.5,
};

const stepCardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  overflow: 'hidden',
  minWidth: 240,
  maxWidth: 380,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const stepCardHeaderStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
};

const stepCardNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#0f172a',
};

const stepCardBodyStyle: React.CSSProperties = {
  padding: '5px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const assignTypeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#64748b',
  background: '#f1f5f9',
  borderRadius: 99,
  padding: '1px 8px',
  border: '1px solid #e2e8f0',
};

const assigneeStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
};

const outcomeTagStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  margin: '2px 0 0 12px',
};

const outcomeArrowStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#cbd5e1',
};

const outcomeNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  padding: '1px 7px',
  background: '#f8fafc',
};

const routeTagStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#92400e',
  background: '#fef3c7',
  border: '1px solid #fcd34d',
  borderRadius: 4,
  padding: '1px 6px',
};

const endTagBlockStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '7px 14px',
  marginTop: 4,
};

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  color: '#94a3b8',
  fontSize: 13,
  padding: 40,
};
