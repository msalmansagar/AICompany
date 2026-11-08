import { useMemo } from 'react';
import { useFormContext } from '../../../contexts/FormContext';

/**
 * The option values a disableOptions rule has made unselectable for one field.
 *
 * Read as a set so each control asks one question per option. Absent state (a form with no
 * such rule, or a test that stubs only part of the rule state) disables nothing.
 */
export function useDisabledOptions(fieldId: string): ReadonlySet<string> {
  const { ruleState } = useFormContext();
  const disabledByRule = ruleState.disabledOptions?.[fieldId];
  return useMemo(() => new Set(disabledByRule ?? []), [disabledByRule]);
}
