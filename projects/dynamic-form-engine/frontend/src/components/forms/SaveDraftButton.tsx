import { useState } from 'react';
import {
  Button,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SaveRegular, CheckmarkRegular } from '@fluentui/react-icons';
import { useFormContext } from '../../contexts/FormContext';
import { useDesignContext } from '../../contexts/DesignContext';
import type { ButtonStyleType } from '@qdb/shared';

// Save draft is always a secondary action â€” appearance steps down one level from submit.
const SAVE_DRAFT_APPEARANCE_MAP: Record<ButtonStyleType, 'outline' | 'subtle' | 'transparent'> = {
  Primary: 'outline',
  Outline: 'subtle',
  Text: 'transparent',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const useStyles = makeStyles({
  button: {
    minWidth: '120px',
  },
  savedColor: {
    color: tokens.colorPaletteGreenForeground1,
  },
});

export function SaveDraftButton() {
  const styles = useStyles();
  const { saveDraft, isSubmitting, isSubmitted } = useFormContext();
  const design = useDesignContext();
  const buttonAppearance = SAVE_DRAFT_APPEARANCE_MAP[design.formDesign.buttonStyle ?? 'Primary'];
  const [saveState, setSaveState] = useState<SaveState>('idle');

  async function handleSave() {
    setSaveState('saving');

    try {
      await saveDraft();
      setSaveState('saved');

      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('error');

      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  const isDisabled =
    saveState === 'saving' || isSubmitting || isSubmitted;

  const buttonIcon = saveState === 'saving'
    ? <Spinner size="tiny" />
    : saveState === 'saved'
      ? <CheckmarkRegular className={styles.savedColor} />
      : <SaveRegular />;

  const buttonLabel =
    saveState === 'saving' ? 'Saving...' :
    saveState === 'saved' ? 'Saved' :
    saveState === 'error' ? 'Save failed' :
    'Save draft';

  return (
    <Button
      className={styles.button}
      appearance={buttonAppearance}
      icon={buttonIcon}
      onClick={handleSave}
      disabled={isDisabled}
      aria-label={buttonLabel}
      aria-busy={saveState === 'saving'}
    >
      {buttonLabel}
    </Button>
  );
}
