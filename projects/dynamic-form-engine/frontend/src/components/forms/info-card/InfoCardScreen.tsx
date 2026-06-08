import { useEffect, useRef } from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import type { InfoCardScreen as InfoCardScreenType } from '@qdb/shared';
import { InfoCardSectionRenderer } from './InfoCardSectionRenderer';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    flex: '1 1 auto',
    overflowY: 'auto',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
    '@media (max-width: 480px)': {
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
  },
  headerSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    textAlign: 'center',
  },
  iconImage: {
    maxWidth: '80px',
    maxHeight: '80px',
    objectFit: 'contain',
  },
  heading: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    margin: 0,
    // Allow focus outline for accessibility (FR-072)
    outline: 'none',
  },
  subHeading: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    maxWidth: '600px',
  },
  sectionsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
  },
});

interface InfoCardScreenProps {
  screen: InfoCardScreenType;
  formTitle: string;
}

export function InfoCardScreen({ screen, formTitle }: InfoCardScreenProps) {
  const styles = useStyles();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // FR-071: Update document title on each screen for accessibility.
  useEffect(() => {
    document.title = `${screen.heading} — ${formTitle}`;
  }, [screen.heading, formTitle]);

  // FR-072: Set focus to H1 on screen mount so screen readers announce the new screen.
  useEffect(() => {
    headingRef.current?.focus();
  }, [screen.screenId]);

  const sortedSections = [...screen.sections].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  return (
    <div className={styles.root}>
      <div className={styles.headerSection}>
        {screen.iconUrl && (
          <img
            src={screen.iconUrl}
            alt={screen.iconAltText ?? ''}
            className={styles.iconImage}
            aria-hidden={!screen.iconAltText}
          />
        )}

        <h1
          ref={headingRef}
          className={styles.heading}
          tabIndex={-1}
        >
          {screen.heading}
        </h1>

        {screen.subHeading && (
          <Text className={styles.subHeading}>{screen.subHeading}</Text>
        )}
      </div>

      <div className={styles.sectionsContainer}>
        {sortedSections.map((section) => (
          <InfoCardSectionRenderer key={section.sectionId} section={section} />
        ))}
      </div>
    </div>
  );
}
