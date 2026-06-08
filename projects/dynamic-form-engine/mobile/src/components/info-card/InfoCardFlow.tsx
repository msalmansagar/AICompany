import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { FormDefinition } from '@qdb/shared';
import { apiPost } from '../../services/apiClient';
import { logger } from '../../logger';
import { InfoCardScreenView } from './InfoCardScreenView';
import { InfoCardNavBar } from './InfoCardNavBar';

interface Props {
  formDefinition: FormDefinition;
  accessToken: string;
  onComplete: () => void;
}

export function InfoCardFlow({ formDefinition, accessToken, onComplete }: Props) {
  const sorted = [...(formDefinition.infoCards ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const [currentIndex, setCurrentIndex] = useState(0);
  const auditFiredRef = useRef(false);

  const backLabel = formDefinition.infocardBackLabel ?? 'Back';
  const continueLabel = formDefinition.infocardContinueLabel ?? 'Continue';
  const startLabel = formDefinition.infocardStartLabel ?? 'Start';
  const skipLabel = formDefinition.infocardSkipLabel ?? 'Skip';

  useEffect(() => {
    if (auditFiredRef.current) return;
    auditFiredRef.current = true;
    fireAudit(formDefinition.formCode, accessToken);
  }, [formDefinition.formCode, accessToken]);

  const handleBack = useCallback((): void => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleContinue = useCallback((): void => {
    if (currentIndex >= sorted.length - 1) {
      onComplete();
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, sorted.length, onComplete]);

  const handleSkip = useCallback((): void => {
    onComplete();
  }, [onComplete]);

  const currentScreen = sorted[currentIndex];
  if (currentScreen === undefined) return null;

  return (
    <View style={styles.container}>
      <InfoCardScreenView screen={currentScreen} />
      <InfoCardNavBar
        isFirstScreen={currentIndex === 0}
        isLastScreen={currentIndex === sorted.length - 1}
        allowSkip={formDefinition.allowInfocardSkip}
        backLabel={backLabel}
        continueLabel={continueLabel}
        startLabel={startLabel}
        skipLabel={skipLabel}
        onBack={handleBack}
        onContinue={handleContinue}
        onSkip={handleSkip}
      />
    </View>
  );
}

function fireAudit(formCode: string, accessToken: string): void {
  apiPost(`/api/forms/${formCode}/info-card-viewed`, {}, accessToken)
    .catch((error: unknown) => {
      logger.warn({ message: 'Info-card audit fire-and-forget failed', context: { formCode, error } });
    });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
});
