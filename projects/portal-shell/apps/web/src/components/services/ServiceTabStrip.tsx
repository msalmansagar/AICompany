'use client';

import React, { useState } from 'react';
import {
  TabList,
  Tab,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import DOMPurify from 'dompurify';

interface ServiceTab {
  id: string;
  label: string;
  labelAr: string;
  content: string;
  contentAr: string;
}

interface ServiceTabStripProps {
  tabs: ServiceTab[];
  locale: string;
}

const useStyles = makeStyles({
  container: {
    marginTop: tokens.spacingVerticalXL,
  },
  tabContent: {
    paddingTop: tokens.spacingVerticalL,
    lineHeight: '1.6',
    color: tokens.colorNeutralForeground1,
    '& h2': {
      fontSize: tokens.fontSizeBase500,
      fontWeight: tokens.fontWeightSemibold,
      marginBottom: tokens.spacingVerticalM,
    },
    '& h3': {
      fontSize: tokens.fontSizeBase400,
      fontWeight: tokens.fontWeightSemibold,
      marginBottom: tokens.spacingVerticalS,
    },
    '& p': {
      marginBottom: tokens.spacingVerticalM,
    },
    '& ul, & ol': {
      paddingInlineStart: tokens.spacingHorizontalXL,
      marginBottom: tokens.spacingVerticalM,
    },
  },
});

/**
 * Sanitizes HTML content before rendering via dangerouslySetInnerHTML.
 * Uses DOMPurify to strip XSS vectors.
 */
function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    // Server-side: DOMPurify requires a DOM — return empty string as fallback
    // The real content renders on client hydration
    return '';
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h2', 'h3', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'rel', 'target'],
  });
}

export function ServiceTabStrip({ tabs, locale }: ServiceTabStripProps) {
  const styles = useStyles();
  const [selectedTabId, setSelectedTabId] = useState(tabs[0]?.id ?? '');

  const selectedTab = tabs.find((t) => t.id === selectedTabId);
  const rawContent = locale === 'ar' ? (selectedTab?.contentAr ?? '') : (selectedTab?.content ?? '');
  const safeContent = sanitizeHtml(rawContent);

  if (tabs.length === 0) return null;

  return (
    <div className={styles.container}>
      <TabList
        selectedValue={selectedTabId}
        onTabSelect={(_, data) => setSelectedTabId(data.value as string)}
        appearance="underline"
        aria-label="Service details tabs"
      >
        {tabs.map((tab) => (
          <Tab key={tab.id} value={tab.id}>
            {locale === 'ar' ? tab.labelAr : tab.label}
          </Tab>
        ))}
      </TabList>

      <div
        className={styles.tabContent}
        // eslint-disable-next-line react/no-danger -- content is sanitized by DOMPurify before render
        dangerouslySetInnerHTML={{ __html: safeContent }}
        aria-live="polite"
      />
    </div>
  );
}
