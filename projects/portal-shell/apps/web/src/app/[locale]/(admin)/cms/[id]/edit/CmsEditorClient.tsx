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
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  makeStyles,
  tokens,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  SaveRegular,
  PublishRegular,
  HistoryRegular,
} from '@fluentui/react-icons';
import { RichTextEditor } from '../../../../../../components/cms/RichTextEditor';
import { CmsStatusBadge } from '../../../../../../components/cms/CmsStatusBadge';
import {
  useUpdateCmsContent,
  usePublishCmsContent,
  useUnpublishCmsContent,
  useCmsRevisions,
} from '../../../../../../hooks/useCms';
import type { CmsContent, CmsContentType } from '@portal/types';

interface CmsEditorClientProps {
  content: CmsContent;
}

const useStyles = makeStyles({
  page: { maxWidth: '1100px' },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    marginBlockEnd: tokens.spacingVerticalL,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    marginBlockStart: tokens.spacingVerticalXS,
    flexWrap: 'wrap',
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
  section: {
    marginBlockEnd: tokens.spacingVerticalL,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    marginBlockStart: tokens.spacingVerticalXL,
    paddingBlockStart: tokens.spacingVerticalL,
    borderBlockStart: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  revisionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBlock: tokens.spacingVerticalS,
    borderBlockEnd: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  revisionMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
});

interface FormState {
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

function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function CmsEditorClient({ content }: CmsEditorClientProps) {
  const styles = useStyles();
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    slug: content.slug,
    title: content.title,
    titleAr: content.titleAr,
    contentType: content.contentType,
    authorName: content.authorName,
    tagsInput: content.tags.join(', '),
    metaDescription: content.metaDescription,
    excerpt: content.excerpt,
    excerptAr: content.excerptAr,
    bodyHtml: content.bodyHtml,
    bodyHtmlAr: content.bodyHtmlAr,
    coverImageUrl: content.coverImageUrl ?? '',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateMutation = useUpdateCmsContent(content.id);
  const publishMutation = usePublishCmsContent();
  const unpublishMutation = useUnpublishCmsContent();
  const { data: revisionsData } = useCmsRevisions(content.id);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const parsedTags = form.tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  function handleSave() {
    setErrorMessage(null);
    updateMutation.mutate(
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
          const message = err instanceof Error ? err.message : 'Failed to save changes. Please try again.';
          setErrorMessage(message);
        },
      },
    );
  }

  const isPublishPending = publishMutation.isPending || unpublishMutation.isPending;

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
          <Title2 block>Edit Content</Title2>
          <div className={styles.statusRow}>
            <CmsStatusBadge status={content.status} />
            {content.status === 'draft' && (
              <Button
                appearance="primary"
                icon={isPublishPending ? <Spinner size="tiny" /> : <PublishRegular />}
                onClick={() => publishMutation.mutate(content.id)}
                disabled={isPublishPending}
                size="small"
              >
                Publish
              </Button>
            )}
            {content.status === 'published' && (
              <Button
                appearance="secondary"
                icon={isPublishPending ? <Spinner size="tiny" /> : <PublishRegular />}
                onClick={() => unpublishMutation.mutate(content.id)}
                disabled={isPublishPending}
                size="small"
              >
                Unpublish
              </Button>
            )}
          </div>
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
            onChange={(_, d) => setField('title', d.value)}
          />
        </Field>
        <Field label="Title (Arabic)" required>
          <Input
            value={form.titleAr}
            dir="rtl"
            onChange={(_, d) => setField('titleAr', d.value)}
          />
        </Field>
      </div>

      <div className={`${styles.section} ${styles.grid2}`}>
        <Field label="Slug (URL path)" required hint="Lowercase letters, numbers, and hyphens only.">
          <Input
            value={form.slug}
            onChange={(_, d) => setField('slug', d.value)}
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
          />
        </Field>
        <Field label="Tags" hint="Separate multiple tags with commas">
          <Input
            value={form.tagsInput}
            onChange={(_, d) => setField('tagsInput', d.value)}
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
            rows={2}
          />
        </Field>
      </div>

      <div className={`${styles.section} ${styles.grid2}`}>
        <Field label="Excerpt (English)">
          <Textarea
            value={form.excerpt}
            onChange={(_, d) => setField('excerpt', d.value)}
            rows={3}
          />
        </Field>
        <Field label="Excerpt (Arabic)">
          <Textarea
            value={form.excerptAr}
            dir="rtl"
            onChange={(_, d) => setField('excerptAr', d.value)}
            rows={3}
          />
        </Field>
      </div>

      <div className={styles.section}>
        <Field label="Cover Image URL">
          <Input
            value={form.coverImageUrl}
            onChange={(_, d) => setField('coverImageUrl', d.value)}
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
            dir="ltr"
          />
        </div>
        <div className={styles.editorPane}>
          <Text className={styles.editorLabel}>Body (Arabic)</Text>
          <RichTextEditor
            value={form.bodyHtmlAr}
            onChange={(html) => setField('bodyHtmlAr', html)}
            dir="rtl"
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          appearance="secondary"
          onClick={() => router.push('/en/admin/cms')}
          disabled={updateMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          appearance="primary"
          icon={updateMutation.isPending ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={handleSave}
          disabled={updateMutation.isPending || !form.title || !form.slug}
        >
          {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {/* Revision history */}
      <div style={{ marginBlockStart: tokens.spacingVerticalXXL }}>
        <Accordion collapsible>
          <AccordionItem value="revisions">
            <AccordionHeader icon={<HistoryRegular />}>
              Revision History ({revisionsData?.items?.length ?? 0})
            </AccordionHeader>
            <AccordionPanel>
              {revisionsData?.items && revisionsData.items.length > 0 ? (
                revisionsData.items.map((revision) => (
                  <div key={revision.id} className={styles.revisionItem}>
                    <div className={styles.revisionMeta}>
                      <Text size={300} weight="semibold">{revision.savedBy}</Text>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {formatDateTime(revision.savedOn)}
                      </Text>
                    </div>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      #{revision.id.slice(0, 8)}
                    </Text>
                  </div>
                ))
              ) : (
                <Body1 style={{ color: tokens.colorNeutralForeground3 }}>
                  No revision history available.
                </Body1>
              )}
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
