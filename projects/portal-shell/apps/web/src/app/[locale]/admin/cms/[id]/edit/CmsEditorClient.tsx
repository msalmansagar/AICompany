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
  Tab,
  TabList,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  tokens,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  SaveRegular,
  ArrowUploadRegular,
  DocumentTextRegular,
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

// ── D365 design tokens ────────────────────────────────────────────────────────
const COMMAND_BAR_BG  = '#FFFFFF';
const COMMAND_DIVIDER = '#EDEBE9';
const RECORD_HDR_BG   = '#FFFFFF';
const CONTENT_BG      = '#F3F2F1';

interface CmsEditorClientProps { content: CmsContent }

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

type EditorTab = 'general' | 'seo' | 'revisions';

function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateString));
}

export function CmsEditorClient({ content }: CmsEditorClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<EditorTab>('general');

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

  const updateMutation    = useUpdateCmsContent(content.id);
  const publishMutation   = usePublishCmsContent();
  const unpublishMutation = useUnpublishCmsContent();
  const { data: revisionsData } = useCmsRevisions(content.id);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value } as FormState));
  }

  const parsedTags = form.tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
  const isPublishPending = publishMutation.isPending || unpublishMutation.isPending;

  function handleSave() {
    setErrorMessage(null);
    updateMutation.mutate(
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
          const message = err instanceof Error ? err.message : 'Failed to save changes.';
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
          icon={updateMutation.isPending ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={handleSave}
          disabled={updateMutation.isPending || !form.title || !form.slug}
          style={{ fontWeight: 500 }}
        >
          {updateMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          appearance="subtle"
          icon={updateMutation.isPending ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={() => { handleSave(); }}
          disabled={updateMutation.isPending || !form.title || !form.slug}
        >
          Save & Close
        </Button>
        <div style={{ width: '1px', height: '20px', backgroundColor: COMMAND_DIVIDER, margin: '0 4px' }} />
        {content.status === 'draft' && (
          <Button
            appearance="subtle"
            icon={isPublishPending ? <Spinner size="tiny" /> : <ArrowUploadRegular />}
            onClick={() => publishMutation.mutate(content.id)}
            disabled={isPublishPending}
          >
            Publish
          </Button>
        )}
        {content.status === 'published' && (
          <Button
            appearance="subtle"
            icon={isPublishPending ? <Spinner size="tiny" /> : <ArrowUploadRegular />}
            onClick={() => unpublishMutation.mutate(content.id)}
            disabled={isPublishPending}
          >
            Unpublish
          </Button>
        )}
      </div>

      {/* ── D365 Entity Record Header ────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: RECORD_HDR_BG,
          borderBottom: `1px solid ${COMMAND_DIVIDER}`,
          padding: '16px 28px 0 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
          <div
            style={{
              width: '40px', height: '40px', borderRadius: '8px',
              backgroundColor: '#EEF2FC', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: '2px',
            }}
          >
            <DocumentTextRegular style={{ fontSize: '22px', color: '#0078D4' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: '20px', fontWeight: 600, color: '#242424',
                margin: 0, lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {form.title || 'Untitled'}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
              <CmsStatusBadge status={content.status} />
              <span
                style={{
                  fontSize: '12px', color: '#8A8886',
                  backgroundColor: '#F3F2F1', padding: '2px 8px',
                  borderRadius: '12px', fontWeight: 500, textTransform: 'capitalize',
                }}
              >
                {form.contentType}
              </span>
              {parsedTags.slice(0, 3).map((tag) => (
                <Badge key={tag} appearance="tint" color="brand" size="small">{tag}</Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, d) => setActiveTab(d.value as EditorTab)}
          size="small"
        >
          <Tab value="general">General</Tab>
          <Tab value="seo">SEO &amp; Meta</Tab>
          <Tab value="revisions">
            Revisions ({revisionsData?.items?.length ?? 0})
          </Tab>
        </TabList>
      </div>

      {/* ── Error Message Bar ────────────────────────────────────────────────── */}
      {errorMessage && (
        <MessageBar intent="error" style={{ flexShrink: 0 }}>
          <MessageBarBody>{errorMessage}</MessageBarBody>
        </MessageBar>
      )}

      {/* ── Content Area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', backgroundColor: CONTENT_BG }}>

        {/* ── General Tab ───────────────────────────────────────────────────── */}
        {activeTab === 'general' && (
          <div style={{ maxWidth: '1100px' }}>

            {/* Core fields */}
            <EditorCard title="Details">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Field label="Title (English)" required>
                  <Input value={form.title} onChange={(_, d) => setField('title', d.value)} />
                </Field>
                <Field label="Title (Arabic)" required>
                  <Input value={form.titleAr} dir="rtl" onChange={(_, d) => setField('titleAr', d.value)} />
                </Field>
                <Field label="Slug (URL path)" required hint="Lowercase, hyphens only">
                  <Input value={form.slug} onChange={(_, d) => setField('slug', d.value)} />
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
                  <Input value={form.authorName} onChange={(_, d) => setField('authorName', d.value)} />
                </Field>
                <Field label="Tags" hint="Comma-separated">
                  <Input
                    value={form.tagsInput}
                    onChange={(_, d) => setField('tagsInput', d.value)}
                    placeholder="technology, policy"
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

            {/* Cover image */}
            <EditorCard title="Cover Image">
              <Field label="Image URL">
                <Input
                  value={form.coverImageUrl}
                  onChange={(_, d) => setField('coverImageUrl', d.value)}
                  type="url"
                  placeholder="https://example.com/image.jpg"
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

            {/* Excerpt */}
            <EditorCard title="Excerpt">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
            </EditorCard>

            {/* Rich text body */}
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
                    dir="rtl"
                  />
                </div>
              </div>
            </EditorCard>
          </div>
        )}

        {/* ── SEO Tab ───────────────────────────────────────────────────────── */}
        {activeTab === 'seo' && (
          <div style={{ maxWidth: '720px' }}>
            <EditorCard title="Search Engine Optimisation">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Field label="Meta Description" hint="Recommended 150–160 characters">
                  <Textarea
                    value={form.metaDescription}
                    onChange={(_, d) => setField('metaDescription', d.value)}
                    rows={3}
                  />
                </Field>
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '6px',
                    border: '1px solid #EDEBE9',
                    backgroundColor: '#FAFAFA',
                  }}
                >
                  <Text size={200} weight="semibold" style={{ color: '#605E5C', display: 'block', marginBottom: '6px' }}>
                    Search Preview
                  </Text>
                  <div style={{ color: '#1a0dab', fontSize: '18px', fontWeight: 400 }}>
                    {form.title || 'Page Title'}
                  </div>
                  <div style={{ color: '#006621', fontSize: '13px' }}>
                    example.com/{form.slug || 'url-slug'}
                  </div>
                  <div style={{ color: '#545454', fontSize: '13px', marginTop: '2px' }}>
                    {form.metaDescription || 'No meta description provided.'}
                  </div>
                </div>
              </div>
            </EditorCard>
          </div>
        )}

        {/* ── Revisions Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'revisions' && (
          <div style={{ maxWidth: '720px' }}>
            <EditorCard title="Revision History">
              {revisionsData?.items && revisionsData.items.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {revisionsData.items.map((revision, idx) => (
                    <div
                      key={revision.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 0',
                        borderBottom: idx < revisionsData.items.length - 1 ? `1px solid ${COMMAND_DIVIDER}` : 'none',
                      }}
                    >
                      <div>
                        <Text size={300} weight="semibold">{revision.savedBy}</Text>
                        <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3 }}>
                          {formatDateTime(revision.savedOn)}
                        </Text>
                      </div>
                      <Text size={200} style={{ color: '#8A8886', fontFamily: 'monospace' }}>
                        #{revision.id.slice(0, 8)}
                      </Text>
                    </div>
                  ))}
                </div>
              ) : (
                <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                  No revision history available.
                </Text>
              )}
            </EditorCard>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Local layout helpers ──────────────────────────────────────────────────────
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
