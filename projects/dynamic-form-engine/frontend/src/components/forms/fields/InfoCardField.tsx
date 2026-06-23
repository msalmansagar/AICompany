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

// ── Component ──────────────────────────────────────────────────

export function InfoCardField({ field }: Props) {
  const styles = useStyles();

  const variant: InfoCardStyle = field.infoCardStyle ?? 'info';
  const cardClass = `${styles.card} ${styles[CARD_STYLE_CLASSES[variant]]}`;
  const iconClass = styles[ICON_STYLE_CLASSES[variant]];

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
        {field.infoCardBody && (
          <Text className={styles.body}>{field.infoCardBody}</Text>
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
