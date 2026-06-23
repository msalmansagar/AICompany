import { makeStyles, tokens, Button } from '@fluentui/react-components';
import { ArrowLeftRegular, ArrowRightRegular, PlayRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  navBar: {
    position: 'sticky',
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow8,
    zIndex: 10,
    '@media (max-width: 480px)': {
      flexDirection: 'column',
      gap: tokens.spacingVerticalS,
    },
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
});

interface InfoCardNavBarProps {
  isFirstScreen: boolean;
  isLastScreen: boolean;
  allowSkip: boolean;
  backLabel: string;
  continueLabel: string;
  startLabel: string;
  skipLabel: string;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function InfoCardNavBar({
  isFirstScreen,
  isLastScreen,
  allowSkip,
  backLabel,
  continueLabel,
  startLabel,
  skipLabel,
  onBack,
  onContinue,
  onSkip,
}: InfoCardNavBarProps) {
  const styles = useStyles();

  return (
    <div className={styles.navBar} role="navigation" aria-label="Info card navigation">
      <div className={styles.leftGroup}>
        {!isFirstScreen && (
          <Button
            appearance="secondary"
            icon={<ArrowLeftRegular />}
            onClick={onBack}
          >
            {backLabel}
          </Button>
        )}
      </div>

      <div className={styles.rightGroup}>
        {allowSkip && (
          <Button
            appearance="subtle"
            onClick={onSkip}
            aria-label="Skip info screens and go to the form"
          >
            {skipLabel}
          </Button>
        )}

        {isLastScreen ? (
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            onClick={onContinue}
            aria-label="Start filling in the form"
          >
            {startLabel}
          </Button>
        ) : (
          <Button
            appearance="primary"
            iconPosition="after"
            icon={<ArrowRightRegular />}
            onClick={onContinue}
            aria-label="Continue to next screen"
          >
            {continueLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
