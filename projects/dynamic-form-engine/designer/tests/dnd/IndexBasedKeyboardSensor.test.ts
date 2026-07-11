// RED → GREEN test suite for IndexBasedKeyboardSensor and moveItemByIndex.
// Written before the implementation per TDD mandate (.claude/rules/common.md).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IndexBasedKeyboardSensor,
  moveItemByIndex,
  type IndexBasedKeyboardCallbacks,
} from '@/designer/dnd/IndexBasedKeyboardSensor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCallbacks(
  fieldOrder: string[] = ['field-1', 'field-2', 'field-3'],
  sectionOrder: string[] = ['section-A', 'section-B'],
): IndexBasedKeyboardCallbacks & {
  reorderFields: ReturnType<typeof vi.fn>;
  reorderSections: ReturnType<typeof vi.fn>;
  onAnnounce: ReturnType<typeof vi.fn>;
} {
  return {
    getFieldOrder: vi.fn(() => fieldOrder),
    getSectionOrder: vi.fn(() => sectionOrder),
    reorderFields: vi.fn(),
    reorderSections: vi.fn(),
    getFieldLabel: vi.fn((id: string) => `Label ${id}`),
    getSectionLabel: vi.fn((id: string) => `Section ${id}`),
    getSiblingSection: vi.fn(() => null),
    moveField: vi.fn(),
    onAnnounce: vi.fn(),
  };
}

/** Creates a <div> with data-sortable-* attributes and appends it to document.body. */
function appendSortableElement(opts: {
  itemId: string;
  containerId: string;
  containerType: 'field' | 'section';
}): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('data-sortable-id', opts.itemId);
  el.setAttribute('data-sortable-container', opts.containerId);
  el.setAttribute('data-sortable-type', opts.containerType);
  document.body.appendChild(el);
  return el;
}

function dispatchAltArrow(key: 'ArrowUp' | 'ArrowDown', target: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: target, configurable: true });
  return event;
}

// ---------------------------------------------------------------------------
// moveItemByIndex — pure utility
// ---------------------------------------------------------------------------

describe('moveItemByIndex', () => {
  it('moveItemByIndex_movesItemDown_whenFromIsBeforeTo', () => {
    // Arrange
    const order = ['a', 'b', 'c'];
    // Act
    const result = moveItemByIndex(order, 0, 1);
    // Assert
    expect(result).toEqual(['b', 'a', 'c']);
  });

  it('moveItemByIndex_movesItemUp_whenFromIsAfterTo', () => {
    const result = moveItemByIndex(['a', 'b', 'c'], 2, 0);
    expect(result).toEqual(['c', 'a', 'b']);
  });

  it('moveItemByIndex_returnsIdenticalOrder_whenFromEqualsTo', () => {
    const result = moveItemByIndex(['a', 'b', 'c'], 1, 1);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('moveItemByIndex_doesNotMutateSourceArray', () => {
    const original = ['a', 'b', 'c'];
    moveItemByIndex(original, 0, 2);
    expect(original).toEqual(['a', 'b', 'c']);
  });

  it('moveItemByIndex_handlesOneItemArray_withoutThrowing', () => {
    expect(() => moveItemByIndex(['x'], 0, 0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// IndexBasedKeyboardSensor.handleKeyDown
// ---------------------------------------------------------------------------

describe('IndexBasedKeyboardSensor.handleKeyDown', () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    // Clean up any leftover DOM nodes between tests
    document.body.innerHTML = '';
  });

  it('handleKeyDown_ignoresEvent_whenAltKeyIsNotPressed', () => {
    // Arrange
    const callbacks = buildCallbacks();
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    el = appendSortableElement({ itemId: 'field-1', containerId: 'sec-A', containerType: 'field' });
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: false, bubbles: true });
    Object.defineProperty(event, 'target', { value: el, configurable: true });

    // Act
    sensor.handleKeyDown(event);

    // Assert
    expect(callbacks.reorderFields).not.toHaveBeenCalled();
  });

  it('handleKeyDown_ignoresEvent_whenKeyIsNotArrowUpOrDown', () => {
    const callbacks = buildCallbacks();
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    el = appendSortableElement({ itemId: 'field-1', containerId: 'sec-A', containerType: 'field' });
    const event = new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true });
    Object.defineProperty(event, 'target', { value: el, configurable: true });

    sensor.handleKeyDown(event);

    expect(callbacks.reorderFields).not.toHaveBeenCalled();
  });

  it('handleKeyDown_ignoresEvent_whenTargetHasNoSortableAttributes', () => {
    const callbacks = buildCallbacks();
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    const plainEl = document.createElement('div');
    document.body.appendChild(plainEl);
    const event = dispatchAltArrow('ArrowDown', plainEl);

    sensor.handleKeyDown(event);

    expect(callbacks.reorderFields).not.toHaveBeenCalled();
  });

  // --- Field reordering ---

  it('handleKeyDown_movesFieldDown_whenAltArrowDownOnFirstField', () => {
    const callbacks = buildCallbacks(['field-1', 'field-2', 'field-3']);
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    el = appendSortableElement({ itemId: 'field-1', containerId: 'sec-A', containerType: 'field' });
    const event = dispatchAltArrow('ArrowDown', el);

    sensor.handleKeyDown(event);

    expect(callbacks.reorderFields).toHaveBeenCalledWith('sec-A', ['field-2', 'field-1', 'field-3']);
  });

  it('handleKeyDown_movesFieldUp_whenAltArrowUpOnLastField', () => {
    const callbacks = buildCallbacks(['field-1', 'field-2', 'field-3']);
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    el = appendSortableElement({ itemId: 'field-3', containerId: 'sec-A', containerType: 'field' });
    const event = dispatchAltArrow('ArrowUp', el);

    sensor.handleKeyDown(event);

    expect(callbacks.reorderFields).toHaveBeenCalledWith('sec-A', ['field-1', 'field-3', 'field-2']);
  });

  it('handleKeyDown_doesNotReorder_whenLastFieldMovesDown', () => {
    // Clamp at end — already at position 3 of 3, ArrowDown has no effect.
    const callbacks = buildCallbacks(['field-1', 'field-2', 'field-3']);
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    el = appendSortableElement({ itemId: 'field-3', containerId: 'sec-A', containerType: 'field' });
    const event = dispatchAltArrow('ArrowDown', el);

    sensor.handleKeyDown(event);

    expect(callbacks.reorderFields).not.toHaveBeenCalled();
  });

  it('handleKeyDown_doesNotReorder_whenFirstFieldMovesUp', () => {
    // Clamp at start — already at position 1 of 3, ArrowUp has no effect.
    const callbacks = buildCallbacks(['field-1', 'field-2', 'field-3']);
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    el = appendSortableElement({ itemId: 'field-1', containerId: 'sec-A', containerType: 'field' });
    const event = dispatchAltArrow('ArrowUp', el);

    sensor.handleKeyDown(event);

    expect(callbacks.reorderFields).not.toHaveBeenCalled();
  });

  it('handleKeyDown_announcesMove_withCorrectPositionString', () => {
    const callbacks = buildCallbacks(['field-1', 'field-2', 'field-3']);
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    el = appendSortableElement({ itemId: 'field-1', containerId: 'sec-A', containerType: 'field' });
    const event = dispatchAltArrow('ArrowDown', el);

    sensor.handleKeyDown(event);

    expect(callbacks.onAnnounce).toHaveBeenCalledWith(
      expect.stringContaining('position 2 of 3'),
    );
  });

  // --- Section reordering ---

  it('handleKeyDown_movesSectionDown_whenAltArrowDownOnSection', () => {
    const callbacks = buildCallbacks([], ['sec-A', 'sec-B', 'sec-C']);
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    el = appendSortableElement({ itemId: 'sec-A', containerId: 'tab-1', containerType: 'section' });
    const event = dispatchAltArrow('ArrowDown', el);

    sensor.handleKeyDown(event);

    expect(callbacks.reorderSections).toHaveBeenCalledWith('tab-1', ['sec-B', 'sec-A', 'sec-C']);
  });

  it('handleKeyDown_doesNotReorderSection_whenAlreadyAtBottom', () => {
    const callbacks = buildCallbacks([], ['sec-A', 'sec-B']);
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    el = appendSortableElement({ itemId: 'sec-B', containerId: 'tab-1', containerType: 'section' });
    const event = dispatchAltArrow('ArrowDown', el);

    sensor.handleKeyDown(event);

    expect(callbacks.reorderSections).not.toHaveBeenCalled();
  });

  it('handleKeyDown_resolvesSortableId_fromChildElement', () => {
    // The event may fire on a child element (e.g. a text node wrapper) — the sensor
    // must walk up to the nearest [data-sortable-id] ancestor.
    const callbacks = buildCallbacks(['field-1', 'field-2']);
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    const parent = appendSortableElement({ itemId: 'field-1', containerId: 'sec-A', containerType: 'field' });
    const child = document.createElement('span');
    parent.appendChild(child);
    const event = dispatchAltArrow('ArrowDown', child);

    sensor.handleKeyDown(event);

    expect(callbacks.reorderFields).toHaveBeenCalledWith('sec-A', ['field-2', 'field-1']);
  });
});

// ---------------------------------------------------------------------------
// Alt+Shift+Arrow cross-section field move (FR-009 Must-Have)
// ---------------------------------------------------------------------------

describe('IndexBasedKeyboardSensor.handleKeyDown — cross-section move', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function buildCrossSectionCallbacks(opts: {
    siblingId?: string | null;
    siblingOrder?: string[];
  } = {}): IndexBasedKeyboardCallbacks & {
    moveField: ReturnType<typeof vi.fn>;
    onAnnounce: ReturnType<typeof vi.fn>;
    getSiblingSection: ReturnType<typeof vi.fn>;
  } {
    return {
      getFieldOrder: vi.fn((sectionId: string) =>
        sectionId === 'sec-B' ? (opts.siblingOrder ?? ['existing-1']) : ['field-A'],
      ),
      getSectionOrder: vi.fn(() => []),
      reorderFields: vi.fn(),
      reorderSections: vi.fn(),
      getSiblingSection: vi.fn(
        () => (opts.siblingId === undefined ? 'sec-B' : opts.siblingId),
      ),
      moveField: vi.fn(),
      getFieldLabel: vi.fn((id: string) => `Label ${id}`),
      getSectionLabel: vi.fn((id: string) => `Section ${id}`),
      onAnnounce: vi.fn(),
    };
  }

  function dispatchAltShiftArrow(
    key: 'ArrowUp' | 'ArrowDown',
    target: HTMLElement,
  ): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key,
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'target', { value: target, configurable: true });
    return event;
  }

  it('handleKeyDown_movesFieldDown_toStartOfNextSection_whenAltShiftArrowDown', () => {
    // Arrange
    const callbacks = buildCrossSectionCallbacks({ siblingOrder: ['existing-1', 'existing-2'] });
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    const el = document.createElement('div');
    el.setAttribute('data-sortable-id', 'field-A');
    el.setAttribute('data-sortable-container', 'sec-A');
    el.setAttribute('data-sortable-type', 'field');
    document.body.appendChild(el);
    const event = dispatchAltShiftArrow('ArrowDown', el);

    // Act
    sensor.handleKeyDown(event);

    // Assert — Down inserts at index 0 (start of next section)
    expect(callbacks.moveField).toHaveBeenCalledWith('field-A', 'sec-B', 0);
  });

  it('handleKeyDown_movesFieldUp_toEndOfPreviousSection_whenAltShiftArrowUp', () => {
    // Arrange — previous section has 2 existing fields
    const callbacks = buildCrossSectionCallbacks({ siblingOrder: ['existing-1', 'existing-2'] });
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    const el = document.createElement('div');
    el.setAttribute('data-sortable-id', 'field-A');
    el.setAttribute('data-sortable-container', 'sec-A');
    el.setAttribute('data-sortable-type', 'field');
    document.body.appendChild(el);
    const event = dispatchAltShiftArrow('ArrowUp', el);

    // Act
    sensor.handleKeyDown(event);

    // Assert — Up inserts at index 2 (end of previous section, after both existing fields)
    expect(callbacks.moveField).toHaveBeenCalledWith('field-A', 'sec-B', 2);
  });

  it('handleKeyDown_doesNotMoveField_whenNoPreviousSectionExists', () => {
    // At the first section — no sibling above
    const callbacks = buildCrossSectionCallbacks({ siblingId: null });
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    const el = document.createElement('div');
    el.setAttribute('data-sortable-id', 'field-A');
    el.setAttribute('data-sortable-container', 'sec-A');
    el.setAttribute('data-sortable-type', 'field');
    document.body.appendChild(el);
    const event = dispatchAltShiftArrow('ArrowUp', el);

    sensor.handleKeyDown(event);

    expect(callbacks.moveField).not.toHaveBeenCalled();
  });

  it('handleKeyDown_doesNotCrossSectionMove_whenContainerTypeIsSection', () => {
    // Alt+Shift+Arrow on a section header must be a deliberate no-op.
    // getSectionOrder returns a POPULATED order so that if the shiftKey guard
    // fails and reorderSectionByIndex is called, it would actually invoke
    // reorderSections — making the assertion meaningful.
    const callbacks = buildCrossSectionCallbacks();
    callbacks.getSectionOrder = vi.fn(() => ['sec-A', 'sec-B', 'sec-C']);
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    const el = document.createElement('div');
    el.setAttribute('data-sortable-id', 'sec-A');
    el.setAttribute('data-sortable-container', 'tab-1');
    el.setAttribute('data-sortable-type', 'section');
    document.body.appendChild(el);
    const event = dispatchAltShiftArrow('ArrowDown', el);

    sensor.handleKeyDown(event);

    // The shiftKey guard must short-circuit — neither cross-section move nor
    // within-section section reorder may fire on Alt+Shift+Arrow on a section.
    expect(callbacks.moveField).not.toHaveBeenCalled();
    expect(callbacks.reorderSections).not.toHaveBeenCalled();
  });

  it('handleKeyDown_announcesPositionInAdjacentSection_afterCrossMove', () => {
    // Adjacent section has 1 existing field; field moves to index 0 (Down)
    const callbacks = buildCrossSectionCallbacks({ siblingOrder: ['existing-1'] });
    const sensor = new IndexBasedKeyboardSensor(callbacks);
    const el = document.createElement('div');
    el.setAttribute('data-sortable-id', 'field-A');
    el.setAttribute('data-sortable-container', 'sec-A');
    el.setAttribute('data-sortable-type', 'field');
    document.body.appendChild(el);
    const event = dispatchAltShiftArrow('ArrowDown', el);

    sensor.handleKeyDown(event);

    expect(callbacks.onAnnounce).toHaveBeenCalledWith(
      expect.stringContaining('position 1 of 2 in adjacent section'),
    );
  });
});
