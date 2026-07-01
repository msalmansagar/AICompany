// LabelField (web) — DFE-FBE-001 read-only display field.
//
// Wave 1: renders the field's static content (qdb_static_content) with the field label as an
// optional heading. Purely presentational — never registered as a form value at submit.
// Wave 2 (C-001-gated): when field.sourceFieldSchemaName is set, this will mirror the source
// field's current value read-only via ReadOnlyFieldValue.
import type { FieldDefinition } from '@qdb/shared';
import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: { padding: '4px 0' },
  heading: { fontWeight: tokens.fontWeightSemibold, marginBottom: '2px', display: 'block' },
  content: { whiteSpace: 'pre-wrap', color: tokens.colorNeutralForeground1 },
});

export function LabelField({ field }: { field: FieldDefinition }) {
  const styles = useStyles();
  const content = field.staticContent ?? '';
  return (
    <div className={styles.root} data-field-type="label" data-field-key={field.schemaName}>
      {field.label ? <span className={styles.heading}>{field.label}</span> : null}
      <span className={styles.content}>{content}</span>
    </div>
  );
}
