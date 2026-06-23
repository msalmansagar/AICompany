'use client';

import React, { useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { SidebarNav, TopNav, AppHeader, AppFooter } from '@portal/ui';
import type { NavItem, UserProfile, LinkedEntity } from '@portal/types';
import { usePortalConfig } from '../../contexts/PortalConfigContext';
import { useActiveEntity } from '../../contexts/ActiveEntityContext';

interface PortalShellProps {
  navItems: NavItem[];
  user: UserProfile;
  locale: string;
  children: React.ReactNode;
}

const useStyles = makeStyles({
  shellSidebar: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  shellTopNav: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflowX: 'hidden',
  },
  pageArea: {
    flex: 1,
    paddingInline: tokens.spacingHorizontalXXL,
    paddingBlock: tokens.spacingVerticalXL,
    overflowY: 'auto',
  },
});

/**
 * Derives the active page code from the current Next.js pathname.
 * Matches the last non-locale segment against the nav items.
 */
function deriveActivePageCode(pathname: string, navItems: NavItem[]): string {
  // Strip the locale prefix: /en/dashboard → /dashboard
  const withoutLocale = pathname.replace(/^\/(en|ar)/, '');
  const segments = withoutLocale.split('/').filter(Boolean);
  const firstSegment = segments[0] ?? '';

  const flatItems = navItems.flatMap((item) => [item, ...(item.children ?? [])]);
  const match = flatItems.find((item) => item.pageCode === firstSegment);
  return match?.pageCode ?? firstSegment;
}

export function PortalShell({ navItems, user, locale, children }: PortalShellProps) {
  const styles = useStyles();
  const portalConfig = usePortalConfig();
  const { activeEntity, setActiveEntity } = useActiveEntity();
  const pathname = usePathname();
  const router = useRouter();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    portalConfig.sidebarDefaultState === 'collapsed'
  );

  const activePageCode = deriveActivePageCode(pathname, navItems);

  const handleMenuToggle = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  const handleEntitySelect = useCallback(
    (entity: LinkedEntity) => {
      setActiveEntity(entity);
    },
    [setActiveEntity]
  );

  const handleSignOut = useCallback(async () => {
    await signOut({ callbackUrl: `/${locale}/login` });
  }, [locale]);

  const handleProfileClick = useCallback(() => {
    router.push(`/${locale}/profile`);
  }, [locale, router]);

  const handleLanguageToggle = useCallback(() => {
    const nextLocale = locale === 'ar' ? 'en' : 'ar';
    // Replace the locale segment in the current path
    const newPath = pathname.replace(/^\/(en|ar)/, `/${nextLocale}`);
    router.push(newPath);
  }, [locale, pathname, router]);

  const handleTopNavNavigate = useCallback(
    (pageCode: string) => {
      router.push(`/${locale}/${pageCode}`);
    },
    [locale, router]
  );

  const header = (
    <AppHeader
      portalConfig={portalConfig}
      user={user}
      activeEntity={activeEntity}
      onMenuToggle={handleMenuToggle}
      onEntitySelect={handleEntitySelect}
      onSignOut={() => void handleSignOut()}
      onProfileClick={handleProfileClick}
      onLanguageToggle={handleLanguageToggle}
      currentLocale={locale}
    />
  );

  if (portalConfig.navLayout === 'top-nav') {
    return (
      <div className={styles.shellTopNav}>
        {header}
        <TopNav
          items={navItems}
          activePageCode={activePageCode}
          onNavigate={handleTopNavNavigate}
        />
        <main className={styles.pageArea}>{children}</main>
        <AppFooter portalConfig={portalConfig} />
      </div>
    );
  }

  return (
    <div className={styles.shellSidebar}>
      <SidebarNav
        items={navItems}
        activePageCode={activePageCode}
        isCollapsed={isSidebarCollapsed}
        onCollapse={handleMenuToggle}
        portalConfig={portalConfig}
      />
      <div className={styles.mainContent}>
        {header}
        <main className={styles.pageArea}>{children}</main>
        <AppFooter portalConfig={portalConfig} />
      </div>
    </div>
  );
}
