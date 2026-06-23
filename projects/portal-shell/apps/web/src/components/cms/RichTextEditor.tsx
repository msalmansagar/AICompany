'use client';

import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import TextDirection from 'tiptap-text-direction';
import {
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  TextBoldRegular,
  TextItalicRegular,
  TextUnderlineRegular,
  TextHeader1Regular,
  TextHeader2Regular,
  TextHeader3Regular,
  TextBulletListRegular,
  TextNumberListLrtRegular,
  TextAlignLeftRegular,
  TextAlignCenterRegular,
  TextAlignRightRegular,
  LinkRegular,
  ArrowUndoRegular,
  ArrowRedoRegular,
} from '@fluentui/react-icons';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  dir?: 'ltr' | 'rtl';
  disabled?: boolean;
}

const useStyles = makeStyles({
  wrapper: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  toolbar: {
    borderBlockEnd: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingBlock: tokens.spacingVerticalXS,
    paddingInline: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
  },
  editorContent: {
    minHeight: '200px',
    paddingInline: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalM,
    '& .tiptap': {
      outline: 'none',
      minHeight: '200px',
    },
    '& .tiptap p.is-editor-empty:first-child::before': {
      color: tokens.colorNeutralForeground4,
      content: 'attr(data-placeholder)',
      float: 'inline-start',
      height: 0,
      pointerEvents: 'none',
    },
    '& .tiptap h1': { fontSize: tokens.fontSizeHero700 },
    '& .tiptap h2': { fontSize: tokens.fontSizeHero800 },
    '& .tiptap h3': { fontSize: tokens.fontSizeBase600 },
    '& .tiptap ul': { paddingInlineStart: tokens.spacingHorizontalXL },
    '& .tiptap ol': { paddingInlineStart: tokens.spacingHorizontalXL },
    '& .tiptap blockquote': {
      borderInlineStart: `4px solid ${tokens.colorNeutralStroke1}`,
      paddingInlineStart: tokens.spacingHorizontalM,
      color: tokens.colorNeutralForeground2,
    },
    '& .tiptap a': { color: tokens.colorBrandForeground1, textDecoration: 'underline' },
    '& .tiptap code': {
      backgroundColor: tokens.colorNeutralBackground3,
      paddingInline: tokens.spacingHorizontalXS,
      borderRadius: tokens.borderRadiusSmall,
      fontFamily: tokens.fontFamilyMonospace,
    },
  },
  dirToggle: {
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    minWidth: 'auto',
    paddingInline: tokens.spacingHorizontalS,
  },
});

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  dir = 'ltr',
  disabled = false,
}: RichTextEditorProps) {
  const styles = useStyles();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
      TextDirection.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: value,
    editable: !disabled,
    onUpdate({ editor: e }) {
      onChange(e.getHTML());
    },
  });

  // Sync external value changes (e.g., when switching tabs or resetting form)
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (currentHtml !== value) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  // Sync disabled state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  function handleSetLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link')['href'] as string | undefined;
    const url = window.prompt('Enter URL', previousUrl ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  function toggleDirection() {
    if (!editor) return;
    const currentDir = editor.getAttributes('paragraph')['dir'] as string | undefined;
    const nextDir = currentDir === 'rtl' ? 'ltr' : 'rtl';
    editor.chain().focus().setTextDirection(nextDir).run();
  }

  if (!editor) return null;

  return (
    <div className={styles.wrapper} dir={dir}>
      <Toolbar className={styles.toolbar} aria-label="Rich text editor toolbar">
        <ToolbarButton
          aria-label="Bold"
          icon={<TextBoldRegular />}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-pressed={editor.isActive('bold')}
          disabled={disabled}
        />
        <ToolbarButton
          aria-label="Italic"
          icon={<TextItalicRegular />}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-pressed={editor.isActive('italic')}
          disabled={disabled}
        />
        <ToolbarButton
          aria-label="Underline"
          icon={<TextUnderlineRegular />}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-pressed={editor.isActive('underline')}
          disabled={disabled}
        />

        <ToolbarDivider />

        <ToolbarButton
          aria-label="Heading 1"
          icon={<TextHeader1Regular />}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          aria-pressed={editor.isActive('heading', { level: 1 })}
          disabled={disabled}
        />
        <ToolbarButton
          aria-label="Heading 2"
          icon={<TextHeader2Regular />}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-pressed={editor.isActive('heading', { level: 2 })}
          disabled={disabled}
        />
        <ToolbarButton
          aria-label="Heading 3"
          icon={<TextHeader3Regular />}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-pressed={editor.isActive('heading', { level: 3 })}
          disabled={disabled}
        />

        <ToolbarDivider />

        <ToolbarButton
          aria-label="Bullet list"
          icon={<TextBulletListRegular />}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-pressed={editor.isActive('bulletList')}
          disabled={disabled}
        />
        <ToolbarButton
          aria-label="Ordered list"
          icon={<TextNumberListLrtRegular />}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-pressed={editor.isActive('orderedList')}
          disabled={disabled}
        />

        <ToolbarDivider />

        <ToolbarButton
          aria-label="Align left"
          icon={<TextAlignLeftRegular />}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          aria-pressed={editor.isActive({ textAlign: 'left' })}
          disabled={disabled}
        />
        <ToolbarButton
          aria-label="Align center"
          icon={<TextAlignCenterRegular />}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          aria-pressed={editor.isActive({ textAlign: 'center' })}
          disabled={disabled}
        />
        <ToolbarButton
          aria-label="Align right"
          icon={<TextAlignRightRegular />}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          aria-pressed={editor.isActive({ textAlign: 'right' })}
          disabled={disabled}
        />

        <ToolbarDivider />

        <ToolbarButton
          aria-label="Toggle text direction"
          className={styles.dirToggle}
          onClick={toggleDirection}
          disabled={disabled}
        >
          RTL/LTR
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          aria-label="Insert link"
          icon={<LinkRegular />}
          onClick={handleSetLink}
          aria-pressed={editor.isActive('link')}
          disabled={disabled}
        />

        <ToolbarDivider />

        <ToolbarButton
          aria-label="Undo"
          icon={<ArrowUndoRegular />}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={disabled || !editor.can().undo()}
        />
        <ToolbarButton
          aria-label="Redo"
          icon={<ArrowRedoRegular />}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={disabled || !editor.can().redo()}
        />
      </Toolbar>

      <div className={styles.editorContent}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
