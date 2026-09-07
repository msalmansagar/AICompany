import { useEffect } from 'react';
import { useStore } from 'zustand';
import { useReactFlow } from '@xyflow/react';
import { useWorkflowStore, selectCanvasIsReadOnly } from '@/store/workflowStore';

interface KeyboardShortcutsOptions {
  onSave: () => void;
  onPublish: () => void;
  onAutoLayout: () => void;
}

export function useKeyboardShortcuts({
  onSave,
  onPublish,
  onAutoLayout,
}: KeyboardShortcutsOptions): void {
  const { deleteElements, getNodes, setNodes } = useReactFlow();
  const { undo, redo } = useStore(useWorkflowStore.temporal);
  const { selectedId, isReadOnly } = useWorkflowStore((s) => ({
    selectedId: s.selectedId,
    isReadOnly: selectCanvasIsReadOnly(s),
  }));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const isCtrl = event.ctrlKey || event.metaKey;

      // Everything below changes the process. While a simulation is playing back the
      // canvas is being watched, not edited, so none of it should be reachable - the
      // toolbar hides the same actions.
      const isEditingShortcut =
        (isCtrl && (event.key === 'z' || event.key === 'y' || event.key === 's')) ||
        (isCtrl && event.shiftKey && (event.key === 'P' || event.key === 'L'));
      if (isReadOnly && isEditingShortcut) {
        event.preventDefault();
        return;
      }

      if (isCtrl && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if ((isCtrl && event.key === 'y') || (isCtrl && event.shiftKey && event.key === 'z')) {
        event.preventDefault();
        redo();
        return;
      }

      if (isCtrl && event.key === 's') {
        event.preventDefault();
        onSave();
        return;
      }

      if (isCtrl && event.shiftKey && event.key === 'P') {
        event.preventDefault();
        onPublish();
        return;
      }

      if (isCtrl && event.shiftKey && event.key === 'L') {
        event.preventDefault();
        onAutoLayout();
        return;
      }

      if (isCtrl && event.key === 'a') {
        event.preventDefault();
        const nodes = getNodes();
        setNodes(nodes.map((n) => ({ ...n, selected: true })));
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        event.preventDefault();
        deleteElements({ nodes: [{ id: selectedId }] });
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo,
    redo,
    onSave,
    onPublish,
    onAutoLayout,
    deleteElements,
    getNodes,
    setNodes,
    selectedId,
    isReadOnly,
  ]);
}
