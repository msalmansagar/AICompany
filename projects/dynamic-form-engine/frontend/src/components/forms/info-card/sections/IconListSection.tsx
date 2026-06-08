import { makeStyles, tokens, Text } from '@fluentui/react-components';
import type { InfoCardSection } from '@qdb/shared';
import { DynamicIcon } from '../../DynamicIcon';

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
  iconWrapper: {
    minWidth: '24px',
    paddingTop: '2px',
    color: tokens.colorBrandForeground1,
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

interface IconListSectionProps {
  section: InfoCardSection;
}

export function IconListSection({ section }: IconListSectionProps) {
  const styles = useStyles();
  const sortedItems = [...section.items].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  return (
    <ul className={styles.list} aria-label={section.sectionTitle ?? 'Items'}>
      {sortedItems.map((item) => (
        <li key={item.itemId} className={styles.item}>
          <span className={styles.iconWrapper} aria-hidden="true">
            {item.iconReference ? (
              <DynamicIcon iconName={item.iconReference} size={20} />
            ) : (
              // Default bullet when no icon reference is set
              <span aria-hidden="true">&bull;</span>
            )}
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
    </ul>
  );
}
