import { useEffect } from 'react';
import { IndexBasedKeyboardSensor } from './IndexBasedKeyboardSensor';
import { useDesignerStore } from '@/state/designerStore';

interface UseIndexBasedKeyboardOptions {
  /** Called with a human-readable announcement string after each successful reorder. */
  onAnnounce: (message: string) => void;
}

/**
 * Wires the IndexBasedKeyboardSensor into the document keydown stream.
 *
 * Call this inside the DndContext in DesignerScreen alongside PointerSensor registration.
 * The sensor reads current store state at event time via getState(), so the effect
 * dependency array does not need to track every order array — they are always current.
 */
export function useIndexBasedKeyboard({ onAnnounce }: UseIndexBasedKeyboardOptions): void {
  const reorderFields = useDesignerStore(state => state.reorderFields);
  const reorderSections = useDesignerStore(state => state.reorderSections);

  useEffect(() => {
    const sensor = new IndexBasedKeyboardSensor({
      getFieldOrder: (sectionId) => useDesignerStore.getState().fieldOrder[sectionId] ?? [],
      getSectionOrder: (tabId) => useDesignerStore.getState().sectionOrder[tabId] ?? [],
      reorderFields,
      reorderSections,
      getSiblingSection: (sectionId, direction) => {
        const state = useDesignerStore.getState();
        const section = state.sections[sectionId];
        if (!section) return null;
        const order = state.sectionOrder[section.tabId] ?? [];
        const currentIndex = order.indexOf(sectionId);
        const targetIndex = currentIndex + direction;
        return targetIndex >= 0 && targetIndex < order.length
          ? (order[targetIndex] ?? null)
          : null;
      },
      moveField: (fieldId, toSectionId, targetIndex) =>
        useDesignerStore.getState().moveField(fieldId, toSectionId, targetIndex),
      getFieldLabel: (fieldId) => useDesignerStore.getState().fields[fieldId]?.label ?? fieldId,
      getSectionLabel: (sectionId) =>
        useDesignerStore.getState().sections[sectionId]?.label ?? sectionId,
      onAnnounce,
    });

    document.addEventListener('keydown', sensor.handleKeyDown);
    return () => document.removeEventListener('keydown', sensor.handleKeyDown);
  }, [reorderFields, reorderSections, onAnnounce]);
}
