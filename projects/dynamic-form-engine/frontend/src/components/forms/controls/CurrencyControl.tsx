import { NumberControl } from './NumberControl';
import type { ControlProps } from '../FieldRenderer';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  PKR: '₨',
  SAR: '﷼',
  AED: 'د.إ',
};

export function CurrencyControl(props: ControlProps) {
  const { field } = props;

  const currencyCode = field.currencyCode ?? 'USD';
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;

  return <NumberControl {...props} prefix={symbol} />;
}
