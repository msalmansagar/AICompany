import { makeStyles, tokens, Text } from '@fluentui/react-components';
import type { InfoCardSection } from '@qdb/shared';

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
  },
  stepNumber: {
    minWidth: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    flexShrink: 0,
  },
  itemContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: 1,
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
});

interface NumberedStepsSectionProps {
  section: InfoCardSection;
}

export function NumberedStepsSection({ section }: NumberedStepsSectionProps) {
  const styles = useStyles();
  const sortedItems = [...section.items].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  return (
    <ol className={styles.list} aria-label={section.sectionTitle ?? 'Steps'}>
      {sortedItems.map((item, index) => (
        <li key={item.itemId} className={styles.item}>
          <span
            className={styles.stepNumber}
            aria-label={`Step ${index + 1}`}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <div className={styles.itemContent}>
            <Text className={styles.itemTitle}>{item.itemTitle}</Text>
            {item.itemDescription && (
              <Text className={styles.itemDescription}>
                {item.itemDescription}
              </Text>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
