'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Text,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  SaveRegular,
  DismissRegular,
  DocumentTextRegular,
  AddRegular,
} from '@fluentui/react-icons';
import slugify from 'slugify';
import { RichTextEditor } from '../../../../../components/cms/RichTextEditor';
import { useCreateCmsContent } from '../../../../../hooks/useCms';
import type { CmsContentType } from '@portal/types';

const COMMAND_BAR_BG  = '#FFFFFF';
const COMMAND_DIVIDER = '#EDEBE9';
const RECORD_HDR_BG   = '#FFFFFF';
const CONTENT_BG      = '#F3F2F1';

interface CmsFormState {
  slug: string; title: string; titleAr: string;
  contentType: CmsContentType; authorName: string; tagsInput: string;
  metaDescription: string; excerpt: string; excerptAr: string;
  bodyHtml: string; bodyHtmlAr: string; coverImageUrl: string;
}

const INITIAL_STATE: CmsFormState = {
  slug: '', title: '', titleAr: '', contentType: 'news',
  authorName: '', tagsInput: '', metaDescription: '',
  excerpt: '', excerptAr: '', bodyHtml: '', bodyHtmlAr: '', coverImageUrl: '',
};

export default function AdminCmsNewPage() {
  const router = useRouter();
  const createMutation = useCreateCmsContent();

  const [form, setForm]                         = useState<CmsFormState>(INITIAL_STATE);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [errorMessage, setErrorMessage]         = useState<string | null>(null);

  function setField<K extends keyof CmsFormState>(key: K, value: CmsFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value } as CmsFormState));
  }

  function handleTitleChange(value: string) {
    setField('title', value);
    if (!slugManuallyEdited) {
      setField('slug', slugify(value, { lower: true, strict: true, trim: true }));
    }
  }

  function handleSlugChange(value: string) {
    setSlugManuallyEdited(true);
    setField('slug', slugify(value, { lower: true, strict: true, trim: true }));
  }

  const parsedTags = form.tagsInput.split(',').map((t) => t.trim()).filter(Boolean);

  function handleSaveDraft() {
    setErrorMessage(null);
    createMutation.mutate(
      {
        slug: form.slug, title: form.title, titleAr: form.titleAr,
        contentType: form.contentType, bodyHtml: form.bodyHtml, bodyHtmlAr: form.bodyHtmlAr,
        excerpt: form.excerpt, excerptAr: form.excerptAr,
        coverImageUrl: form.coverImageUrl || null,
        authorName: form.authorName, tags: parsedTags, metaDescription: form.metaDescription,
      },
      {
        onSuccess: () => router.push('/en/admin/cms'),
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Failed to save content.';
          setErrorMessage(message);
        },
      },
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── D365 Command Bar ────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: COMMAND_BAR_BG,
          borderBottom: `1px solid ${COMMAND_DIVIDER}`,
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexShrink: 0,
        }}
      >
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={() => router.push('/en/admin/cms')}
        >
          Back
        </Button>
        <div style={{ width: '1px', height: '20px', backgroundColor: COMMAND_DIVIDER, margin: '0 4px' }} />
        <Button
          appearance="subtle"
          icon={createMutation.isPending ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={handleSaveDraft}
          disabled={createMutation.isPending || !form.title || !form.slug}
          style={{ fontWeight: 500 }}
        >
          {createMutation.isPending ? 'Saving…' : 'Save as Draft'}
        </Button>
        <Button
          appearance="subtle"
          icon={<DismissRegular />}
          onClick={() => router.push('/en/admin/cms')}
          disabled={createMutation.isPending}
        >
          Discard
        </Button>
      </div>

      {/* ── D365 Entity Record Header ────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: RECORD_HDR_BG,
          borderBottom: `1px solid ${COMMAND_DIVIDER}`,
          padding: '16px 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px', height: '40px', borderRadius: '8px',
              backgroundColor: '#EEF2FC',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <AddRegular style={{ fontSize: '22px', color: '#0078D4' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#242424', margin: 0 }}>
              {form.title || 'New Content'}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span
                style={{
                  fontSize: '11px', fontWeight: 600, color: '#8A8886',
                  backgroundColor: '#F3F2F1', padding: '2px 8px', borderRadius: '12px',
                }}
              >
                Draft
              </span>
              <span
                style={{
                  fontSize: '11px', color: '#8A8886',
                  backgroundColor: '#F3F2F1', padding: '2px 8px',
                  borderRadius: '12px', fontWeight: 500, textTransform: 'capitalize',
                }}
              >
                {form.contentType}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error Message ────────────────────────────────────────────────────── */}
      {errorMessage && (
        <MessageBar intent="error" style={{ flexShrink: 0 }}>
          <MessageBarBody>{errorMessage}</MessageBarBody>
        </MessageBar>
      )}

      {/* ── Content Area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', backgroundColor: CONTENT_BG }}>
        <div style={{ maxWidth: '1100px' }}>

          <EditorCard title="Details">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
              <Field label="Slug (URL path)" required hint="Auto-generated from title">
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
              <Field label="Author Name" required>
                <Input
                  value={form.authorName}
                  onChange={(_, d) => setField('authorName', d.value)}
                  placeholder="John Smith"
                />
              </Field>
              <Field label="Tags" hint="Separate with commas">
                <Input
                  value={form.tagsInput}
                  onChange={(_, d) => setField('tagsInput', d.value)}
                  placeholder="technology, updates, policy"
                />
              </Field>
            </div>
            {parsedTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                {parsedTags.map((tag) => (
                  <Badge key={tag} appearance="tint" color="brand" size="medium">{tag}</Badge>
                ))}
              </div>
            )}
          </EditorCard>

          <EditorCard title="Cover Image">
            <Field label="Image URL">
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
                alt="Cover preview"
                style={{
                  marginTop: '12px', borderRadius: '6px',
                  maxHeight: '140px', objectFit: 'cover',
                  border: '1px solid #EDEBE9',
                }}
              />
            )}
          </EditorCard>

          <EditorCard title="SEO">
            <Field label="Meta Description" hint="150–160 characters recommended">
              <Textarea
                value={form.metaDescription}
                onChange={(_, d) => setField('metaDescription', d.value)}
                rows={2}
              />
            </Field>
          </EditorCard>

          <EditorCard title="Excerpt">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Field label="Excerpt (English)">
                <Textarea
                  value={form.excerpt}
                  onChange={(_, d) => setField('excerpt', d.value)}
                  placeholder="Short summary for listing cards"
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
          </EditorCard>

          <EditorCard title="Body Content">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <Text
                  size={200}
                  weight="semibold"
                  style={{ display: 'block', marginBottom: '8px', color: '#323130' }}
                >
                  English
                </Text>
                <RichTextEditor
                  value={form.bodyHtml}
                  onChange={(html) => setField('bodyHtml', html)}
                  placeholder="Start writing English content…"
                  dir="ltr"
                />
              </div>
              <div>
                <Text
                  size={200}
                  weight="semibold"
                  style={{ display: 'block', marginBottom: '8px', color: '#323130' }}
                >
                  Arabic (العربية)
                </Text>
                <RichTextEditor
                  value={form.bodyHtmlAr}
                  onChange={(html) => setField('bodyHtmlAr', html)}
                  placeholder="ابدأ كتابة المحتوى العربي…"
                  dir="rtl"
                />
              </div>
            </div>
          </EditorCard>

        </div>
      </div>
    </div>
  );
}

function EditorCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #EDEBE9',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        marginBottom: '16px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid #F0F0F0',
          backgroundColor: '#FAFAFA',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#323130' }}>{title}</span>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}
