import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  makeStyles,
  shorthands,
  tokens,
  Divider,
  Toolbar,
  ToolbarButton,
} from '@fluentui/react-components';
import {
  TextBoldRegular,
  TextItalicRegular,
  TextBulletListRegular,
  TextNumberListLtrRegular,
} from '@fluentui/react-icons';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  wrapper: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    ':focus-within': {
      ...shorthands.borderColor(tokens.colorBrandStroke1),
      outlineStyle: 'solid',
      outlineWidth: '2px',
      outlineColor: tokens.colorBrandStroke1,
    },
  },
  toolbar: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
    gap: tokens.spacingHorizontalXXS,
  },
  editorContent: {
    padding: tokens.spacingVerticalS,
    minHeight: '120px',
    '& .tiptap': {
      outline: 'none',
      minHeight: '100px',
    },
    '& p': {
      margin: '0 0 0.5em 0',
    },
  },
  readonlyWrapper: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    minHeight: '80px',
  },
});

export function RichTextControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue } = useFormContext();

  const rawValue = (fieldValues[field.schemaName] as string | null | undefined) ?? '';

  const editor = useEditor({
    extensions: [StarterKit],
    content: rawValue,
    editable: !isReadonly,
    onUpdate: ({ editor: updatedEditor }) => {
      updateFieldValue(field.schemaName, updatedEditor.getHTML());
    },
  });

  if (isReadonly) {
    return (
      <div
        className={styles.readonlyWrapper}
        id={inputId}
        aria-label={field.label}
        aria-readonly="true"
      >
        {/* EditorContent renders through tiptap's ProseMirror schema, which
            only permits nodes defined in StarterKit — no arbitrary HTML injection. */}
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div
      className={styles.wrapper}
      id={inputId}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
    >
      <Toolbar className={styles.toolbar} aria-label={`${field.label} formatting toolbar`}>
        <ToolbarButton
          appearance="transparent"
          icon={<TextBoldRegular />}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          aria-pressed={editor?.isActive('bold')}
          aria-label="Bold"
        />
        <ToolbarButton
          appearance="transparent"
          icon={<TextItalicRegular />}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          aria-pressed={editor?.isActive('italic')}
          aria-label="Italic"
        />
        <Divider vertical />
        <ToolbarButton
          appearance="transparent"
          icon={<TextBulletListRegular />}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          aria-pressed={editor?.isActive('bulletList')}
          aria-label="Bullet list"
        />
        <ToolbarButton
          appearance="transparent"
          icon={<TextNumberListLtrRegular />}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          aria-pressed={editor?.isActive('orderedList')}
          aria-label="Numbered list"
        />
      </Toolbar>

      <div className={styles.editorContent}>
        <EditorContent
          editor={editor}
          aria-label={field.label}
          aria-multiline="true"
        />
      </div>
    </div>
  );
}
