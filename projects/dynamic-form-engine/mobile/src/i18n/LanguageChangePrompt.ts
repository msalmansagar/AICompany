/**
 * LanguageChangePrompt — imperative helper that shows a confirmation Alert
 * before triggering the RTL reload on a post-onboarding language change.
 *
 * WHY a separate module: keeps Alert logic out of RtlManager (which has no
 * knowledge of UI) and keeps the onboarding screen focused on first-launch flow.
 *
 * Usage:
 *   const confirmed = await promptLanguageRestart(newCode, t);
 *   if (confirmed) { ... persist + applyRtlIfChanged }
 */
import { Alert } from 'react-native';

/**
 * Shows a confirmation dialog before applying an RTL-changing language switch.
 * Resolves to true if the user confirms, false if they cancel.
 */
export function promptLanguageRestart(
  newLanguageDisplayName: string,
  confirmLabel: string,
  cancelLabel: string,
  title: string,
  message: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      {
        text: cancelLabel,
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
    // Suppress unused parameter warning — displayName used in message by caller
    void newLanguageDisplayName;
  });
}
