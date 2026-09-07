import { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { centerOnNode } from './canvasNavigation';
import { stepAccent } from '@/styles/stepAccents';
import type { CrmStep } from '@/types/ViewTypes';
import { getAssignToLabel } from '@/types/ViewTypes';

/**
 * The Hierarchy view's left rail — "Steps in this chart", after the org
 * chart's "Contacts added to chart": a searchable roster with avatars, the
 * assignee under each name, and a count in the header. Picking a row pans
 * the chart to the step and selects it.
 */
export function HierarchyStepList({
  steps,
  selectedId,
  onSelect,
}: {
  steps: CrmStep[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const reactFlow = useReactFlow();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const ordered = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo);
    if (!needle) return ordered;
    return ordered.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (assigneeOf(s) ?? '').toLowerCase().includes(needle)
    );
  }, [steps, query]);

  return (
    <aside style={railStyle} aria-label="Steps in this chart">
      <div style={searchRow}>
        <span style={searchIcon} aria-hidden>⌕</span>
        <input
          type="text"
          value={query}
          placeholder="Search steps"
          aria-label="Search steps"
          style={searchInput}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div style={headerRow}>
        <span style={headerLabel}>Steps in this chart</span>
        <span style={headerCount}>{rows.length}</span>
      </div>
      <div style={listStyle}>
        {rows.map((step) => {
          const nodeId = `step_${step.id}`;
          const isActive = selectedId === nodeId;
          const assignee = assigneeOf(step);
          return (
            <button
              key={step.id}
              type="button"
              style={rowStyle(isActive)}
              onClick={() => {
                // The card may be inside a collapsed subtree — selection
                // still lands, and the camera goes as far as it can.
                centerOnNode(reactFlow, nodeId);
                onSelect(nodeId);
              }}
            >
              <span style={avatarStyle(stepAccent(step.id))}>{initialsOf(assignee ?? step.name)}</span>
              <span style={rowText}>
                <span style={rowName}>{step.name || 'Unnamed Step'}</span>
                <span style={rowSub}>{assignee ?? 'Unassigned'}</span>
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <p style={emptyStyle}>No step matches "{query}".</p>}
      </div>
    </aside>
  );
}

function assigneeOf(step: CrmStep): string | null {
  const label = getAssignToLabel(step.assignToCode);
  if (label === 'Team') return step.teamName?.trim() || null;
  if (label === 'Round Robin') return step.roundRobinTeamName?.trim() || null;
  if (label === 'Read From Parent') return 'From the parent record';
  return step.assignedUserName?.trim() || null;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1][0] ?? '') : (words[0][1] ?? '');
  return (first + second).toUpperCase();
}

const railStyle: React.CSSProperties = {
  width: 264,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--surface)',
  borderRight: '1px solid var(--border)',
  overflow: 'hidden',
};

const searchRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
};

const searchIcon: React.CSSProperties = { color: 'var(--text-disabled)', fontSize: 14 };

const searchInput: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 12.5,
  width: '100%',
  fontFamily: 'inherit',
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
};

const headerLabel: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--text)',
};

const headerCount: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

const listStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', minHeight: 0 };

function rowStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '9px 12px',
    background: isActive ? 'var(--primary-tint-2)' : 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    textAlign: 'left',
  };
}

function avatarStyle(accent: string): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: `color-mix(in srgb, ${accent} 22%, var(--surface))`,
    color: accent,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  };
}

const rowText: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
};

const rowName: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const rowSub: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  padding: '14px 12px',
};
