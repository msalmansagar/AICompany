'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  TabList,
  Tab,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  makeStyles,
  tokens,
  mergeClasses,
} from '@fluentui/react-components';
import { MoreHorizontalRegular } from '@fluentui/react-icons';
import type { NavItem } from '@portal/types';

interface TopNavProps {
  items: NavItem[];
  activePageCode: string;
  onNavigate: (pageCode: string) => void;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingInline: tokens.spacingHorizontalL,
    overflowX: 'hidden',
  },
  tabList: {
    flex: 1,
    overflowX: 'hidden',
  },
  moreButton: {
    flexShrink: 0,
    marginInlineStart: tokens.spacingHorizontalS,
  },
});

export function TopNav({ items, activePageCode, onNavigate }: TopNavProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const availableWidth = container.offsetWidth - 60; // reserve space for "More" button
      const avgTabWidth = 120;
      const maxVisible = Math.max(1, Math.floor(availableWidth / avgTabWidth));
      setVisibleCount(Math.min(maxVisible, items.length));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [items.length]);

  const visibleItems = items.filter((i) => i.isVisible).slice(0, visibleCount);
  const overflowItems = items.filter((i) => i.isVisible).slice(visibleCount);

  return (
    <div className={styles.container} ref={containerRef}>
      <TabList
        className={styles.tabList}
        selectedValue={activePageCode}
        onTabSelect={(_, data) => onNavigate(data.value as string)}
        appearance="subtle"
        aria-label="Main navigation"
      >
        {visibleItems.map((item) => (
          <Tab key={item.id} value={item.pageCode} aria-label={item.label}>
            {item.label}
          </Tab>
        ))}
      </TabList>

      {overflowItems.length > 0 && (
        <Menu>
          <MenuButton
            className={styles.moreButton}
            appearance="subtle"
            icon={<MoreHorizontalRegular />}
            aria-label={`More navigation items (${overflowItems.length})`}
          >
            More
          </MenuButton>
          <MenuList>
            {overflowItems.map((item) => (
              <MenuItem
                key={item.id}
                onClick={() => onNavigate(item.pageCode)}
                aria-current={item.pageCode === activePageCode ? 'page' : undefined}
              >
                {item.label}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
      )}
    </div>
  );
}
