/**
 * IndexBasedKeyboardSensor — keyboard-accessible reordering for variable-height items.
 *
 * WHY: dnd-kit's built-in KeyboardSensor moves by pixel offset, which fails for
 * variable-height field and section cards (dnd-kit issue #985). This sensor moves
 * by sorted index position instead, which is always correct regardless of card height.
 *
 * Bindings: Alt+ArrowUp / Alt+ArrowDown on a focused sortable element.
 * Detection: reads data-sortable-id, data-sortable-container, data-sortable-type
 *            attributes from the element under the keyboard event's target.
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

    const context = resolveItemContext(event.target as HTMLElement | null);
    if (!context) return;

    event.preventDefault();
    event.stopPropagation();

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
    onAnnounce(`Moved ${getFieldLabel(ctx.itemId)} to position ${targetIndex + 1} of ${order.length}`);
  }

  private reorderSectionByIndex(ctx: SortableItemContext, direction: number): void {
    const { getSectionOrder, reorderSections, getSectionLabel, onAnnounce } = this.callbacks;
    const order = getSectionOrder(ctx.containerId);
    const currentIndex = order.indexOf(ctx.itemId);
    if (currentIndex === -1) return;

    const targetIndex = clampToValidIndex(currentIndex + direction, order.length);
    if (targetIndex === currentIndex) return;

    reorderSections(ctx.containerId, moveItemByIndex(order, currentIndex, targetIndex));
    onAnnounce(`Moved ${getSectionLabel(ctx.itemId)} to position ${targetIndex + 1} of ${order.length}`);
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
  const sortableEl = element.closest('[data-sortable-id]') as HTMLElement | null;
  if (!sortableEl) return null;

  const itemId = sortableEl.getAttribute('data-sortable-id');
  const containerId = sortableEl.getAttribute('data-sortable-container');
  const containerType = sortableEl.getAttribute('data-sortable-type') as 'field' | 'section' | null;

  if (!itemId || !containerId || !containerType) return null;
  return { itemId, containerId, containerType };
}

/** Clamps index to [0, length - 1]. */
function clampToValidIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index));
}

/**
 * Returns a new array with the element at `from` moved to `to`.
 * Does not mutate the original array.
 */
export function moveItemByIndex<T>(array: readonly T[], from: number, to: number): T[] {
  const result = [...array];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved as T);
  return result;
}
