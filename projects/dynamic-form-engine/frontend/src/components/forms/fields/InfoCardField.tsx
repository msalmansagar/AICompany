// Display-only info card rendered inline within a form section.
// Registers no react-hook-form controller — has no user input.

import {
  makeStyles,
  tokens,
  Text,
  Link,
} from '@fluentui/react-components';
import {
  InfoRegular,
  WarningRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  ArrowDownloadRegular,
} from '@fluentui/react-icons';
import type { FieldDefinition } from '@qdb/shared';
import { DynamicIcon } from '../DynamicIcon';
import { parseInfoCardContent } from './infoCardContent';

// ── Types ──────────────────────────────────────────────────────

type InfoCardStyle = NonNullable<FieldDefinition['infoCardStyle']>;

interface Props {
  field: FieldDefinition;
}

// ── Styles ─────────────────────────────────────────────────────

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    width: '100%',
    boxSizing: 'border-box',
  },
  cardInfo: {
    backgroundColor: tokens.colorBrandBackground2,
    borderLeftColor: tokens.colorBrandForeground1,
  },
  cardWarning: {
    backgroundColor: tokens.colorPaletteGoldBackground2,
    borderLeftColor: tokens.colorPaletteGoldForeground2,
  },
  cardSuccess: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
    borderLeftColor: tokens.colorPaletteGreenForeground1,
  },
  cardError: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    borderLeftColor: tokens.colorPaletteRedForeground1,
  },
  iconInfo: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
    paddingTop: '2px',
  },
  iconWarning: {
    color: tokens.colorPaletteGoldForeground2,
    flexShrink: 0,
    paddingTop: '2px',
  },
  iconSuccess: {
    color: tokens.colorPaletteGreenForeground1,
    flexShrink: 0,
    paddingTop: '2px',
  },
  iconError: {
    color: tokens.colorPaletteRedForeground1,
    flexShrink: 0,
    paddingTop: '2px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  body: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase300,
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  itemRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  // DFE-INFOLIST-001: configurable body list.
  listWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    margin: 0,
    paddingLeft: 0,
    listStyleType: 'none',
  },
  listItem: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  marker: {
    flexShrink: 0,
    minWidth: '20px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  markerCircle: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    paddingLeft: '4px',
    paddingRight: '4px',
    borderRadius: '9999px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground2,
    lineHeight: '1',
  },
  downloadLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase200,
    marginTop: tokens.spacingVerticalXS,
  },
});

// ── Style helpers ──────────────────────────────────────────────

const CARD_STYLE_CLASSES: Record<InfoCardStyle, keyof ReturnType<typeof useStyles>> = {
  info: 'cardInfo',
  warning: 'cardWarning',
  success: 'cardSuccess',
  error: 'cardError',
};

const ICON_STYLE_CLASSES: Record<InfoCardStyle, keyof ReturnType<typeof useStyles>> = {
  info: 'iconInfo',
  warning: 'iconWarning',
  success: 'iconSuccess',
  error: 'iconError',
};

function DefaultIcon({ variant }: { variant: InfoCardStyle }) {
  switch (variant) {
    case 'warning':
      return <WarningRegular fontSize={20} />;
    case 'success':
      return <CheckmarkCircleRegular fontSize={20} />;
    case 'error':
      return <DismissCircleRegular fontSize={20} />;
    default:
      return <InfoRegular fontSize={20} />;
  }
}

const STYLE_VARIANTS: readonly InfoCardStyle[] = ['info', 'warning', 'success', 'error'];

function isStyleVariant(icon: string): icon is InfoCardStyle {
  return (STYLE_VARIANTS as readonly string[]).includes(icon);
}

// A JSON item's `icon` is either one of the card style words (info/warning/
// success/error → the matching default glyph) or a Fluent icon name.
function InfoCardItemIcon({ icon }: { icon: string }) {
  if (isStyleVariant(icon)) {
    return <DefaultIcon variant={icon} />;
  }
  return <DynamicIcon iconName={icon} size={20} />;
}

// ── DFE-INFOLIST-001: configurable body list ──────────────────

// Roman numerals without an external package (CEO condition C-GO-005).
function toRoman(n: number): string {
  const table: Array<[number, string]> = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let remaining = n;
  for (const [value, symbol] of table) {
    while (remaining >= value) { out += symbol; remaining -= value; }
  }
  return out || String(n);
}

function splitListItems(body: string | undefined): string[] {
  if (!body) return [];
  return body.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

function markerText(
  listType: NonNullable<FieldDefinition['infoCardListType']>,
  index: number,
): string {
  if (listType === 'bullet') return '•';
  if (listType === 'numbered-roman') return toRoman(index + 1);
  return `${index + 1}`;
}

function InfoCardBodyList({
  listType,
  marker,
  items,
  styles,
}: {
  listType: NonNullable<FieldDefinition['infoCardListType']>;
  marker: NonNullable<FieldDefinition['infoCardListMarker']>;
  items: string[];
  styles: ReturnType<typeof useStyles>;
}) {
  const ListTag = listType === 'bullet' ? 'ul' : 'ol';
  return (
    <ListTag className={styles.listWrap}>
      {items.map((item, index) => (
        <li key={index} className={styles.listItem}>
          {marker !== 'none' && (
            <span
              className={marker === 'circle' ? styles.markerCircle : styles.marker}
              aria-hidden="true"
            >
              {markerText(listType, index)}
            </span>
          )}
          <Text className={styles.body}>{item}</Text>
        </li>
      ))}
    </ListTag>
  );
}

// ── Component ──────────────────────────────────────────────────

export function InfoCardField({ field }: Props) {
  const styles = useStyles();

  const variant: InfoCardStyle = field.infoCardStyle ?? 'info';
  const cardClass = `${styles.card} ${styles[CARD_STYLE_CLASSES[variant]]}`;
  const iconClass = styles[ICON_STYLE_CLASSES[variant]];

  const content = parseInfoCardContent(field.infoCardBody);
  // DFE-INFOLIST-001: when a list type is configured, the body renders as a list.
  const listItems = field.infoCardListType ? splitListItems(field.infoCardBody) : [];

  return (
    <div
      className={cardClass}
      role="note"
      aria-label={field.infoCardTitle}
    >
      <span className={iconClass} aria-hidden="true">
        {field.infoCardIcon ? (
          <DynamicIcon iconName={field.infoCardIcon} size={20} />
        ) : (
          <DefaultIcon variant={variant} />
        )}
      </span>

      <div className={styles.content}>
        {field.infoCardTitle && (
          <Text className={styles.title}>{field.infoCardTitle}</Text>
        )}
        {field.infoCardListType && listItems.length > 0 ? (
          <InfoCardBodyList
            listType={field.infoCardListType}
            marker={field.infoCardListMarker ?? 'plain'}
            items={listItems}
            styles={styles}
          />
        ) : content.mode === 'text' ? (
          content.text && (
            <Text className={styles.body}>{content.text}</Text>
          )
        ) : (
          content.items.length > 0 && (
              <div className={styles.itemList}>
                {content.items.map((item, index) => (
                  <div key={index} className={styles.itemRow}>
                    <span className={iconClass} aria-hidden="true">
                      <InfoCardItemIcon icon={item.icon} />
                    </span>
                    <Text className={styles.body}>{item.label}</Text>
                  </div>
                ))}
              </div>
            )
        )}
        {field.infoCardDownloadUrl && (
          <Link
            href={field.infoCardDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className={styles.downloadLink}
          >
            {field.infoCardDownloadIcon ? (
              <DynamicIcon iconName={field.infoCardDownloadIcon} size={16} />
            ) : (
              <>
                <ArrowDownloadRegular fontSize={14} />
                {field.infoCardDownloadLabel || 'Download'}
              </>
            )}
          </Link>
        )}
      </div>
    </div>
  );
}
