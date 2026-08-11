import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { TechNewOutcomeData } from '../services/TechNewGraphBuilder';

export function TechNewOutcomeNode({ data }: NodeProps) {
  const { name, isReturn, isTerminal, nextStepName, layoutDir } = data as unknown as TechNewOutcomeData;
  const isLR = layoutDir === 'LR';

  // Handle positions depend on layout direction:
  // TB: outcomes sit to the RIGHT of steps → in=LEFT, out=RIGHT, term=BOTTOM
  // LR: outcomes sit BELOW steps → in=TOP, out=BOTTOM, term=RIGHT
  const inPos   = isLR ? Position.Top    : Position.Left;
  const outPos  = isLR ? Position.Bottom : Position.Right;
  const termPos = isLR ? Position.Right  : Position.Bottom;

  const style = outcomeStyle(isReturn, isTerminal);
  const rowIcon = isTerminal ? '⊘' : isReturn ? '↩' : '→';
  const targetLabel = isTerminal ? 'END' : (nextStepName ?? '…');

  return (
    <div style={style.container}>
      <Handle type="target" position={inPos} id="in" style={handleStyle(style.handleColor)} />

      <span style={style.icon}>{rowIcon}</span>
      <div style={contentStyle}>
        <span style={style.name}>{name}</span>
        <span style={style.target}>{targetLabel}</span>
      </div>

      {isTerminal ? (
        <Handle type="source" position={termPos} id="term" style={handleStyle(style.handleColor)} />
      ) : (
        <Handle type="source" position={outPos} id="out" style={handleStyle(style.handleColor)} />
      )}
    </div>
  );
}

interface OutcomeVisuals {
  container: React.CSSProperties;
  icon: React.CSSProperties;
  name: React.CSSProperties;
  target: React.CSSProperties;
  handleColor: string;
}

function outcomeStyle(isReturn: boolean, isTerminal: boolean): OutcomeVisuals {
  if (isTerminal) {
    return {
      container: pillContainer('var(--error)', 'var(--error)'),
      icon: iconStyle('var(--error)'),
      name: nameStyle('var(--error)'),
      target: targetStyle('var(--error)'),
      handleColor: 'var(--error)',
    };
  }
  if (isReturn) {
    return {
      container: pillContainer('var(--accent-branch)', 'var(--accent-branch)'),
      icon: iconStyle('var(--accent-branch)'),
      name: nameStyle('var(--accent-branch)'),
      target: targetStyle('var(--accent-branch)'),
      handleColor: 'var(--accent-branch)',
    };
  }
  return {
    container: pillContainer('var(--primary)', 'var(--primary)'),
    icon: iconStyle('var(--primary)'),
    name: nameStyle('var(--primary-pressed)'),
    target: targetStyle('var(--primary)'),
    handleColor: 'var(--primary)',
  };
}

function pillContainer(bg: string, border: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5,
    background: bg,
    border: `1.5px solid ${border}`,
    borderRadius: 20,
    padding: '4px 10px 4px 8px',
    minWidth: 140,
    maxWidth: 190,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    cursor: 'default',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  };
}

function iconStyle(color: string): React.CSSProperties {
  return { fontSize: 12, color, fontWeight: 700, flexShrink: 0, lineHeight: 1 };
}

function nameStyle(color: string): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 600, color,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
}

function targetStyle(color: string): React.CSSProperties {
  return {
    fontSize: 10, color, opacity: 0.75, fontStyle: 'italic',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
}

function handleStyle(color: string): React.CSSProperties {
  return { background: color, width: 8, height: 8, border: '2px solid var(--border)', borderRadius: '50%' };
}

const contentStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0,
};
