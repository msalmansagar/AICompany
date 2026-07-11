/**
 * IndexBasedKeyboardSensor — keyboard-accessible reordering for variable-height items.
 *
 * WHY: dnd-kit's built-in KeyboardSensor moves by pixel offset, which fails for
 * variable-height field and section cards (dnd-kit issue #985). This sensor moves
 * by sorted index position instead, which is always correct regardless of card height.
 *
 * Bindings:
 *   Alt+ArrowUp / Alt+ArrowDown         — within-container reorder (field or section)
 *   Alt+Shift+ArrowUp / Alt+Shift+Down  — cross-section field move (FR-009 Must-Have)
 *
 * Detection: reads data-sortable-id, data-sortable-container, data-sortable-type
 *            attributes from the element under the keyboard event target.
 * ARIA: announces every successful move via onAnnounce ("Moved X to position N of M").
 */

export interface SortableItemContext {
  readonly itemId: string;
  readonly containerId: string;
  readonly containerType: 'field' | 'section';
}

export interface IndexBasedKeyboardCallbacks {
  getFieldOrder: (sectionId: string) => string[];
  getSectionOrder: (tabId: string) => string[];
  reorderFields: (sectionId: string, newOrder: string[]) => void;
  reorderSections: (tabId: string, newOrder: string[]) => void;
  /** Returns the id of the sibling section in the given direction, or null at boundary. */
  getSiblingSection: (sectionId: string, direction: -1 | 1) => string | null;
  /** Moves a field to a different section at the given index position. */
  moveField: (fieldId: string, toSectionId: string, targetIndex: number) => void;
  getFieldLabel: (fieldId: string) => string;
  getSectionLabel: (sectionId: string) => string;
  onAnnounce: (message: string) => void;
}

export class IndexBasedKeyboardSensor {
  private readonly callbacks: IndexBasedKeyboardCallbacks;

  constructor(callbacks: IndexBasedKeyboardCallbacks) {
    this.callbacks = callbacks;
  }

  handleKeyDown = (event: KeyboardEvent): void => {
    if (!event.altKey) return;
    const direction = resolveArrowDirection(event.key);
    if (direction === null) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    const context = resolveItemContext(target);
    if (!context) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey) {
      // Alt+Shift is a field-only operation; on sections it is a deliberate no-op.
      if (context.containerType === 'field') {
        this.moveFieldToAdjacentSection(context, direction);
      }
      return;
    }

    if (context.containerType === 'field') {
      this.reorderFieldByIndex(context, direction);
    } else {
      this.reorderSectionByIndex(context, direction);
    }
  };

  private reorderFieldByIndex(ctx: SortableItemContext, direction: number): void {
    const { getFieldOrder, reorderFields, getFieldLabel, onAnnounce } = this.callbacks;
    const order = getFieldOrder(ctx.containerId);
    const currentIndex = order.indexOf(ctx.itemId);
    if (currentIndex === -1) return;

    const targetIndex = clampToValidIndex(currentIndex + direction, order.length);
    if (targetIndex === currentIndex) return;

    reorderFields(ctx.containerId, moveItemByIndex(order, currentIndex, targetIndex));
    onAnnounce(
      `Moved ${getFieldLabel(ctx.itemId)} to position ${targetIndex + 1} of ${order.length}`,
    );
  }

  private reorderSectionByIndex(ctx: SortableItemContext, direction: number): void {
    const { getSectionOrder, reorderSections, getSectionLabel, onAnnounce } = this.callbacks;
    const order = getSectionOrder(ctx.containerId);
    const currentIndex = order.indexOf(ctx.itemId);
    if (currentIndex === -1) return;

    const targetIndex = clampToValidIndex(currentIndex + direction, order.length);
    if (targetIndex === currentIndex) return;

    reorderSections(ctx.containerId, moveItemByIndex(order, currentIndex, targetIndex));
    onAnnounce(
      `Moved ${getSectionLabel(ctx.itemId)} to position ${targetIndex + 1} of ${order.length}`,
    );
  }

  /**
   * Implements FR-009 cross-section field move: Alt+Shift+Arrow.
   * Moving Up inserts at the end of the previous sibling section.
   * Moving Down inserts at the start of the next sibling section.
   */
  private moveFieldToAdjacentSection(ctx: SortableItemContext, direction: -1 | 1): void {
    const { getSiblingSection, moveField, getFieldOrder, getFieldLabel, onAnnounce } =
      this.callbacks;

    const siblingId = getSiblingSection(ctx.containerId, direction);
    if (!siblingId) return;

    const siblingOrder = getFieldOrder(siblingId);
    // Up: insert after last item in previous section; Down: insert before first item in next section
    const targetIndex = direction === -1 ? siblingOrder.length : 0;

    moveField(ctx.itemId, siblingId, targetIndex);

    const positionLabel = targetIndex + 1;
    const totalLabel = siblingOrder.length + 1;
    onAnnounce(
      `Moved ${getFieldLabel(ctx.itemId)} to position ${positionLabel} of ${totalLabel} in adjacent section`,
    );
  }
}

/** Returns -1 for ArrowUp, +1 for ArrowDown, null for all other keys. */
function resolveArrowDirection(key: string): -1 | 1 | null {
  if (key === 'ArrowUp') return -1;
  if (key === 'ArrowDown') return 1;
  return null;
}

/**
 * Walks up the DOM from the event target to find the nearest element carrying
 * data-sortable-* attributes. Returns null when no such element exists in the chain.
 */
function resolveItemContext(element: HTMLElement | null): SortableItemContext | null {
  if (!element) return null;
  const sortableEl = element.closest('[data-sortable-id]');
  if (!(sortableEl instanceof HTMLElement)) return null;

  const itemId = sortableEl.getAttribute('data-sortable-id');
  const containerId = sortableEl.getAttribute('data-sortable-container');
  const rawType = sortableEl.getAttribute('data-sortable-type');
  const containerType =
    rawType === 'field' || rawType === 'section' ? rawType : null;

  if (!itemId || !containerId || !containerType) return null;
  return { itemId, containerId, containerType };
}

/** Clamps index to [0, length - 1]. */
function clampToValidIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index));
}

/**
 * Returns a new array with the element at `from` moved to `to`.
 * Does not mutate the original array. Guards against out-of-bounds `from`
 * without resorting to a type assertion on the spliced element.
 */
export function moveItemByIndex<T>(array: readonly T[], from: number, to: number): T[] {
  const result = [...array];
  const removed = result.splice(from, 1);
  const moved = removed[0];
  if (moved === undefined) return result;
  result.splice(to, 0, moved);
  return result;
}
