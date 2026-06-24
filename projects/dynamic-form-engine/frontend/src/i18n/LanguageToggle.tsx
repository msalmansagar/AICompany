/**
 * LanguageToggle — EN / AR language switcher rendered at the top-right
 * of the form header (OQ-001 decision: DFE owns the toggle).
 *
 * Populated dynamically from GET /api/languages so that adding a new
 * language in Dataverse automatically adds a button here without any
 * frontend code change (FR-025 / AC-022 / NFR-009).
 *
 * On selection: calls onSelect() which flows back to setLanguage() in
 * useLanguageContext. Field values in React form state are preserved
 * (AC-007 / AC-012) because language switch only triggers a metadata
 * re-fetch — it does not reset FormContext field values.
 *
 * NOTE: This component intentionally does NOT use useTranslation.
 * The toggle text is the language displayName from the API config, so
 * no static chrome translation key is needed for the button labels.
 * The aria-label for the nav container is the static English string
 * "Language" which is acceptable for the accessible name of a nav
 * landmark (screen readers announce it in the language they are set to).
 */
import { makeStyles, Button, tokens } from '@fluentui/react-components';
import type { LanguageConfig } from '@qdb/shared';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
  activeButton: {
    fontWeight: tokens.fontWeightSemibold,
  },
  separator: {
    color: tokens.colorNeutralForeground3,
    userSelect: 'none',
  },
});

interface LanguageToggleProps {
  /** Languages from GET /api/languages, in displayOrder. */
  languages: LanguageConfig[];
  /** Currently active language code. */
  activeLanguage: string;
  /** Called when the user selects a language. */
  onSelect: (code: string) => void;
}

export function LanguageToggle({
  languages,
  activeLanguage,
  onSelect,
}: LanguageToggleProps) {
  const styles = useStyles();

  if (languages.length === 0) return null;

  return (
    <nav aria-label="Language" className={styles.container}>
      {languages.map((lang, index) => {
        const isActive = lang.code === activeLanguage;
        const isLast = index === languages.length - 1;

        return (
          <span
            key={lang.code}
            style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS }}
          >
            <Button
              appearance={isActive ? 'primary' : 'subtle'}
              size="small"
              onClick={() => onSelect(lang.code)}
              aria-pressed={isActive}
              aria-label={lang.displayName}
              className={isActive ? styles.activeButton : undefined}
            >
              {lang.displayName}
            </Button>
            {!isLast && (
              <span aria-hidden="true" className={styles.separator}>
                |
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
