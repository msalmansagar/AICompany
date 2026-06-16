'use client';

import React, { useEffect, useState } from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';
import { makeStyles, tokens } from '@fluentui/react-components';

export interface RichTextDisplayProps {
  html: string;
  dir?: 'ltr' | 'rtl';
  className?: string;
}

const useStyles = makeStyles({
  prose: {
    lineHeight: tokens.lineHeightBase400,
    color: tokens.colorNeutralForeground1,
    '& h1': { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold, marginBlockEnd: tokens.spacingVerticalM },
    '& h2': { fontSize: tokens.fontSizeHero800, fontWeight: tokens.fontWeightSemibold, marginBlockEnd: tokens.spacingVerticalM },
    '& h3': { fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightSemibold, marginBlockEnd: tokens.spacingVerticalS },
    '& p': { marginBlockEnd: tokens.spacingVerticalM },
    '& ul': { paddingInlineStart: tokens.spacingHorizontalXL, marginBlockEnd: tokens.spacingVerticalM },
    '& ol': { paddingInlineStart: tokens.spacingHorizontalXL, marginBlockEnd: tokens.spacingVerticalM },
    '& li': { marginBlockEnd: tokens.spacingVerticalXS },
    '& a': { color: tokens.colorBrandForeground1, textDecoration: 'underline' },
    '& blockquote': {
      borderInlineStart: `4px solid ${tokens.colorNeutralStroke1}`,
      paddingInlineStart: tokens.spacingHorizontalM,
      marginInlineStart: 0,
      color: tokens.colorNeutralForeground2,
    },
    '& code': {
      backgroundColor: tokens.colorNeutralBackground3,
      paddingInline: tokens.spacingHorizontalXS,
      borderRadius: tokens.borderRadiusSmall,
      fontFamily: tokens.fontFamilyMonospace,
      fontSize: tokens.fontSizeBase200,
    },
    '& pre': {
      backgroundColor: tokens.colorNeutralBackground3,
      padding: tokens.spacingVerticalM,
      borderRadius: tokens.borderRadiusMedium,
      overflowX: 'auto',
      marginBlockEnd: tokens.spacingVerticalM,
      '& code': { backgroundColor: 'transparent', padding: 0 },
    },
    '& img': { maxWidth: '100%', height: 'auto', borderRadius: tokens.borderRadiusMedium },
    '& strong': { fontWeight: tokens.fontWeightBold },
    '& em': { fontStyle: 'italic' },
    '& u': { textDecoration: 'underline' },
  },
});

/**
 * Sanitises HTML using DOMPurify (browser-only) and renders the result.
 * On first render (server or hydration), shows a skeleton to avoid
 * mismatched server/client HTML with dangerouslySetInnerHTML.
 */
export function RichTextDisplay({ html, dir = 'ltr', className }: RichTextDisplayProps) {
  const styles = useStyles();
  const [sanitisedHtml, setSanitisedHtml] = useState<string | null>(null);

  useEffect(() => {
    // DOMPurify requires a real DOM — dynamic import keeps this client-only
    void import('dompurify').then(({ default: DOMPurify }) => {
      const clean = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'u', 's',
          'h1', 'h2', 'h3', 'h4',
          'ul', 'ol', 'li',
          'blockquote', 'code', 'pre',
          'a', 'img',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'hr', 'span', 'div',
        ],
        ALLOWED_ATTR: [
          'href', 'src', 'alt', 'title', 'target', 'rel',
          'class', 'style', 'dir',
          'width', 'height',
          'colspan', 'rowspan',
        ],
      });
      setSanitisedHtml(clean);
    });
  }, [html]);

  if (sanitisedHtml === null) {
    return (
      <Skeleton>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <SkeletonItem shape="rectangle" style={{ height: 20 }} />
          <SkeletonItem shape="rectangle" style={{ height: 20, width: '90%' }} />
          <SkeletonItem shape="rectangle" style={{ height: 20, width: '80%' }} />
          <SkeletonItem shape="rectangle" style={{ height: 20, width: '95%' }} />
        </div>
      </Skeleton>
    );
  }

  return (
    <div
      className={`${styles.prose}${className ? ` ${className}` : ''}`}
      dir={dir}
      // Content is sanitised above via DOMPurify before being set here
      dangerouslySetInnerHTML={{ __html: sanitisedHtml }}
    />
  );
}
