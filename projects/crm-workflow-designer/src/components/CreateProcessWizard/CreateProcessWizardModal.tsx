// src/components/CreateProcessWizard/CreateProcessWizardModal.tsx
import { useCallback } from 'react';
import { Step1ProcessIdentity } from './Step1ProcessIdentity';
import { Step2CrmBinding } from './Step2CrmBinding';
import { Step3StepAssignments } from './Step3StepAssignments';
import { useWizardState } from './useWizardState';
import { useSopAdapter } from '@/hooks/useSopAdapter';
import type { Sop, SopStep } from '@/types/SopTypes';

interface CreateProcessWizardModalProps {
  sop: Sop;
  sopSteps: SopStep[];
  isOpen: boolean;
  onDismiss(): void;
  onSuccess(newProcessId: string): void;
}

const STEP_TITLES = [
  'Step 1 of 3 — Process Identity',
  'Step 2 of 3 — CRM Binding',
  'Step 3 of 3 — Step Assignments',
] as const;

export function CreateProcessWizardModal({
  sop,
  sopSteps,
  isOpen,
  onDismiss,
  onSuccess,
}: CreateProcessWizardModalProps) {
  const adapter = useSopAdapter();
  const wizard = useWizardState();

  const handleSubmit = useCallback(async () => {
    wizard.setIsSubmitting(true);
    wizard.setSubmitError(null);

    try {
      const newProcessId = await adapter.createProcessFromSop({
        sopId: sop.id,
        processName: wizard.data.step1.processName,
        processDescription: wizard.data.step1.processDescription,
        taskEntity: wizard.data.step2.taskEntity,
        regardingField: wizard.data.step2.regardingField,
        parentEntity: wizard.data.step2.parentEntity,
        stepAssignments: wizard.buildStepAssignments(),
      });
      onSuccess(newProcessId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';
      wizard.setSubmitError(message);
    } finally {
      wizard.setIsSubmitting(false);
    }
  }, [adapter, sop.id, wizard, onSuccess]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === e.currentTarget) onDismiss(); },
    [onDismiss]
  );

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={handleOverlayClick}>
      <div className="dialog" style={{ width: 720 }} role="dialog" aria-modal="true" aria-label="Create process from SOP">
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <h2>Create process from SOP</h2>
            <div style={subtitleStyle}>{STEP_TITLES[wizard.currentStep]}</div>
          </div>
          <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Progress bar */}
        <div style={progressBarTrackStyle}>
          <div
            style={{
              ...progressBarFillStyle,
              width: `${((wizard.currentStep + 1) / 3) * 100}%`,
            }}
          />
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {wizard.submitError && (
            <div style={errorBannerStyle}>{wizard.submitError}</div>
          )}

          {wizard.currentStep === 0 && (
            <Step1ProcessIdentity
              sop={sop}
              initialValues={wizard.data.step1}
              onValidated={(values) => {
                wizard.setStep1Data(values);
                wizard.goToNextStep();
              }}
            />
          )}

          {wizard.currentStep === 1 && (
            <Step2CrmBinding
              initialValues={wizard.data.step2}
              onValidated={(values) => {
                wizard.setStep2Data(values);
                wizard.goToNextStep();
              }}
              onBack={wizard.goToPreviousStep}
            />
          )}

          {wizard.currentStep === 2 && (
            <Step3StepAssignments
              sopSteps={sopSteps}
              initialValues={wizard.data.step3}
              onValidated={(values) => wizard.setStep3Data(values)}
              onBack={wizard.goToPreviousStep}
            />
          )}
        </div>

        {/* Footer (only on last step) */}
        {wizard.currentStep === 2 && (
          <div className="dialog-foot" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              style={cancelBtnStyle}
              onClick={onDismiss}
              disabled={wizard.isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              style={wizard.isSubmitting ? submitBtnDisabledStyle : submitBtnStyle}
              onClick={() => void handleSubmit()}
              disabled={wizard.isSubmitting}
            >
              {wizard.isSubmitting ? 'Creating…' : 'Create Process'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '20px 24px 14px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-secondary)', marginTop: 2,
};

const progressBarTrackStyle: React.CSSProperties = {
  height: 3, background: 'var(--surface-alt)', flexShrink: 0,
};

const progressBarFillStyle: React.CSSProperties = {
  height: '100%', background: 'var(--primary)',
  transition: 'width 0.3s ease',
};

const bodyStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto',
  padding: '20px 24px',
  display: 'flex', flexDirection: 'column', gap: 0,
};

const errorBannerStyle: React.CSSProperties = {
  padding: '10px 14px', marginBottom: 16,
  background: 'var(--error-bg)', border: '1px solid var(--error)',
  borderRadius: 6, color: 'var(--error)', fontSize: 13,
};

const cancelBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 18px',
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)',
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
};

const submitBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 20px',
  background: 'var(--primary)', border: 'none',
  borderRadius: 6, color: 'var(--text-on-primary)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const submitBtnDisabledStyle: React.CSSProperties = {
  ...submitBtnStyle,
  background: 'var(--primary-tint)', cursor: 'not-allowed',
};
