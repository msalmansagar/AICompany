import React from 'react';
import { Text, tokens, makeStyles } from '@fluentui/react-components';

export interface FormDiffViewerProps {
  /** The form definition ID of the record that conflicted. */
  formId: string;
  /** The etag from the local (stale) version. */
  localEtag: string;
}

const useStyles = makeStyles({
  container: {
    padding: '16px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
});

/**
 * STUB — Workstream H integration point.
 *
 * The real FormDiffViewer is authored in the Workstream H branch
 * (feat/dfe-enh-diff-viewer). It accepts these same props and renders
 * a side-by-side diff of `localEtag` vs the current server version.
 *
 * TODO(DFE-ENH-001-H): Replace this placeholder with the canonical
 * FormDiffViewer from Workstream H at merge time.
 * The consumed prop interface (formId: string, localEtag: string) is
 * the agreed integration contract — Workstream H must not change it
 * without an ADR.
 */
export function FormDiffViewer({ formId, localEtag }: FormDiffViewerProps): React.ReactElement {
  const styles = useStyles();
  return (
    <div className={styles.container} role="region" aria-label="Form diff viewer">
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        Form diff view for record {formId} (local etag: {localEtag}) is available
        after Workstream H is merged. Use &quot;Reload&quot; to discard local changes and
        load the current server version.
      </Text>
    </div>
  );
}
