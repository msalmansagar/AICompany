import { useFormContext, FormContextValue } from '../contexts/FormContext';

/**
 * Convenience hook that exposes the full FormContext value.
 * The rule engine evaluation loop with 150ms debounce is managed inside
 * FormContext — this hook simply provides a clean API surface.
 */
export function useFormEngine(): FormContextValue {
  return useFormContext();
}
