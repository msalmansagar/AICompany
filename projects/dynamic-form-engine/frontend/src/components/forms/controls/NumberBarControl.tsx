// DFE-NUMBAR — read-only utilization gauge for number/decimal/currency fields.
// Fills = this field's value ÷ the value of the field named by field.barMaxFieldSchemaName.
import { makeStyles, tokens } from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  percent: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  track: {
    height: '10px',
    borderRadius: '5px',
    backgroundColor: tokens.colorNeutralBackground4,
    overflow: 'hidden',
  },
  fill: { height: '10px', borderRadius: '5px', transition: 'width 0.2s ease' },
});

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export function NumberBarControl({ field }: ControlProps) {
  const styles = useStyles();
  const { fieldValues } = useFormContext();

  const value = toNumber(fieldValues[field.schemaName]);
  const max = field.barMaxFieldSchemaName ? toNumber(fieldValues[field.barMaxFieldSchemaName]) : 0;
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const fmt = new Intl.NumberFormat(undefined, {
    style: field.currencyCode ? 'currency' : 'decimal',
    currency: field.currencyCode || undefined,
    maximumFractionDigits: field.decimalPlaces ?? (field.currencyCode ? 2 : 0),
  });

  // Colour: green under 75%, amber to 90%, red above (utilization warning).
  const color = pct >= 90 ? tokens.colorPaletteRedForeground1
    : pct >= 75 ? tokens.colorPaletteDarkOrangeForeground1
    : tokens.colorPaletteGreenForeground1;

  return (
    <div
      className={styles.root}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${field.label} utilization`}
    >
      <div className={styles.labelRow}>
        <span>{fmt.format(value)} / {max > 0 ? fmt.format(max) : '—'}</span>
        <span className={styles.percent}>{Math.round(pct)}%</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
