// The application shell: app bar above, sitemap beside, screen within.
//
// The sitemap hides on the immersive screens. The form editor and the preview
// need every pixel of width for the canvas, and a maker who is inside a form is
// not navigating the product. The app bar always stays, so the appearance picker
// is reachable from wherever they are.

import React, { useState } from 'react';
import type { DesignerScreen } from '@/state/designerStore';
import { AppHeader } from './AppHeader';
import { SitemapNav } from './SitemapNav';

const IMMERSIVE_SCREENS: readonly DesignerScreen[] = ['designer', 'preview', 'new-form-wizard'];

interface AppShellProps {
  currentScreen: DesignerScreen;
  onNavigate: (screen: DesignerScreen) => void;
  userFullName?: string;
  children: React.ReactNode;
}

export function AppShell({
  currentScreen,
  onNavigate,
  userFullName,
  children,
}: AppShellProps): React.ReactElement {
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  const showsNav = !IMMERSIVE_SCREENS.includes(currentScreen);

  return (
    <div className="app-shell">
      <AppHeader
        userFullName={userFullName}
        isNavVisible={showsNav && !isNavCollapsed}
        onToggleNav={() => setIsNavCollapsed((collapsed) => !collapsed)}
      />
      <div className={showsNav ? 'app-body' : 'app-body no-nav'}>
        {showsNav && (
          <SitemapNav
            currentScreen={currentScreen}
            onNavigate={onNavigate}
            isCollapsed={isNavCollapsed}
          />
        )}
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
