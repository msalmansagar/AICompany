/**
 * useKeyboardNav.ts
 * Reusable keyboard navigation hook for the field selector popup.
 * Handles ArrowUp / ArrowDown selection, Enter confirm, Escape close,
 * ArrowRight drill-in, ArrowLeft drill-out.
 */

import { useCallback, useState } from 'react';

export interface KeyboardNavOptions<T> {
  readonly items: readonly T[];
  readonly onSelect: (item: T) => void;
  readonly onDrillIn: (item: T) => void;
  readonly onDrillOut: () => void;
  readonly onClose: () => void;
  readonly canDrillIn: (item: T) => boolean;
}

export interface KeyboardNavResult {
  readonly selectedIndex: number;
  readonly setSelectedIndex: (index: number) => void;
  readonly handleKeyDown: (event: React.KeyboardEvent) => void;
}

export function useKeyboardNav<T>(options: KeyboardNavOptions<T>): KeyboardNavResult {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const { items, onSelect, onDrillIn, onDrillOut, onClose, canDrillIn } = options;

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        }
        case 'Enter':
        case 'Tab': {
          event.preventDefault();
          const item = items[selectedIndex];
          if (item !== undefined) onSelect(item);
          break;
        }
        case 'ArrowRight': {
          event.preventDefault();
          const item = items[selectedIndex];
          if (item !== undefined && canDrillIn(item)) onDrillIn(item);
          break;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          onDrillOut();
          break;
        }
        case 'Escape': {
          event.preventDefault();
          onClose();
          break;
        }
      }
    },
    [options, selectedIndex]
  );

  return { selectedIndex, setSelectedIndex, handleKeyDown };
}
