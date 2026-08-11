import React from 'react';

interface ToolboxItem {
  type: string;
  label: string;
  color: string;
  shape: 'rect' | 'pill' | 'circle';
}

const TOOLBOX_ITEMS: ToolboxItem[] = [
  { type: 'step',    label: 'Task Step',     color: 'var(--primary)', shape: 'rect' },
  { type: 'outcome', label: 'Outcome',       color: 'var(--success)', shape: 'pill' },
  { type: 'end',     label: 'End',           color: 'var(--error)', shape: 'circle' },
];

export function WorkflowToolbox() {
  function onDragStart(e: React.DragEvent, type: string) {
    e.dataTransfer.setData('application/workflow-node', type);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div className="palette" aria-label="Component toolbox">
      <div className="palette-group">Toolbox</div>
      <div>
        {TOOLBOX_ITEMS.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            className="palette-item"
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

function dotStyle(color: string, shape: ToolboxItem['shape']): React.CSSProperties {
  return {
    width: 12,
    height: 12,
    flexShrink: 0,
    background: color,
    borderRadius: shape === 'circle' ? '50%' : shape === 'pill' ? 6 : 2,
  };
}
