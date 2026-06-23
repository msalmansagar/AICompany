'use client';

import React from 'react';
import { Text, Link, makeStyles, tokens } from '@fluentui/react-components';
import type { PortalConfig } from '@portal/types';

interface AppFooterProps {
  portalConfig: Pick<
    PortalConfig,
    | 'footerLeftLogoUrl'
    | 'footerRightLogoUrl'
    | 'footerPoweredByText'
    | 'footerLinks'
    | 'portalName'
  >;
}

const useStyles = makeStyles({
  footer: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    paddingInline: tokens.spacingHorizontalXXL,
    paddingBlock: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    flexShrink: 0,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  logosContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
  },
  logo: {
    height: '32px',
    objectFit: 'contain',
  },
  linksRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
  },
  poweredBy: {
    color: tokens.colorNeutralForeground3,
  },
  footerLink: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    textDecoration: 'none',
    ':hover': {
      textDecoration: 'underline',
    },
  },
});

export function AppFooter({ portalConfig }: AppFooterProps) {
  const styles = useStyles();

  const hasLogos = portalConfig.footerLeftLogoUrl || portalConfig.footerRightLogoUrl;
  const hasLinks = portalConfig.footerLinks.length > 0;

  return (
    <footer className={styles.footer} role="contentinfo">
      <div className={styles.topRow}>
        {hasLogos && (
          <div className={styles.logosContainer}>
            {portalConfig.footerLeftLogoUrl && (
              <img
                src={portalConfig.footerLeftLogoUrl}
                alt={`${portalConfig.portalName} logo`}
                className={styles.logo}
              />
            )}
            {portalConfig.footerRightLogoUrl && (
              <img
                src={portalConfig.footerRightLogoUrl}
                alt=""
                className={styles.logo}
                aria-hidden="true"
              />
            )}
          </div>
        )}

        {portalConfig.footerPoweredByText && (
          <Text size={200} className={styles.poweredBy}>
            {portalConfig.footerPoweredByText}
          </Text>
        )}
      </div>

      {hasLinks && (
        <nav className={styles.linksRow} aria-label="Footer links">
          {portalConfig.footerLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              className={styles.footerLink}
              rel="noopener noreferrer"
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </footer>
  );
}
