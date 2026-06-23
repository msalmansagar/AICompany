import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control, UseFormSetValue } from 'react-hook-form';
import { RuleEngine } from '@qdb/shared';
import type { RuleEvaluationResult, FormDefinition, BusinessRule } from '@qdb/shared';

interface MobileFormContextValue {
  ruleState: RuleEvaluationResult;
}

const EMPTY_RULE_STATE: RuleEvaluationResult = {
  visibilityMap: new Map(),
  requiredMap: new Map(),
  readonlyMap: new Map(),
  clearedFields: new Set(),
  calculatedValues: new Map(),
};

const MobileFormContext = createContext<MobileFormContextValue>({ ruleState: EMPTY_RULE_STATE });

export function useMobileFormContext(): MobileFormContextValue {
  return useContext(MobileFormContext);
}

interface Props {
  form: FormDefinition;
  control: Control<Record<string, unknown>>;
  setValue: UseFormSetValue<Record<string, unknown>>;
  children: React.ReactNode;
}

export function MobileFormProvider({ form, control, setValue, children }: Props) {
  const watchedValues = useWatch({ control }) as Record<string, unknown>;
  const [ruleState, setRuleState] = useState<RuleEvaluationResult>(EMPTY_RULE_STATE);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const ruleEngine = useMemo(() => {
    const rules = (form.businessRules ?? []) as BusinessRule[];
    return rules.length > 0 ? new RuleEngine(rules) : null;
  }, [form.businessRules]);

  useEffect(() => {
    if (!ruleEngine) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void ruleEngine.evaluate(watchedValues).then((result) => {
        setRuleState(result);
        // Apply calculated values — only if different to avoid loops.
        for (const [key, value] of result.calculatedValues) {
          if (watchedValues[key] !== value) {
            setValue(key as string, value, { shouldValidate: false });
          }
        }
        // Clear fields that were hidden — only if not already null.
        for (const key of result.clearedFields) {
          if (watchedValues[key] !== null && watchedValues[key] !== undefined) {
            setValue(key as string, null, { shouldValidate: false });
          }
        }
      });
    }, 150);
    return () => clearTimeout(debounceRef.current);
  // watchedValues reference changes on every field update — that is intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedValues), ruleEngine]);

  const contextValue = useMemo(() => ({ ruleState }), [ruleState]);

  return (
    <MobileFormContext.Provider value={contextValue}>
      {children}
    </MobileFormContext.Provider>
  );
}
