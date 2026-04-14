/**
 * useEditorCursor.ts
 * Custom hook encapsulating all Selection / Range API operations
 * for the contenteditable editor surface.
 */

import { RefObject, useCallback, useRef } from 'react';

export interface EditorCursorApi {
  /** Save the current caret position (call before opening popup) */
  readonly saveSelection: () => void;
  /** Restore the previously saved caret position */
  readonly restoreSelection: () => void;
  /** Insert plain text at the current caret position */
  readonly insertTextAtCursor: (text: string) => void;
  /** Replace the given Range with text and advance the caret past it */
  readonly replaceRangeWithText: (range: Range, text: string) => void;
  /**
   * Returns a Range covering the "." that just triggered the popup,
   * or null if the caret is not positioned after a dot.
   */
  readonly getTriggerRangeForDot: () => Range | null;
}

export function useEditorCursor(
  surfaceRef: RefObject<HTMLDivElement | null>
): EditorCursorApi {
  const savedRange = useRef<Range | null>(null);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const range = savedRange.current;
    if (!range) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const insertTextAtCursor = useCallback(
    (text: string) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      if (!surfaceRef.current) return;

      const range = sel.getRangeAt(0);
      if (!surfaceRef.current.contains(range.startContainer)) return;

      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);

      const after = document.createRange();
      after.setStartAfter(node);
      after.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(after);
    },
    [surfaceRef]
  );

  const replaceRangeWithText = useCallback(
    (range: Range, text: string) => {
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);

      const sel = window.getSelection();
      if (!sel) return;

      const after = document.createRange();
      after.setStartAfter(node);
      after.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(after);
    },
    []
  );

  const getTriggerRangeForDot = useCallback((): Range | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const original = sel.getRangeAt(0);
    if (original.startOffset === 0) return null;

    const range = original.cloneRange();
    range.setStart(range.endContainer, range.endOffset - 1);
    range.setEnd(range.endContainer, range.endOffset);

    // Confirm the character at this range is actually "."
    const fragment = range.cloneContents();
    const char = fragment.textContent ?? '';
    if (char !== '.') return null;

    return range;
  }, []);

  return {
    saveSelection,
    restoreSelection,
    insertTextAtCursor,
    replaceRangeWithText,
    getTriggerRangeForDot
  };
}
