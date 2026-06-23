import { useEffect } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import type { InfoCardScreen as InfoCardScreenType, FormDefinition } from '@qdb/shared';
import { InfoCardScreen } from './InfoCardScreen';
import { InfoCardNavBar } from './InfoCardNavBar';
import { useInfoCardNavigation } from '../../../hooks/useInfoCardNavigation';
import apiClient from '../../../api/apiClient';
import { logger } from '../../../utils/logger';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '400px',
    position: 'relative',
  },
  screenWrapper: {
    flex: '1 1 auto',
    overflowY: 'auto',
  },
  loadingWrapper: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXL,
  },
});

interface InfoCardFlowProps {
  formDefinition: FormDefinition;
  onComplete: () => void;
}

export function InfoCardFlow({ formDefinition, onComplete }: InfoCardFlowProps) {
  const styles = useStyles();

  const sortedScreens: InfoCardScreenType[] = [...formDefinition.infoCards].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  const { currentIndex, isFirstScreen, isLastScreen, goNext, goPrev, skipAll } =
    useInfoCardNavigation(sortedScreens.length, onComplete);

  // Fire-and-forget first-view audit — only runs once per form session.
  // Failures are swallowed after logging because the audit is non-blocking per architecture.
  useEffect(() => {
    let cancelled = false;

    async function checkAndRecordFirstView() {
      try {
        const response = await apiClient.get<{ hasViewed: boolean }>(
          `/forms/${formDefinition.formCode}/infocard-view-status`,
        );
        const hasViewed = response.data.hasViewed;

        if (!hasViewed && !cancelled) {
          // Fire-and-forget — do not await or surface errors to the user.
          void apiClient.post(
            `/forms/${formDefinition.formCode}/info-card-viewed`,
            {},
          );
        }
      } catch (error) {
        // Per architecture: log but do not degrade UX.
        logger.error('info_card_view_check_failed', {
          formId: formDefinition.formCode,
          operation: 'recordInfoCardView',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    void checkAndRecordFirstView();

    return () => {
      cancelled = true;
    };
  // Only run on mount — the component does not re-check on screen navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDefinition.formCode]);

  if (sortedScreens.length === 0) {
    // Guard: if infoCards is unexpectedly empty, proceed immediately.
    onComplete();
    return null;
  }

  const currentScreen = sortedScreens[currentIndex];

  if (!currentScreen) return null;

  return (
    <div className={styles.root} aria-live="polite" aria-atomic="false">
      <div className={styles.screenWrapper}>
        <InfoCardScreen
          screen={currentScreen}
          formTitle={formDefinition.title}
        />
      </div>

      <InfoCardNavBar
        isFirstScreen={isFirstScreen}
        isLastScreen={isLastScreen}
        allowSkip={formDefinition.allowInfocardSkip}
        backLabel={formDefinition.infocardBackLabel ?? 'Back'}
        continueLabel={formDefinition.infocardContinueLabel ?? 'Continue'}
        startLabel={formDefinition.infocardStartLabel ?? 'Start'}
        skipLabel={formDefinition.infocardSkipLabel ?? 'Skip'}
        onBack={goPrev}
        onContinue={goNext}
        onSkip={skipAll}
      />
    </div>
  );
}
