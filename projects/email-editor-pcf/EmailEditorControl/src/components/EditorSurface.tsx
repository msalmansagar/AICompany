/**
 * EditorSurface.tsx
 * The contenteditable editing surface. Responsible for:
 *  - Rendering the current template value
 *  - Detecting "." keypress and firing onDotTyped with the trigger Range
 *  - Notifying parent of content changes via onChange
 *  - Forwarding the ref so the parent can access the DOM node
 */

import * as React from 'react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface EditorSurfaceProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onDotTyped: (triggerRange: Range) => void;
  readonly onEscape: () => void;
}

/**
 * We use useImperativeHandle to expose the raw HTMLDivElement ref
 * so the parent (EmailEditorComponent) can feed it to useEditorCursor.
 */
export const EditorSurface = forwardRef<HTMLDivElement, EditorSurfaceProps>(
  (props, ref) => {
    const innerRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);

    // Sync external value → DOM only when it differs, to avoid caret reset
    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      if (el.innerText !== props.value) {
        el.innerText = props.value;
      }
    }, [props.value]);

    const handleInput = () => {
      const el = innerRef.current;
      if (!el) return;
      props.onChange(el.innerText);
    };

    const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        props.onEscape();
        return;
      }

      if (event.key === '.') {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const current = sel.getRangeAt(0);
        if (current.startOffset === 0) return;

        const triggerRange = current.cloneRange();
        triggerRange.setStart(triggerRange.endContainer, triggerRange.endOffset - 1);
        triggerRange.setEnd(triggerRange.endContainer, triggerRange.endOffset);

        props.onDotTyped(triggerRange);
      }
    };

    return (
      <div
        ref={innerRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        role="textbox"
        aria-multiline="true"
        aria-label="Email template editor"
        style={{
          minHeight: '200px',
          padding: '8px 12px',
          fontFamily: 'Segoe UI, sans-serif',
          fontSize: '14px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          outline: 'none',
          border: '1px solid #c8c6c4',
          borderRadius: '2px',
          backgroundColor: '#ffffff',
          color: '#323130'
        }}
        onInput={handleInput}
        onKeyUp={handleKeyUp}
      />
    );
  }
);

EditorSurface.displayName = 'EditorSurface';
