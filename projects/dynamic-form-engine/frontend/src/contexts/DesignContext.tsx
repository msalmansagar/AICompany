import { createContext, useContext } from 'react';
import type { DesignPayload } from '@qdb/shared';
import { LIGHT_THEME } from '../theme/themes';

// â”€â”€ Default payload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Matches DEFAULT_LIGHT_THEME from backend. Used as a safe fallback
// when no DesignPayload is provided (e.g. in tests or on first render).

export const DEFAULT_DESIGN_PAYLOAD: DesignPayload = {
  theme: LIGHT_THEME,
  formDesign: {
    id: 'default-form-design',
    layoutType: 'SingleColumn',
    labelPosition: 'Top',
    sectionStyle: 'Card',
    tabStyle: 'Tabs',
    buttonStyle: 'Primary',
    animationEnabled: false,
    alignment: 'Left',
    stickyActionBar: false,
    skeletonLoaderEnabled: true,
    isActive: true,
  },
  sectionDesigns: {},
  fieldDesigns: {},
  buttonDesigns: {
    Submit: undefined,
    SaveDraft: undefined,
    Cancel: undefined,
  },
  layoutGrid: [],
};

export const DesignContext = createContext<DesignPayload>(DEFAULT_DESIGN_PAYLOAD);

export function useDesignContext(): DesignPayload {
  return useContext(DesignContext);
}
