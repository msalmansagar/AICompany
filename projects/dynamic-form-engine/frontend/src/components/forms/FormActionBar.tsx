import { useCallback, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Spinner,
  Badge,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  SendRegular,
  SaveRegular,
  DismissRegular,
  ArrowResetRegular,
  CheckmarkCircleRegular,
} from '@fluentui/react-icons';
import { useFormContext } from '../../contexts/FormContext';
import { useDesignContext } from '../../contexts/DesignContext';
import type { FormButton, ButtonAction } from '@dfe/shared';

interface FormActionBarProps {
  sticky?: boolean;
}

const DEFAULT_BUTTON: FormButton = {
  id: '__default_submit__',
  formDefinitionId: '',
  label: 'Submit',
  action: 'submit',
  displayOrder: 0,
  isVisible: true,
  isPrimary: true,
  confirmationRequired: false,
  isActive: true,
};

const ACTION_ICON: Record<ButtonAction, React.ReactElement> = {
  submit: <SendRegular />,
  saveDraft: <SaveRegular />,
  cancel: <DismissRegular />,
  reset: <ArrowResetRegular />,
};

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    paddingTop: tokens.spacingVerticalM,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke1,
  },
  barRight: { justifyContent: 'flex-end' },
  barLeft: { justifyContent: 'flex-start' },
  barCenter: { justifyContent: 'center' },
  sticky: {
    position: 'sticky',
    bottom: 0,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
    zIndex: 100,
  },
  submitWrapper: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  },
  errorBadge: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
  },
});

export function FormActionBar({ sticky = false }: FormActionBarProps) {
  const styles = useStyles();
  const {
    formDefinition,
    isSubmitting,
    isDirty,
    isSubmitted,
    validationErrors,
    saveDraft,
    submitForm,
    resetForm,
  } = useFormContext();
  const design = useDesignContext();

  const [saveDraftState, setSaveDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const alignment = design.buttonDesigns.Submit?.alignment ?? 'Right';
  const alignClass =
    alignment === 'Left' ? styles.barLeft :
    alignment === 'Center' ? styles.barCenter :
    styles.barRight;

  const visibleButtons = (formDefinition?.buttons ?? [])
    .filter((b) => b.isVisible && b.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const buttons = visibleButtons.length > 0 ? visibleButtons : [DEFAULT_BUTTON];

  const handleSaveDraft = useCallback(async () => {
    setSaveDraftState('saving');
    try {
      await saveDraft();
      setSaveDraftState('saved');
      setTimeout(() => setSaveDraftState('idle'), 2500);
    } catch {
      setSaveDraftState('error');
      setTimeout(() => setSaveDraftState('idle'), 2500);
    }
  }, [saveDraft]);

  if (isSubmitted) return null;

  return (
    <div
      className={mergeClasses(styles.bar, alignClass, sticky && styles.sticky)}
      role="toolbar"
      aria-label="Form actions"
    >
      {buttons.map((button) => (
        <FormButtonItem
          key={button.id}
          button={button}
          isSubmitting={isSubmitting}
          isDirty={isDirty}
          validationErrors={validationErrors}
          saveDraftState={saveDraftState}
          onSubmit={() => { void submitForm(); }}
          onSaveDraft={() => { void handleSaveDraft(); }}
          onCancel={() => { window.history.back(); }}
          onReset={resetForm}
        />
      ))}
    </div>
  );
}

interface FormButtonItemProps {
  button: FormButton;
  isSubmitting: boolean;
  isDirty: boolean;
  validationErrors: Record<string, string[]>;
  saveDraftState: 'idle' | 'saving' | 'saved' | 'error';
  onSubmit: () => void;
  onSaveDraft: () => void;
  onCancel: () => void;
  onReset: () => void;
}

function FormButtonItem({
  button,
  isSubmitting,
  isDirty,
  validationErrors,
  saveDraftState,
  onSubmit,
  onSaveDraft,
  onCancel,
  onReset,
}: FormButtonItemProps) {
  const styles = useStyles();
  const design = useDesignContext();

  const buttonSizeMap = { Small: 'small', Medium: 'medium', Large: 'large' } as const;
  const designSize = design.buttonDesigns[button.action === 'submit' ? 'Submit' :
    button.action === 'saveDraft' ? 'SaveDraft' : 'Cancel']?.size ?? 'Medium';
  const size = buttonSizeMap[designSize];

  if (button.action === 'submit') {
    const errorCount = Object.values(validationErrors).reduce((n, errs) => n + errs.length, 0);
    const icon = isSubmitting ? <Spinner size="tiny" /> : ACTION_ICON.submit;

    return (
      <div className={styles.submitWrapper}>
        <Button
          appearance={button.isPrimary ? 'primary' : 'outline'}
          size={size}
          icon={icon}
          disabled={isSubmitting}
          onClick={onSubmit}
          aria-busy={isSubmitting}
          aria-label={isSubmitting ? 'Submitting…' : button.label}
        >
          {isSubmitting ? 'Submitting…' : button.label}
        </Button>
        {errorCount > 0 && !isSubmitting && (
          <Badge
            className={styles.errorBadge}
            appearance="filled"
            color="danger"
            size="small"
            aria-label={`${errorCount} validation error${errorCount > 1 ? 's' : ''}`}
          >
            {errorCount}
          </Badge>
        )}
      </div>
    );
  }

  if (button.action === 'saveDraft') {
    const isSaving = saveDraftState === 'saving';
    const isSaved = saveDraftState === 'saved';
    const icon = isSaving ? <Spinner size="tiny" /> : isSaved ? <CheckmarkCircleRegular /> : ACTION_ICON.saveDraft;

    return (
      <Button
        appearance={button.isPrimary ? 'primary' : 'outline'}
        size={size}
        icon={icon}
        disabled={!isDirty || isSubmitting || isSaving}
        onClick={onSaveDraft}
        aria-label={button.label}
      >
        {isSaving ? 'Saving…' : isSaved ? 'Saved' : button.label}
      </Button>
    );
  }

  if (button.action === 'cancel' || button.action === 'reset') {
    const handler = button.action === 'cancel' ? onCancel : onReset;

    if (button.confirmationRequired) {
      return (
        <ConfirmationButton
          button={button}
          size={size}
          isSubmitting={isSubmitting}
          onConfirm={handler}
        />
      );
    }

    return (
      <Button
        appearance={button.isPrimary ? 'primary' : 'subtle'}
        size={size}
        icon={ACTION_ICON[button.action]}
        disabled={isSubmitting}
        onClick={handler}
        aria-label={button.label}
      >
        {button.label}
      </Button>
    );
  }

  return null;
}

interface ConfirmationButtonProps {
  button: FormButton;
  size: 'small' | 'medium' | 'large';
  isSubmitting: boolean;
  onConfirm: () => void;
}

function ConfirmationButton({ button, size, isSubmitting, onConfirm }: ConfirmationButtonProps) {
  return (
    <Dialog>
      <DialogTrigger disableButtonEnhancement>
        <Button
          appearance={button.isPrimary ? 'primary' : 'subtle'}
          size={size}
          icon={ACTION_ICON[button.action]}
          disabled={isSubmitting}
          aria-label={button.label}
        >
          {button.label}
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{button.label}</DialogTitle>
          <DialogContent>
            {button.confirmationMessage ?? 'Are you sure you want to continue? Any unsaved changes will be lost.'}
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="primary" onClick={onConfirm}>Confirm</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
