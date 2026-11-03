import { useMemo, useRef, useState } from 'react';
import { Panel, useReactFlow } from '@xyflow/react';

/**
 * Type-ahead step search (CWFD-009 P3).
 *
 * Finding "Sr. Credit Manager Approval" on a 35-step canvas meant panning
 * around a diagram by eye. Typing three letters and pressing Enter pans the
 * camera to the step and selects it — the same affordance every big-model
 * BPM tool ships.
 */

export interface GoToStepItem {
  /** The canvas node id (`step_<id>`). */
  nodeId: string;
  label: string;
  sequenceNo: number;
}

export function GoToStepPanel({
  items,
  onPick,
}: {
  items: GoToStepItem[];
  /** Called after the camera move so the host canvas can select the node. */
  onPick?: (nodeId: string) => void;
}) {
  const { getNode, setCenter, getZoom } = useReactFlow();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return items
      .filter(
        (item) =>
          item.label.toLowerCase().includes(needle) ||
          String(item.sequenceNo) === needle
      )
      .slice(0, 8);
  }, [items, query]);

  const pick = (item: GoToStepItem) => {
    const node = getNode(item.nodeId);
    if (node) {
      const width = node.measured?.width ?? 280;
      const height = node.measured?.height ?? 100;
      void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: Math.max(getZoom(), 0.9),
        duration: 400,
      });
      onPick?.(item.nodeId);
    }
    setQuery('');
    setHighlight(0);
    inputRef.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setQuery('');
      setHighlight(0);
      return;
    }
    if (matches.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(matches[Math.min(highlight, matches.length - 1)]);
    }
  };

  return (
    <Panel position="top-left" style={panelStyle}>
      <div style={boxStyle}>
        <span style={iconStyle} aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Go to step…"
          aria-label="Go to step"
          style={inputStyle}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {matches.length > 0 && (
        <div style={listStyle} role="listbox">
          {matches.map((item, index) => (
            <button
              key={item.nodeId}
              type="button"
              role="option"
              aria-selected={index === highlight}
              style={rowStyle(index === highlight)}
              onMouseEnter={() => setHighlight(index)}
              // click steals focus from the input before onClick — use pointer down
              onPointerDown={(event) => {
                event.preventDefault();
                pick(item);
              }}
            >
              <span style={seqStyle}>{item.sequenceNo}</span>
              <span style={labelStyle}>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

const panelStyle: React.CSSProperties = { margin: 10 };

const boxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  padding: '4px 8px',
  width: 210,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
};

const iconStyle: React.CSSProperties = {
  color: 'var(--text-disabled)',
  fontSize: 13,
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 12,
  width: '100%',
  fontFamily: 'inherit',
};

const listStyle: React.CSSProperties = {
  marginTop: 4,
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  width: 260,
};

function rowStyle(isHighlighted: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: isHighlighted ? 'var(--primary-tint-2)' : 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  };
}

const seqStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: 'var(--text-on-primary)',
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 700,
  padding: '1px 6px',
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
