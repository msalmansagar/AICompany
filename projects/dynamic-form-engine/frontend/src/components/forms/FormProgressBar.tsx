// DFE-FBE-002 — form-completion progress bar, rendered above the tab strip.
import { ProgressBar, makeStyles, tokens } from '@fluentui/react-components';
import { useFormContext } from '../../contexts/FormContext';
import { computeFormCompletion } from './formCompletion';

const useStyles = makeStyles({
  root: { padding: '2px 0 10px' },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '4px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  percent: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
});

export function FormProgressBar() {
  const styles = useStyles();
  const { formDefinition, fieldValues, ruleState } = useFormContext();
  if (!formDefinition) return null;

  const { percent, filled, total } = computeFormCompletion(formDefinition, fieldValues, ruleState);

  return (
    <div
      className={styles.root}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Form completion"
    >
      <div className={styles.labelRow}>
        <span>Completion</span>
        <span className={styles.percent}>
          {percent}%{total > 0 ? ` · ${filled}/${total}` : ''}
        </span>
      </div>
      <ProgressBar value={percent / 100} thickness="large" />
    </div>
  );
}
