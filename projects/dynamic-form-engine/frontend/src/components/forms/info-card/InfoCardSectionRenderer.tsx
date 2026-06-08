import { makeStyles, tokens, Text } from '@fluentui/react-components';
import type { InfoCardSection } from '@qdb/shared';
import { NumberedStepsSection } from './sections/NumberedStepsSection';
import { IconListSection } from './sections/IconListSection';
import { DownloadListSection } from './sections/DownloadListSection';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  noteCallout: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderLeft: `4px solid ${tokens.colorBrandBackground}`,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusSmall,
  },
  noteText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
});

interface InfoCardSectionRendererProps {
  section: InfoCardSection;
}

export function InfoCardSectionRenderer({
  section,
}: InfoCardSectionRendererProps) {
  const styles = useStyles();

  function renderSectionBody() {
    switch (section.sectionType) {
      case 'numbered-steps':
        return <NumberedStepsSection section={section} />;
      case 'icon-list':
        return <IconListSection section={section} />;
      case 'download-list':
        return <DownloadListSection section={section} />;
      default:
        return null;
    }
  }

  return (
    <div className={styles.root}>
      {section.sectionTitle && (
        <Text as="h3" className={styles.sectionTitle}>
          {section.sectionTitle}
        </Text>
      )}

      {renderSectionBody()}

      {section.noteText && (
        <div
          className={styles.noteCallout}
          role="note"
          aria-label="Note"
        >
          <Text className={styles.noteText}>{section.noteText}</Text>
        </div>
      )}
    </div>
  );
}
