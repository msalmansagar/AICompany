import React from 'react';
import { Text, tokens, makeStyles } from '@fluentui/react-components';
import type { DesignerFormModel } from '@/state/models/DesignerFormModel';

/**
 * Props match Workstream H's canonical FormDiffViewer contract exactly so the
 * merge from feat/dfe-enh-diff-viewer is a no-op.
 *
 * TODO(DFE-ENH-001-H): Replace this stub implementation with the real
 * side-by-side diff renderer from Workstream H at merge time.
 */
export interface FormDiffViewerProps {
  /** The local (pre-conflict) snapshot of the form. */
  before: DesignerFormModel;
  /** The server (post-conflict) version of the form. */
  after: DesignerFormModel;
  /** Optional: resolves a field key to a human-readable label. */
  labelResolver?: (fieldKey: string) => string;
}

/**
 * Stub implementation of Workstream H's `summarizeDiff`.
 * Returns a one-sentence description of the most prominent change between
 * the before and after snapshots.
 *
 * TODO(DFE-ENH-001-H): Replace with H's full summarizeDiff at merge time.
 */
export function summarizeDiff(before: DesignerFormModel, after: DesignerFormModel): string {
  if (before.name !== after.name) {
    return `Form name changed from "${before.name}" to "${after.name}".`;
  }
  if (before.status !== after.status) {
    return `Form status changed from "${before.status}" to "${after.status}".`;
  }
  return 'The form was modified by another user. Review the changes below.';
}

const useStyles = makeStyles({
  container: {
    padding: '16px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
});

export function FormDiffViewer({ before, after }: FormDiffViewerProps): React.ReactElement {
  const styles = useStyles();
  return (
    <div className={styles.container} role="region" aria-label="Form diff viewer">
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        {summarizeDiff(before, after)} Use &quot;Reload&quot; to discard local changes and
        load the current server version.
      </Text>
    </div>
  );
}
