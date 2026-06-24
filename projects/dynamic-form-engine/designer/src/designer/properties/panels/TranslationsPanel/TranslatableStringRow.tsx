import React, { useState } from 'react';
import {
  Button,
  Textarea,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { CheckmarkCircleRegular } from '@fluentui/react-icons';

export interface LanguageConfig {
  code: string;
  displayName: string;
  isDefault: boolean;
  isRtl: boolean;
}

export interface TranslationEntry {
  value: string;
  translationId?: string;
}

interface TranslatableStringRowProps {
  fieldName: string;
  fieldLabel: string;
  languages: LanguageConfig[];
  translations: Map<string, TranslationEntry>;
  onSave: (languageCode: string, value: string, existingTranslationId?: string) => Promise<void>;
  onDelete: (translationId: string) => Promise<void>;
  isSaving: boolean;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingBottom: '12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  fieldLabel: {
    color: tokens.colorNeutralForeground2,
    fontWeight: '600',
  },
  langRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  langLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: '11px',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
  },
  textareaWrapper: {
    flex: 1,
  },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  savedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    color: tokens.colorStatusSuccessForeground1,
    fontSize: '11px',
  },
  baseValueRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  baseValue: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
    fontSize: '12px',
    padding: '4px 6px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
  },
});

export function TranslatableStringRow({
  fieldLabel,
  languages,
  translations,
  onSave,
  onDelete,
  isSaving,
}: TranslatableStringRowProps): React.ReactElement {
  const styles = useStyles();
  const nonDefaultLanguages = languages.filter((l) => !l.isDefault);

  return (
    <div className={styles.root}>
      <Text size={200} className={styles.fieldLabel}>{fieldLabel}</Text>
      <div className={styles.baseValueRow}>
        <Text size={100} className={styles.langLabel}>English (base)</Text>
        <Text size={200} className={styles.baseValue}>(stored in CRM — visible in form preview)</Text>
      </div>
      {nonDefaultLanguages.map((lang) => (
        <LanguageInputRow
          key={lang.code}
          language={lang}
          entry={translations.get(lang.code)}
          onSave={onSave}
          onDelete={onDelete}
          isSaving={isSaving}
        />
      ))}
    </div>
  );
}

interface LanguageInputRowProps {
  language: LanguageConfig;
  entry: TranslationEntry | undefined;
  onSave: (languageCode: string, value: string, existingTranslationId?: string) => Promise<void>;
  onDelete: (translationId: string) => Promise<void>;
  isSaving: boolean;
}

function LanguageInputRow({
  language,
  entry,
  onSave,
  onDelete,
  isSaving,
}: LanguageInputRowProps): React.ReactElement {
  const styles = useStyles();
  const [draftValue, setDraftValue] = useState(entry?.value ?? '');
  const [justSaved, setJustSaved] = useState(false);

  const handleBlur = async (): Promise<void> => {
    if (draftValue === (entry?.value ?? '')) return;
    await onSave(language.code, draftValue, entry?.translationId);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleDelete = async (): Promise<void> => {
    if (!entry?.translationId) return;
    await onDelete(entry.translationId);
    setDraftValue('');
  };

  const rtlInputStyle = language.isRtl
    ? { fontFamily: "'Cairo Variable', 'Noto Sans Arabic', sans-serif" }
    : undefined;

  return (
    <div className={styles.langRow}>
      <Text size={100} className={styles.langLabel}>{language.displayName}</Text>
      <div className={styles.inputRow}>
        <div className={styles.textareaWrapper}>
          <Textarea
            value={draftValue}
            onChange={(_, data) => setDraftValue(data.value)}
            onBlur={() => void handleBlur()}
            placeholder={`Enter ${language.displayName} translation`}
            disabled={isSaving}
            dir={language.isRtl ? 'rtl' : 'ltr'}
            style={rtlInputStyle}
            resize="vertical"
          />
        </div>
      </div>
      <div className={styles.actionRow}>
        {entry?.translationId && (
          <Button
            size="small"
            appearance="subtle"
            onClick={() => void handleDelete()}
            disabled={isSaving}
          >
            Clear
          </Button>
        )}
        {justSaved && (
          <span className={styles.savedBadge}>
            <CheckmarkCircleRegular fontSize={14} />
            <Text size={100}>Saved</Text>
          </span>
        )}
      </div>
    </div>
  );
}
