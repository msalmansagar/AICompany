import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { HierarchyStepData } from '@/services/HierarchyGraphBuilder';
import { HIER_CARD_W } from '@/services/HierarchyGraphBuilder';
import { AssignIcon, assignTypeFromLabel } from './assignIcons';
import { stepAccent } from '@/styles/stepAccents';

/**
 * A step drawn the way the Dynamics org chart draws a person: an avatar of
 * initials on a soft tint, the name, who does it underneath, and a pill on
 * the connector that folds the whole subtree away. The card stays calm —
 * chips carry the two facts that matter at a glance (decision point,
 * ends the process).
 */
export function HierarchyStepNode({ data, selected }: NodeProps) {
  const d = data as unknown as HierarchyStepData;
  const isLR = d.layoutDir === 'LR';
  const accent = stepAccent(d.step.id);
  const hasChildren = d.childStepIds.length > 0;
  const isCollapsed = d.isCollapsed ?? false;

  return (
    <div style={cardStyle(selected ?? false)}>
      <Handle
        type="target"
        position={isLR ? Position.Left : Position.Top}
        id="in"
        style={quietHandle}
      />

      {/* Anchors for the outer-lane returns, on the gutter side. */}
      <Handle
        type="source"
        position={isLR ? Position.Top : Position.Left}
        id="return-out"
        style={returnHandle}
      />
      <Handle
        type="target"
        position={isLR ? Position.Top : Position.Left}
        id="return-in"
        style={{ ...returnHandle, ...(isLR ? { left: '35%' } : { top: '35%' }) }}
      />

      <div style={topRow}>
        <span style={avatarStyle(accent)}>{initialsOf(d.assigneeName ?? d.step.name)}</span>
        <div style={nameColumn}>
          <span style={nameStyle} title={d.step.name}>{d.step.name || 'Unnamed Step'}</span>
          <span style={subtitleStyle} title={d.assigneeName ?? undefined}>
            {d.assigneeName ?? 'Unassigned'}
          </span>
        </div>
        <span style={seqStyle}>{d.step.sequenceNo}</span>
      </div>

      <div style={chipRow}>
        <span style={iconChipStyle} title={d.assignLabel} aria-label={d.assignLabel} role="img">
          <AssignIcon type={assignTypeFromLabel(d.assignLabel)} />
        </span>
        {d.isDecisionPoint && <span style={decisionChip}>Decision point</span>}
        {d.isTerminating && <span style={endsChip}>Ends process</span>}
        {d.returnCount > 0 && (
          <button
            type="button"
            style={returnBadge(d.isReturnPinned ?? false)}
            title={
              (d.isReturnPinned
                ? 'Click to hide the return path'
                : 'Hover to peek, click to keep the return path visible') +
              ` — ${d.returnCount} return decision${d.returnCount === 1 ? '' : 's'}`
            }
            aria-pressed={d.isReturnPinned ?? false}
            onMouseEnter={() => d.onReturnHover?.(d.step.id)}
            onMouseLeave={() => d.onReturnHover?.(null)}
            onClick={(event) => {
              event.stopPropagation();
              d.onReturnToggle?.(d.step.id);
            }}
          >
            ↩ {d.returnCount}
          </button>
        )}
      </div>

      {hasChildren && (
        <button
          type="button"
          style={collapsePill(isLR)}
          title={
            isCollapsed
              ? `Show the ${d.descendantCount} step${d.descendantCount === 1 ? '' : 's'} below`
              : `Hide the ${d.descendantCount} step${d.descendantCount === 1 ? '' : 's'} below`
          }
          aria-expanded={!isCollapsed}
          onClick={(event) => {
            event.stopPropagation();
            d.onToggleCollapse?.(d.step.id);
          }}
        >
          <span style={pillCount}>{d.descendantCount}</span>
          <span aria-hidden>{isCollapsed ? (isLR ? '›' : '⌄') : (isLR ? '‹' : '⌃')}</span>
        </button>
      )}

      <Handle
        type="source"
        position={isLR ? Position.Right : Position.Bottom}
        id="out"
        style={quietHandle}
      />
    </div>
  );
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1][0] ?? '') : (words[0][1] ?? '');
  return (first + second).toUpperCase();
}

function cardStyle(isSelected: boolean): React.CSSProperties {
  return {
    width: HIER_CARD_W,
    background: 'var(--surface)',
    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px 12px',
    boxShadow: isSelected
      ? '0 0 0 3px rgba(37,99,235,0.15), 0 6px 16px rgba(0,0,0,0.10)'
      : '0 3px 10px rgba(0,0,0,0.08)',
    boxSizing: 'border-box',
    cursor: 'pointer',
    position: 'relative',
  };
}

function avatarStyle(accent: string): React.CSSProperties {
  return {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: `color-mix(in srgb, ${accent} 22%, var(--surface))`,
    color: accent,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  };
}

const topRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };

const nameColumn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
  flex: 1,
};

const nameStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const seqStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-disabled)',
  flexShrink: 0,
  alignSelf: 'flex-start',
};

const chipRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 10,
  minHeight: 20,
};

const iconChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 20,
  borderRadius: 4,
  background: 'var(--surface-alt)',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  flexShrink: 0,
};

const decisionChip: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--success)',
  background: 'var(--success-bg)',
  borderRadius: 4,
  padding: '2px 8px',
  whiteSpace: 'nowrap',
};

const endsChip: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--error)',
  background: 'var(--error-bg)',
  borderRadius: 4,
  padding: '2px 8px',
  whiteSpace: 'nowrap',
};

/** The subtree toggle, riding the outgoing connector like the org chart's. */
function collapsePill(isLR: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    ...(isLR
      ? { right: -46, top: '50%', transform: 'translateY(-50%)' }
      : { bottom: -30, left: '50%', transform: 'translateX(-50%)' }),
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 999,
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--primary)',
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    zIndex: 6,
  };
}

const pillCount: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
};

const quietHandle: React.CSSProperties = {
  width: 6,
  height: 6,
  border: 'none',
  background: 'var(--border-strong)',
};

// Return anchors sit on the gutter side, invisible until an edge uses them.
const returnHandle: React.CSSProperties = {
  width: 6,
  height: 6,
  border: 'none',
  background: 'transparent',
};

/** The ↩ badge: the fact lives on the card; the line appears on request. */
function returnBadge(isPinned: boolean): React.CSSProperties {
  return {
    fontSize: 10.5,
    fontWeight: 700,
    color: isPinned ? 'var(--text-on-primary)' : 'var(--accent-branch)',
    background: isPinned ? 'var(--accent-branch)' : 'var(--accent-branch-bg)',
    border: '1px solid var(--accent-branch)',
    borderRadius: 4,
    padding: '2px 8px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };
}
