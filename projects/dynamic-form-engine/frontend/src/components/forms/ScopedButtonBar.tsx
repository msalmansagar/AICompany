// ScopedButtonBar — DFE-BTN-001 renders tab/section scoped buttons (Theme A) and
// dispatches their actions. Mounted below a tab's sections and below a section's
// field grid. Renders nothing when the placement has no visible buttons, so
// existing button-less forms are visually unchanged.

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { ScopedButton } from '@qdb/shared';
import { useFormContext } from '../../contexts/FormContext';
import { useScopedButtonAction } from './useScopedButtonAction';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    paddingTop: tokens.spacingVerticalM,
  },
});

interface ScopedButtonBarProps {
  buttons?: ScopedButton[];
}

export function ScopedButtonBar({ buttons }: ScopedButtonBarProps) {
  const styles = useStyles();
  const dispatch = useScopedButtonAction();
  const { isSubmitting, ruleState } = useFormContext();

  // DFE-CBTN-001: two independent axes — visibility (isVisible / visibleWhen) and
  // enablement (isActive / enabledWhen). The `effectiveVisible && (effectiveEnabled
  // || hasEnabledWhen)` predicate preserves exact legacy rendering for buttons
  // with no conditions, while letting a conditioned button render but disabled.
  const renderable = (buttons ?? [])
    .map((button) => {
      const hasVisibleWhen = button.visibleWhen != null;
      const hasEnabledWhen = button.enabledWhen != null;
      const effectiveVisible = hasVisibleWhen
        ? ruleState.buttonVisibility[button.id] ?? false
        : button.isVisible;
      const effectiveEnabled = hasEnabledWhen
        ? ruleState.buttonEnabledState[button.id] ?? false
        : button.isActive;
      const rendered = effectiveVisible && (effectiveEnabled || hasEnabledWhen);
      return { button, rendered, effectiveEnabled };
    })
    .filter((entry) => entry.rendered)
    .sort((a, b) => a.button.displayOrder - b.button.displayOrder);

  if (renderable.length === 0) return null;

  return (
    <div className={styles.bar} role="group" aria-label="Actions">
      {renderable.map(({ button, effectiveEnabled }) => (
        <ScopedButtonItem
          key={button.id}
          button={button}
          disabled={isSubmitting || !effectiveEnabled}
          onActivate={() => dispatch(button)}
        />
      ))}
    </div>
  );
}

interface ScopedButtonItemProps {
  button: ScopedButton;
  disabled: boolean;
  onActivate: () => void;
}

function ScopedButtonItem({ button, disabled, onActivate }: ScopedButtonItemProps) {
  const appearance = button.isPrimary ? 'primary' : 'secondary';

  if (!button.confirmationRequired) {
    return (
      <Button appearance={appearance} disabled={disabled} onClick={onActivate} aria-label={button.label}>
        {button.label}
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger disableButtonEnhancement>
        <Button appearance={appearance} disabled={disabled} aria-label={button.label}>
          {button.label}
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{button.label}</DialogTitle>
          <DialogContent>
            {button.confirmationMessage ?? 'Are you sure you want to continue?'}
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="primary" onClick={onActivate}>Confirm</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
