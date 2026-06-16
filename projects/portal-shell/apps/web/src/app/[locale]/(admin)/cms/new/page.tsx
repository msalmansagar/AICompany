'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Title2,
  Body1,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Text,
  Badge,
  makeStyles,
  tokens,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { ArrowLeftRegular, SaveRegular, DismissRegular } from '@fluentui/react-icons';
import slugify from 'slugify';
import { RichTextEditor } from '../../../../../components/cms/RichTextEditor';
import { useCreateCmsContent } from '../../../../../hooks/useCms';
import type { CmsContentType } from '@portal/types';

const useStyles = makeStyles({
  page: { maxWidth: '1100px' },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    marginBlockEnd: tokens.spacingVerticalL,
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalL,
  },
  editorGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalL,
    marginBlockStart: tokens.spacingVerticalL,
  },
  editorPane: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  editorLabel: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  tagsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    marginBlockStart: tokens.spacingVerticalXS,
  },
  imagePreview: {
    marginBlockStart: tokens.spacingVerticalXS,
    borderRadius: tokens.borderRadiusMedium,
    maxHeight: '120px',
    objectFit: 'cover',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    marginBlockStart: tokens.spacingVerticalXL,
    paddingBlockStart: tokens.spacingVerticalL,
    borderBlockStart: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  section: {
    marginBlockEnd: tokens.spacingVerticalL,
  },
});

interface CmsFormState {
  slug: string;
  title: string;
  titleAr: string;
  contentType: CmsContentType;
  authorName: string;
  tagsInput: string;
  metaDescription: string;
  excerpt: string;
  excerptAr: string;
  bodyHtml: string;
  bodyHtmlAr: string;
  coverImageUrl: string;
}

const INITIAL_STATE: CmsFormState = {
  slug: '',
  title: '',
  titleAr: '',
  contentType: 'news',
  authorName: '',
  tagsInput: '',
  metaDescription: '',
  excerpt: '',
  excerptAr: '',
  bodyHtml: '',
  bodyHtmlAr: '',
  coverImageUrl: '',
};

export default function AdminCmsNewPage() {
  const styles = useStyles();
  const router = useRouter();
  const createMutation = useCreateCmsContent();

  const [form, setForm] = useState<CmsFormState>(INITIAL_STATE);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function setField<K extends keyof CmsFormState>(key: K, value: CmsFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleTitleChange(value: string) {
    setField('title', value);
    if (!slugManuallyEdited) {
      setField(
        'slug',
        slugify(value, { lower: true, strict: true, trim: true }),
      );
    }
  }

  function handleSlugChange(value: string) {
    setSlugManuallyEdited(true);
    setField('slug', slugify(value, { lower: true, strict: true, trim: true }));
  }

  const parsedTags = form.tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  function handleSaveDraft() {
    setErrorMessage(null);
    createMutation.mutate(
      {
        slug: form.slug,
        title: form.title,
        titleAr: form.titleAr,
        contentType: form.contentType,
        bodyHtml: form.bodyHtml,
        bodyHtmlAr: form.bodyHtmlAr,
        excerpt: form.excerpt,
        excerptAr: form.excerptAr,
        coverImageUrl: form.coverImageUrl || null,
        authorName: form.authorName,
        tags: parsedTags,
        metaDescription: form.metaDescription,
      },
      {
        onSuccess: () => router.push('/en/admin/cms'),
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Failed to save content. Please try again.';
          setErrorMessage(message);
        },
      },
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={() => router.push('/en/admin/cms')}
          aria-label="Back to content list"
        />
        <div>
          <Title2 block>New Content</Title2>
          <Body1>Create a new CMS content item.</Body1>
        </div>
      </div>

      {errorMessage && (
        <MessageBar intent="error" style={{ marginBlockEnd: tokens.spacingVerticalM }}>
          <MessageBarBody>{errorMessage}</MessageBarBody>
        </MessageBar>
      )}

      <div className={`${styles.section} ${styles.grid2}`}>
        <Field label="Title (English)" required>
          <Input
            value={form.title}
            onChange={(_, d) => handleTitleChange(d.value)}
            placeholder="Enter title in English"
          />
        </Field>
        <Field label="Title (Arabic)" required>
          <Input
            value={form.titleAr}
            dir="rtl"
            onChange={(_, d) => setField('titleAr', d.value)}
            placeholder="أدخل العنوان بالعربية"
          />
        </Field>
      </div>

      <div className={`${styles.section} ${styles.grid2}`}>
        <Field label="Slug (URL path)" required hint="Auto-generated from title. Lowercase letters, numbers, and hyphens only.">
          <Input
            value={form.slug}
            onChange={(_, d) => handleSlugChange(d.value)}
            placeholder="my-article-slug"
          />
        </Field>
        <Field label="Content Type" required>
          <Select
            value={form.contentType}
            onChange={(_, d) => setField('contentType', d.value as CmsContentType)}
          >
            <option value="blog">Blog</option>
            <option value="news">News</option>
            <option value="announcement">Announcement</option>
            <option value="page">Page</option>
          </Select>
        </Field>
      </div>

      <div className={`${styles.section} ${styles.grid2}`}>
        <Field label="Author Name" required>
          <Input
            value={form.authorName}
            onChange={(_, d) => setField('authorName', d.value)}
            placeholder="John Smith"
          />
        </Field>
        <Field
          label="Tags"
          hint="Separate multiple tags with commas"
        >
          <Input
            value={form.tagsInput}
            onChange={(_, d) => setField('tagsInput', d.value)}
            placeholder="technology, updates, policy"
          />
        </Field>
      </div>

      {parsedTags.length > 0 && (
        <div className={`${styles.tagsRow} ${styles.section}`}>
          {parsedTags.map((tag) => (
            <Badge key={tag} appearance="tint" color="brand" size="medium">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className={styles.section}>
        <Field label="Meta Description">
          <Textarea
            value={form.metaDescription}
            onChange={(_, d) => setField('metaDescription', d.value)}
            placeholder="Brief description for search engines (150–160 characters)"
            rows={2}
          />
        </Field>
      </div>

      <div className={`${styles.section} ${styles.grid2}`}>
        <Field label="Excerpt (English)">
          <Textarea
            value={form.excerpt}
            onChange={(_, d) => setField('excerpt', d.value)}
            placeholder="Short summary displayed in listing cards"
            rows={3}
          />
        </Field>
        <Field label="Excerpt (Arabic)">
          <Textarea
            value={form.excerptAr}
            dir="rtl"
            onChange={(_, d) => setField('excerptAr', d.value)}
            placeholder="ملخص قصير يظهر في بطاقات القائمة"
            rows={3}
          />
        </Field>
      </div>

      <div className={styles.section}>
        <Field label="Cover Image URL">
          <Input
            value={form.coverImageUrl}
            onChange={(_, d) => setField('coverImageUrl', d.value)}
            placeholder="https://example.com/image.jpg"
            type="url"
          />
        </Field>
        {form.coverImageUrl && (
          <img
            src={form.coverImageUrl}
            alt="Cover image preview"
            className={styles.imagePreview}
          />
        )}
      </div>

      <div className={styles.editorGrid}>
        <div className={styles.editorPane}>
          <Text className={styles.editorLabel}>Body (English)</Text>
          <RichTextEditor
            value={form.bodyHtml}
            onChange={(html) => setField('bodyHtml', html)}
            placeholder="Start writing your English content…"
            dir="ltr"
          />
        </div>
        <div className={styles.editorPane}>
          <Text className={styles.editorLabel}>Body (Arabic)</Text>
          <RichTextEditor
            value={form.bodyHtmlAr}
            onChange={(html) => setField('bodyHtmlAr', html)}
            placeholder="ابدأ كتابة المحتوى العربي…"
            dir="rtl"
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          appearance="secondary"
          icon={<DismissRegular />}
          onClick={() => router.push('/en/admin/cms')}
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          appearance="primary"
          icon={createMutation.isPending ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={handleSaveDraft}
          disabled={createMutation.isPending || !form.title || !form.slug}
        >
          {createMutation.isPending ? 'Saving…' : 'Save as Draft'}
        </Button>
      </div>
    </div>
  );
}
