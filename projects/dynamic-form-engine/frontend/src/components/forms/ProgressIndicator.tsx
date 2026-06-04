import { makeStyles, tokens, Text, ProgressBar } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    width: '100%',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepCounter: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightSemibold,
  },
  stepLabel: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  chipRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  chip: {
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  chipActive: {
    backgroundColor: 'var(--qdb-color-primary, ' + tokens.colorBrandBackground + ')',
    color: tokens.colorNeutralForegroundOnBrand,
    // Longhand avoids Griffel CSS shorthand restriction
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  chipCompleted: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  chipPending: {
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground3,
  },
});

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

type StepState = 'completed' | 'active' | 'pending';

function resolveStepState(stepIndex: number, currentStep: number): StepState {
  if (stepIndex < currentStep) return 'completed';
  if (stepIndex === currentStep) return 'active';
  return 'pending';
}

function buildProgressValue(currentStep: number, totalSteps: number): number {
  if (totalSteps <= 1) return 1;
  return currentStep / (totalSteps - 1);
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
  stepLabels,
}: ProgressIndicatorProps) {
  const styles = useStyles();
  const activeLabel = stepLabels[currentStep] ?? '';
  const progressValue = buildProgressValue(currentStep, totalSteps);

  return (
    <div className={styles.container} role="navigation" aria-label="Form progress">
      <div className={styles.row}>
        <Text className={styles.stepCounter}>
          Step {currentStep + 1} of {totalSteps}
        </Text>
        <Text className={styles.stepLabel}>{activeLabel}</Text>
      </div>

      <ProgressBar
        value={progressValue}
        aria-label={`Step ${currentStep + 1} of ${totalSteps}: ${activeLabel}`}
        aria-valuenow={currentStep + 1}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
      />

      <div className={styles.chipRow} role="list" aria-label="Steps">
        {stepLabels.map((label, index) => {
          const state = resolveStepState(index, currentStep);
          const chipClass =
            state === 'active'
              ? styles.chipActive
              : state === 'completed'
                ? styles.chipCompleted
                : styles.chipPending;

          return (
            <span
              key={label}
              className={`${styles.chip} ${chipClass}`}
              role="listitem"
              aria-current={state === 'active' ? 'step' : undefined}
            >
              {index + 1}. {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
