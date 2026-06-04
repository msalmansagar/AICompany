import React, { useEffect } from 'react';
import { useDesignerStore } from '@/state/designerStore';

const AUTO_SAVE_INTERVAL_MS = 120_000; // 2 minutes

interface AppProvidersProps {
  children: React.ReactNode;
}

/** Wraps the application with auto-save middleware and dirty-state guards */
export function AppProviders({ children }: AppProvidersProps): React.ReactElement {
  const isDirty = useDesignerStore(state => state.isDirty);
  const currentScreen = useDesignerStore(state => state.currentScreen);

  // Warn user before closing browser with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): string | undefined {
      if (isDirty) {
        event.preventDefault();
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
      return undefined;
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Auto-save every 2 minutes when form is dirty and designer is open
  useEffect(() => {
    if (currentScreen !== 'designer') return;

    const interval = setInterval(() => {
      const state = useDesignerStore.getState();
      if (state.isDirty && !state.isSaving && state.form) {
        // Auto-save fires but does not block the UI
        // The actual save is triggered by the DesignerScreen via the save handler
        // Here we just dispatch a custom event the DesignerScreen listens to
        window.dispatchEvent(new CustomEvent('formdesigner:autosave'));
      }
    }, AUTO_SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [currentScreen]);

  return <>{children}</>;
}
