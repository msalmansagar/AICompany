'use client';

import React, { useState } from 'react';
import {
  Text,
  Tooltip,
  makeStyles,
  tokens,
  mergeClasses,
} from '@fluentui/react-components';
import {
  ChevronDownRegular,
  ChevronRightRegular,
  PanelLeftRegular,
  HomeRegular,
  DocumentRegular,
  PersonRegular,
  AlertRegular,
  MailRegular,
  SettingsRegular,
  QuestionCircleRegular,
  NewsRegular,
  GridRegular,
  ClipboardRegular,
} from '@fluentui/react-icons';
import type { NavItem, PortalConfig } from '@portal/types';
import { NavBadge } from './NavBadge';

interface SidebarNavProps {
  items: NavItem[];
  activePageCode: string;
  isCollapsed: boolean;
  onCollapse: () => void;
  portalConfig: Pick<
    PortalConfig,
    'primaryColor' | 'footerLeftLogoUrl' | 'footerRightLogoUrl' | 'footerPoweredByText' | 'portalName' | 'logoUrl'
  >;
}

/** Maps icon names stored in Dataverse to Fluent UI icon components */
const ICON_REGISTRY: Record<string, React.ReactElement> = {
  HomeRegular: <HomeRegular />,
  DocumentRegular: <DocumentRegular />,
  PersonRegular: <PersonRegular />,
  AlertRegular: <AlertRegular />,
  MailRegular: <MailRegular />,
  SettingsRegular: <SettingsRegular />,
  QuestionCircleRegular: <QuestionCircleRegular />,
  NewsRegular: <NewsRegular />,
  GridRegular: <GridRegular />,
  ClipboardRegular: <ClipboardRegular />,
};

function resolveIcon(iconName: string): React.ReactElement {
  return ICON_REGISTRY[iconName] ?? <DocumentRegular />;
}

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 64;

const useStyles = makeStyles({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'sticky',
    top: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderInlineEnd: `1px solid ${tokens.colorNeutralStroke2}`,
    transition: 'width 0.2s ease',
    overflow: 'hidden',
    flexShrink: 0,
    zIndex: 10,
  },
  sidebarExpanded: {
    width: `${SIDEBAR_WIDTH}px`,
  },
  sidebarCollapsed: {
    width: `${SIDEBAR_COLLAPSED_WIDTH}px`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    minHeight: '64px',
    flexShrink: 0,
  },
  headerCollapsed: {
    justifyContent: 'center',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    overflow: 'hidden',
  },
  logoImage: {
    width: '32px',
    height: '32px',
    objectFit: 'contain',
    flexShrink: 0,
  },
  logoText: {
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusMedium,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    flexShrink: 0,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorNeutralForeground1,
    },
  },
  navList: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalS,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  navItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    paddingInline: tokens.spacingHorizontalS,
    paddingBlock: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textDecoration: 'none',
    color: tokens.colorNeutralForeground2,
    transition: 'background-color 0.1s ease, color 0.1s ease',
    minHeight: '40px',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorNeutralForeground1,
    },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: '2px',
    },
  },
  navLinkActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
    },
  },
  navLinkCollapsed: {
    justifyContent: 'center',
    paddingInline: tokens.spacingHorizontalS,
  },
  navIcon: {
    flexShrink: 0,
    fontSize: '20px',
  },
  navLabel: {
    flex: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: tokens.fontSizeBase300,
    textAlign: 'start',
  },
  chevron: {
    flexShrink: 0,
    transition: 'transform 0.15s ease',
  },
  subList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    paddingInlineStart: tokens.spacingHorizontalL,
    marginBlockStart: '2px',
  },
  footer: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingInline: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    flexShrink: 0,
  },
  footerLogos: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  footerLogo: {
    height: '24px',
    objectFit: 'contain',
  },
  footerPoweredBy: {
    color: tokens.colorNeutralForeground3,
  },
});

interface NavItemRowProps {
  item: NavItem;
  activePageCode: string;
  isCollapsed: boolean;
  depth?: number;
}

function NavItemRow({ item, activePageCode, isCollapsed, depth = 0 }: NavItemRowProps) {
  const styles = useStyles();
  const [isExpanded, setIsExpanded] = useState(false);
  const isActive = item.pageCode === activePageCode;
  const hasChildren = (item.children?.length ?? 0) > 0;
  const liveCount = item.liveCount ?? 0;
  const staticCount =
    item.badgeSource === 'static' && item.badgeValue !== null ? parseInt(item.badgeValue, 10) : 0;
  const badgeCount = item.badgeSource === 'query' ? liveCount : staticCount;

  const linkClassName = mergeClasses(
    styles.navLink,
    isActive && styles.navLinkActive,
    isCollapsed && styles.navLinkCollapsed
  );

  const href = `/${item.pageCode}`;

  function handleExpandToggle(e: React.MouseEvent) {
    e.preventDefault();
    setIsExpanded((prev) => !prev);
  }

  const rowContent = (
    <a
      href={href}
      className={linkClassName}
      aria-current={isActive ? 'page' : undefined}
      onClick={hasChildren ? handleExpandToggle : undefined}
    >
      <span className={styles.navIcon}>{resolveIcon(item.icon)}</span>
      {!isCollapsed && (
        <>
          <span className={styles.navLabel}>{item.label}</span>
          {badgeCount > 0 && <NavBadge count={badgeCount} />}
          {hasChildren && (
            <span className={styles.chevron}>
              {isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
            </span>
          )}
        </>
      )}
      {isCollapsed && badgeCount > 0 && <NavBadge count={badgeCount} visibleWhenCollapsed />}
    </a>
  );

  return (
    <li className={styles.navItem}>
      {isCollapsed ? (
        <Tooltip content={item.label} relationship="label" positioning="after">
          {rowContent}
        </Tooltip>
      ) : (
        rowContent
      )}

      {hasChildren && isExpanded && !isCollapsed && (
        <ul className={styles.subList} role="list">
          {item.children?.map((child) => (
            <NavItemRow
              key={child.id}
              item={child}
              activePageCode={activePageCode}
              isCollapsed={isCollapsed}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SidebarNav({
  items,
  activePageCode,
  isCollapsed,
  onCollapse,
  portalConfig,
}: SidebarNavProps) {
  const styles = useStyles();

  const sidebarClass = mergeClasses(
    styles.sidebar,
    isCollapsed ? styles.sidebarCollapsed : styles.sidebarExpanded
  );

  return (
    <nav className={sidebarClass} aria-label="Main navigation">
      {/* Header with logo and collapse toggle */}
      <div className={mergeClasses(styles.header, isCollapsed && styles.headerCollapsed)}>
        {!isCollapsed && (
          <div className={styles.logoContainer}>
            {portalConfig.logoUrl && (
              <img
                src={portalConfig.logoUrl}
                alt={portalConfig.portalName}
                className={styles.logoImage}
              />
            )}
            <Text className={styles.logoText} weight="semibold">
              {portalConfig.portalName}
            </Text>
          </div>
        )}
        <button
          className={styles.collapseButton}
          onClick={onCollapse}
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!isCollapsed}
        >
          <PanelLeftRegular />
        </button>
      </div>

      {/* Nav items */}
      <ul className={styles.navList} role="list">
        {items
          .filter((item) => item.isVisible)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((item) => (
            <NavItemRow
              key={item.id}
              item={item}
              activePageCode={activePageCode}
              isCollapsed={isCollapsed}
            />
          ))}
      </ul>

      {/* Footer logos */}
      {!isCollapsed &&
        (portalConfig.footerLeftLogoUrl ||
          portalConfig.footerRightLogoUrl ||
          portalConfig.footerPoweredByText) && (
          <div className={styles.footer}>
            {(portalConfig.footerLeftLogoUrl || portalConfig.footerRightLogoUrl) && (
              <div className={styles.footerLogos}>
                {portalConfig.footerLeftLogoUrl && (
                  <img
                    src={portalConfig.footerLeftLogoUrl}
                    alt=""
                    className={styles.footerLogo}
                    aria-hidden="true"
                  />
                )}
                {portalConfig.footerRightLogoUrl && (
                  <img
                    src={portalConfig.footerRightLogoUrl}
                    alt=""
                    className={styles.footerLogo}
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
            {portalConfig.footerPoweredByText && (
              <Text size={100} className={styles.footerPoweredBy}>
                {portalConfig.footerPoweredByText}
              </Text>
            )}
          </div>
        )}
    </nav>
  );
}
