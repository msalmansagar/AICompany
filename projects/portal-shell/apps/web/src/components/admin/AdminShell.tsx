'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  HomeRegular,
  SettingsRegular,
  NavigationRegular,
  DocumentTextRegular,
  LayerRegular,
  GridRegular,
  SignOutRegular,
} from '@fluentui/react-icons';
import type { UserProfile } from '@portal/types';

// ── D365/Power Platform colour constants ──────────────────────────────────────
const TOP_BAR_BG     = '#1e2b6b';
const NAV_ACTIVE_BG  = '#EEF2FC';
const NAV_ACTIVE_CLR = '#0078D4';
const NAV_HOVER_BG   = '#F3F6FC';
const CONTENT_BG     = '#F3F2F1';

interface AdminShellProps {
  children: React.ReactNode;
  user: UserProfile;
  locale: string;
}

interface NavEntry {
  id: string;
  label: string;
  icon: React.ReactNode;
  segment: string;
}

const NAV_ENTRIES: NavEntry[] = [
  { id: 'portal',     label: 'Portal Settings',      icon: <SettingsRegular />,      segment: 'admin/portal'      },
  { id: 'nav',        label: 'Navigation Builder',   icon: <NavigationRegular />,    segment: 'admin/nav'         },
  { id: 'cms',        label: 'Content (CMS)',         icon: <DocumentTextRegular />,  segment: 'admin/cms'         },
  { id: 'components', label: 'Component Registry',   icon: <LayerRegular />,         segment: 'admin/components'  },
  { id: 'widgets',    label: 'Widget Configs',        icon: <GridRegular />,          segment: 'admin/widgets'     },
];

function AppGridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1" fill="white" opacity="0.9" />
      <rect x="9" y="1" width="6" height="6" rx="1" fill="white" opacity="0.7" />
      <rect x="1" y="9" width="6" height="6" rx="1" fill="white" opacity="0.7" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="white" opacity="0.5" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="white" aria-hidden="true">
      <rect y="3"  width="18" height="2" rx="1" />
      <rect y="8"  width="18" height="2" rx="1" />
      <rect y="13" width="18" height="2" rx="1" />
    </svg>
  );
}

export function AdminShell({ children, user, locale }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(segment: string): boolean {
    const withoutLocale = pathname.replace(/^\/(en|ar)\//, '');
    return withoutLocale.startsWith(segment);
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: `/${locale}/login` });
  }

  const initials = (user.displayName || user.email || 'A')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const navWidth = collapsed ? 48 : 240;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Top Application Bar ─────────────────────────────────────────────── */}
      <header
        style={{
          backgroundColor: TOP_BAR_BG,
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          paddingInline: '8px',
          gap: '6px',
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label="Toggle navigation"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'white', padding: '6px 8px', borderRadius: '4px',
            display: 'flex', alignItems: 'center',
          }}
        >
          <HamburgerIcon />
        </button>

        <div
          style={{
            width: '28px', height: '28px',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AppGridIcon />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginInlineStart: '4px' }}>
          <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: '14px', fontWeight: 600, letterSpacing: '-0.1px' }}>
            Portal
          </span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px' }}>|</span>
          <span style={{ color: 'rgba(255,255,255,0.70)', fontSize: '13px', fontWeight: 400 }}>
            Admin Console
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Back to portal */}
        <button
          onClick={() => router.push(`/${locale}/dashboard`)}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.25)',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.80)',
            fontSize: '12px',
            padding: '4px 10px',
            borderRadius: '4px',
            lineHeight: '20px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          ← Portal
        </button>

        {/* User display name */}
        <span
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: '12px',
            maxWidth: '160px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {user.displayName || user.email}
        </span>

        {/* Sign Out button */}
        <button
          onClick={() => void handleSignOut()}
          aria-label="Sign out"
          style={{
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.25)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '5px',
            color: 'rgba(255,255,255,0.90)',
            fontSize: '12px',
            padding: '4px 10px',
            borderRadius: '4px',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.20)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
        >
          <SignOutRegular style={{ fontSize: '14px' }} />
          Sign Out
        </button>
      </header>

      {/* ── Body row ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left Navigation ─────────────────────────────────────────────── */}
        <nav
          style={{
            width: `${navWidth}px`,
            backgroundColor: 'white',
            borderInlineEnd: '1px solid #E0E0E0',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'width 0.18s ease',
          }}
        >
          {!collapsed && (
            <div
              style={{
                paddingInline: '16px',
                paddingBlockStart: '14px',
                paddingBlockEnd: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#8A8886',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
              }}
            >
              Administration
            </div>
          )}

          {/* Home — back-link always visible */}
          <NavItem
            icon={<HomeRegular />}
            label="Portal Home"
            href={`/${locale}/dashboard`}
            active={false}
            collapsed={collapsed}
          />

          <div style={{ height: '1px', backgroundColor: '#F0F0F0', margin: '4px 8px' }} />

          {NAV_ENTRIES.map((entry) => (
            <NavItem
              key={entry.id}
              icon={entry.icon}
              label={entry.label}
              href={`/${locale}/${entry.segment}`}
              active={isActive(entry.segment)}
              collapsed={collapsed}
            />
          ))}

          <div style={{ flex: 1 }} />

          {/* Bottom user strip + sign out */}
          <div
            style={{
              borderBlockStart: '1px solid #F0F0F0',
              padding: collapsed ? '10px 4px' : '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
            >
              <div
                style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  backgroundColor: '#0078D4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: '11px', fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              {!collapsed && (
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#242424', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.displayName || user.email}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8A8886' }}>Administrator</div>
                </div>
              )}
            </div>
            <button
              onClick={() => void handleSignOut()}
              aria-label="Sign out"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 8px', borderRadius: '4px',
                color: '#605E5C', fontSize: '13px',
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#FDF3F2';
                e.currentTarget.style.color = '#C50F1F';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#605E5C';
              }}
            >
              <SignOutRegular style={{ fontSize: '16px', flexShrink: 0 }} />
              {!collapsed && <span>Sign out</span>}
            </button>
          </div>
        </nav>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: CONTENT_BG,
          }}
        >
          <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

// ── NavItem sub-component ─────────────────────────────────────────────────────
interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}

function NavItem({ icon, label, href, active, collapsed, onClick }: NavItemProps) {
  const [hovered, setHovered] = useState(false);
  const router = useRouter();

  const bg = active
    ? NAV_ACTIVE_BG
    : hovered
    ? NAV_HOVER_BG
    : 'transparent';

  const textColor = active ? NAV_ACTIVE_CLR : '#242424';
  const iconColor = active ? NAV_ACTIVE_CLR : '#605E5C';

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (onClick) {
      onClick();
    } else {
      router.push(href);
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        paddingInlineStart: collapsed ? '0' : `${active ? 9 : 12}px`,
        paddingInlineEnd: collapsed ? '0' : '12px',
        paddingBlock: '10px',
        textDecoration: 'none',
        backgroundColor: bg,
        color: textColor,
        fontSize: '14px',
        fontWeight: active ? 600 : 400,
        borderInlineStart: `3px solid ${active ? NAV_ACTIVE_CLR : 'transparent'}`,
        justifyContent: collapsed ? 'center' : 'flex-start',
        transition: 'background 0.1s',
        lineHeight: 1,
        cursor: 'pointer',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={active ? 'page' : undefined}
    >
      <span style={{ fontSize: '18px', flexShrink: 0, color: iconColor, display: 'flex' }}>
        {icon}
      </span>
      {!collapsed && <span>{label}</span>}
    </a>
  );
}
