import { useCallback } from 'react';
import {
  Button,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  CheckmarkRegular,
  SaveRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { useFormContext } from '../../contexts/FormContext';
import { useDesignContext } from '../../contexts/DesignContext';
import type { ButtonDesign, ButtonSizeType } from '@dfe/shared';

const useStyles = makeStyles({
  bar: {
    position: 'sticky',
    bottom: 0,
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow8,
    zIndex: 100,
  },
  barLeft: {
    justifyContent: 'flex-start',
  },
  barCenter: {
    justifyContent: 'center',
  },
});

const BUTTON_SIZE_MAP: Record<ButtonSizeType, 'small' | 'medium' | 'large'> = {
  Small: 'small',
  Medium: 'medium',
  Large: 'large',
};

function resolveButtonSize(
  design: ButtonDesign | undefined,
): 'small' | 'medium' | 'large' {
  return BUTTON_SIZE_MAP[design?.size ?? 'Medium'];
}

export function StickyActionBar() {
  const styles = useStyles();
  const { formDefinition, isSubmitting, isDirty, isSubmitted, saveDraft, submitForm } =
    useFormContext();
  const design = useDesignContext();

  const submitDesign = design.buttonDesigns.Submit;
  const saveDraftDesign = design.buttonDesigns.SaveDraft;
  const cancelDesign = design.buttonDesigns.Cancel;

  const barAlignment = submitDesign?.alignment ?? 'Right';
  const alignClass =
    barAlignment === 'Left'
      ? styles.barLeft
      : barAlignment === 'Center'
        ? styles.barCenter
        : '';

  const handleSaveDraft = useCallback(async () => {
    await saveDraft();
  }, [saveDraft]);

  const handleSubmit = useCallback(async () => {
    await submitForm();
  }, [submitForm]);

  if (isSubmitted) return null;

  return (
    <div
      className={`${styles.bar} ${alignClass}`}
      role="toolbar"
      aria-label="Form actions"
    >
      {cancelDesign && (
        <Button
          appearance="subtle"
          size={resolveButtonSize(cancelDesign)}
          icon={<DismissRegular />}
          disabled={isSubmitting}
          aria-label="Cancel"
        >
          Cancel
        </Button>
      )}

      {formDefinition?.allowSaveDraft && (
        <Button
          appearance="outline"
          size={resolveButtonSize(saveDraftDesign)}
          icon={<SaveRegular />}
          onClick={() => { void handleSaveDraft(); }}
          disabled={!isDirty || isSubmitting}
          aria-label="Save draft"
        >
          Save draft
        </Button>
      )}

      <Button
        appearance="primary"
        size={resolveButtonSize(submitDesign)}
        icon={isSubmitting ? <Spinner size="tiny" /> : <CheckmarkRegular />}
        onClick={() => { void handleSubmit(); }}
        disabled={isSubmitting}
        aria-label="Submit form"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? 'Submitting…' : 'Submit'}
      </Button>
    </div>
  );
}
