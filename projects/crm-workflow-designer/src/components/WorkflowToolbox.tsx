import React from 'react';

interface ToolboxItem {
  type: string;
  label: string;
  color: string;
  shape: 'rect' | 'pill' | 'circle';
}

const TOOLBOX_ITEMS: ToolboxItem[] = [
  { type: 'step',    label: 'Task Step',     color: '#2563eb', shape: 'rect' },
  { type: 'outcome', label: 'Outcome',       color: '#059669', shape: 'pill' },
  { type: 'end',     label: 'End',           color: '#dc2626', shape: 'circle' },
];

export function WorkflowToolbox() {
  function onDragStart(e: React.DragEvent, type: string) {
    e.dataTransfer.setData('application/workflow-node', type);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div style={toolboxStyle} aria-label="Component Toolbox">
      <div style={headerStyle}>Toolbox</div>
      <div style={sectionStyle}>
        {TOOLBOX_ITEMS.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            style={itemStyle(item.color)}
            title={`Drag to add ${item.label}`}
            role="button"
            tabIndex={0}
          >
            <span style={dotStyle(item.color, item.shape)} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const toolboxStyle: React.CSSProperties = {
  width: 180,
  flexShrink: 0,
  background: '#f8fafc',
  borderRight: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
  background: '#f1f5f9',
};

const sectionStyle: React.CSSProperties = {
  padding: '10px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

function itemStyle(color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    borderRadius: 6,
    background: '#fff',
    border: `1px solid ${color}22`,
    cursor: 'grab',
    fontSize: 12,
    color: '#374151',
    userSelect: 'none',
    transition: 'box-shadow 0.15s',
  };
}

function dotStyle(color: string, shape: ToolboxItem['shape']): React.CSSProperties {
  return {
    width: 12,
    height: 12,
    flexShrink: 0,
    background: color,
    borderRadius: shape === 'circle' ? '50%' : shape === 'pill' ? 6 : 2,
  };
}
