import React from 'react';
import {
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { PersonRegular } from '@fluentui/react-icons';
import type { ActiveEditor } from '@/services/presence/EditLockService';

export interface PresenceBannerProps {
  editors: ActiveEditor[];
}

const useStyles = makeStyles({
  banner: {
    borderBottom: `1px solid ${tokens.colorPaletteYellowBorder1}`,
  },
  editorList: {
    display: 'inline',
  },
});

/**
 * Shown at the top of DesignerScreen when another user has an active
 * qdb_dfe_edit_lock for the current form. Hides automatically when the
 * presence poll finds no non-stale locks for other sessions.
 */
export function PresenceBanner({ editors }: PresenceBannerProps): React.ReactElement | null {
  const styles = useStyles();

  if (editors.length === 0) return null;

  const names = editors.map(e => e.displayName).join(', ');
  const verb = editors.length === 1 ? 'is' : 'are';

  return (
    <MessageBar intent="warning" className={styles.banner} role="status" aria-live="polite">
      <MessageBarBody>
        <MessageBarTitle>
          <PersonRegular aria-hidden="true" />
          {' '}Being edited by {names}
        </MessageBarTitle>
        <Text size={100} className={styles.editorList}>
          {names} {verb} currently editing this form. Your changes may conflict. Save
          frequently to detect conflicts early.
        </Text>
      </MessageBarBody>
    </MessageBar>
  );
}
