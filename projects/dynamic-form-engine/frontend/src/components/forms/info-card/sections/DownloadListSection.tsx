import { makeStyles, tokens, Text, Button } from '@fluentui/react-components';
import { ArrowDownloadRegular } from '@fluentui/react-icons';
import type { InfoCardSection } from '@qdb/shared';

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalS,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  itemContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  itemDescription: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  downloadButton: {
    flexShrink: 0,
  },
});

interface DownloadListSectionProps {
  section: InfoCardSection;
}

export function DownloadListSection({ section }: DownloadListSectionProps) {
  const styles = useStyles();
  const sortedItems = [...section.items].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  return (
    <ul
      className={styles.list}
      aria-label={section.sectionTitle ?? 'Downloads'}
    >
      {sortedItems.map((item) => (
        <li key={item.itemId} className={styles.item}>
          <div className={styles.itemContent}>
            <Text className={styles.itemTitle}>{item.itemTitle}</Text>
            {item.itemDescription && (
              <Text className={styles.itemDescription}>
                {item.itemDescription}
              </Text>
            )}
          </div>

          {item.downloadUrl && (
            <Button
              as="a"
              href={item.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              appearance="secondary"
              icon={<ArrowDownloadRegular />}
              className={styles.downloadButton}
              aria-label={`Download ${item.itemTitle}`}
            >
              Download
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
