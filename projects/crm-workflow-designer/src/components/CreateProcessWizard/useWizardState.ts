// src/components/CreateProcessWizard/useWizardState.ts
import { useState, useCallback } from 'react';
import type { Step1Values, Step2Values, Step3Values } from './wizardSchemas';
import type { StepAssignment } from '@/types/SopTypes';

export type WizardStep = 0 | 1 | 2;

interface WizardData {
  step1: Step1Values;
  step2: Step2Values;
  step3: Step3Values;
}

interface WizardState {
  currentStep: WizardStep;
  data: WizardData;
  isSubmitting: boolean;
  submitError: string | null;
}

interface WizardStateActions {
  goToNextStep(): void;
  goToPreviousStep(): void;
  setStep1Data(values: Step1Values): void;
  setStep2Data(values: Step2Values): void;
  setStep3Data(values: Step3Values): void;
  setIsSubmitting(value: boolean): void;
  setSubmitError(error: string | null): void;
  buildStepAssignments(): StepAssignment[];
}

const EMPTY_WIZARD_DATA: WizardData = {
  step1: { processName: '', processDescription: '' },
  step2: { taskEntity: '', regardingField: '', parentEntity: '' },
  step3: { stepAssignments: [] },
};

export function useWizardState(): WizardState & WizardStateActions {
  const [currentStep, setCurrentStep] = useState<WizardStep>(0);
  const [data, setData] = useState<WizardData>(EMPTY_WIZARD_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const goToNextStep = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, 2) as WizardStep);
  }, []);

  const goToPreviousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0) as WizardStep);
  }, []);

  const setStep1Data = useCallback((values: Step1Values) => {
    setData((prev) => ({ ...prev, step1: values }));
  }, []);

  const setStep2Data = useCallback((values: Step2Values) => {
    setData((prev) => ({ ...prev, step2: values }));
  }, []);

  const setStep3Data = useCallback((values: Step3Values) => {
    setData((prev) => ({ ...prev, step3: values }));
  }, []);

  const buildStepAssignments = useCallback((): StepAssignment[] => {
    return data.step3.stepAssignments;
  }, [data.step3]);

  return {
    currentStep,
    data,
    isSubmitting,
    submitError,
    goToNextStep,
    goToPreviousStep,
    setStep1Data,
    setStep2Data,
    setStep3Data,
    setIsSubmitting: (value) => setIsSubmitting(value),
    setSubmitError: (error) => setSubmitError(error),
    buildStepAssignments,
  };
}
