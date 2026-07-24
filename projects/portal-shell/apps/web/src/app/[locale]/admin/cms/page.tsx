'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Input,
  Select,
  DataGrid,
  DataGridHeader,
  DataGridRow,
  DataGridHeaderCell,
  DataGridBody,
  DataGridCell,
  TableColumnDefinition,
  createTableColumn,
  Text,
  Spinner,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  SearchRegular,
  ArrowUploadRegular,
  DocumentTextRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons';
import {
  useAdminCmsContent,
  useDeleteCmsContent,
  usePublishCmsContent,
  useUnpublishCmsContent,
} from '../../../../hooks/useCms';
import { CmsStatusBadge } from '../../../../components/cms/CmsStatusBadge';
import type { CmsSummary } from '@portal/types';

// ── D365 design tokens ────────────────────────────────────────────────────────
const COMMAND_BAR_BG   = '#FFFFFF';
const COMMAND_DIVIDER  = '#EDEBE9';
const RECORD_HDR_BG    = '#FFFFFF';
const CONTENT_PADDING  = '24px 28px';

interface ContentRow { item: CmsSummary }

function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(dateString));
}

export default function AdminCmsPage() {
  const router = useRouter();

  const [typeFilter, setTypeFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [deleteTargetId, setDeleteTargetId]   = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data, isLoading, refetch } = useAdminCmsContent({
    ...(typeFilter   ? { type:   typeFilter   } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  });

  const deleteMutation    = useDeleteCmsContent();
  const publishMutation   = usePublishCmsContent();
  const unpublishMutation = useUnpublishCmsContent();

  const allItems: CmsSummary[] = data?.items ?? [];
  const filteredItems = allItems.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.titleAr.includes(q);
  });
  const rows: ContentRow[] = filteredItems.map((item) => ({ item }));

  const columns: TableColumnDefinition<ContentRow>[] = [
    createTableColumn<ContentRow>({
      columnId: 'title',
      renderHeaderCell: () => 'Title',
      renderCell: ({ item }) => (
        <Text weight="semibold" size={300}>{item.title}</Text>
      ),
    }),
    createTableColumn<ContentRow>({
      columnId: 'type',
      renderHeaderCell: () => 'Type',
      renderCell: ({ item }) => (
        <Text size={300} style={{ textTransform: 'capitalize' }}>{item.contentType}</Text>
      ),
    }),
    createTableColumn<ContentRow>({
      columnId: 'status',
      renderHeaderCell: () => 'Status',
      renderCell: ({ item }) => <CmsStatusBadge status={item.status} />,
    }),
    createTableColumn<ContentRow>({
      columnId: 'author',
      renderHeaderCell: () => 'Author',
      renderCell: ({ item }) => <Text size={300}>{item.authorName}</Text>,
    }),
    createTableColumn<ContentRow>({
      columnId: 'publishedOn',
      renderHeaderCell: () => 'Published On',
      renderCell: ({ item }) => <Text size={300}>{formatDate(item.publishedOn)}</Text>,
    }),
    createTableColumn<ContentRow>({
      columnId: 'actions',
      renderHeaderCell: () => '',
      renderCell: ({ item }) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            appearance="subtle"
            icon={<EditRegular />}
            aria-label={`Edit ${item.title}`}
            onClick={() => router.push(`/en/admin/cms/${item.id}/edit`)}
            size="small"
          />
          {item.status === 'draft' && (
            <Button
              appearance="subtle"
              icon={<ArrowUploadRegular />}
              aria-label={`Publish ${item.title}`}
              onClick={() => publishMutation.mutate(item.id)}
              disabled={publishMutation.isPending}
              size="small"
            />
          )}
          {item.status === 'published' && (
            <Button
              appearance="subtle"
              icon={<ArrowUploadRegular />}
              aria-label={`Unpublish ${item.title}`}
              onClick={() => unpublishMutation.mutate(item.id)}
              disabled={unpublishMutation.isPending}
              size="small"
            />
          )}
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            aria-label={`Delete ${item.title}`}
            onClick={() => { setDeleteTargetId(item.id); setIsDeleteDialogOpen(true); }}
            size="small"
          />
        </div>
      ),
    }),
  ];

  function handleConfirmDelete() {
    if (!deleteTargetId) return;
    deleteMutation.mutate(deleteTargetId, {
      onSettled: () => {
        setDeleteTargetId(null);
        setIsDeleteDialogOpen(false);
      },
    });
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
          icon={<AddRegular />}
          onClick={() => router.push('/en/admin/cms/new')}
          style={{ fontWeight: 500 }}
        >
          New
        </Button>
        <div style={{ width: '1px', height: '20px', backgroundColor: COMMAND_DIVIDER, margin: '0 4px' }} />
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          onClick={() => deleteTargetId && setIsDeleteDialogOpen(true)}
          disabled={!deleteTargetId}
        >
          Delete
        </Button>
        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={() => void refetch()}
        >
          Refresh
        </Button>
      </div>

      {/* ── D365 Entity Record Header ────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: RECORD_HDR_BG,
          borderBottom: `1px solid ${COMMAND_DIVIDER}`,
          padding: '16px 28px 0 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div
            style={{
              width: '40px', height: '40px', borderRadius: '8px',
              backgroundColor: '#EEF2FC',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <DocumentTextRegular style={{ fontSize: '22px', color: '#0078D4' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#242424', margin: 0, lineHeight: 1.2 }}>
              Content Management
            </h1>
            <div style={{ fontSize: '12px', color: '#8A8886', marginTop: '2px' }}>
              {filteredItems.length} record{filteredItems.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Filter row — attached to record header bottom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px' }}>
          <Input
            placeholder="Search by title…"
            contentBefore={<SearchRegular />}
            value={searchQuery}
            onChange={(_, d) => setSearchQuery(d.value)}
            aria-label="Search content"
            style={{ width: '220px' }}
            size="small"
          />
          <Select
            value={typeFilter}
            onChange={(_, d) => setTypeFilter(d.value)}
            aria-label="Filter by type"
            size="small"
            style={{ width: '140px' }}
          >
            <option value="">All types</option>
            <option value="blog">Blog</option>
            <option value="news">News</option>
            <option value="announcement">Announcement</option>
            <option value="page">Page</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(_, d) => setStatusFilter(d.value)}
            aria-label="Filter by status"
            size="small"
            style={{ width: '140px' }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
      </div>

      {/* ── Content Area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0', backgroundColor: '#F3F2F1' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <Spinner label="Loading content…" />
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '240px', gap: '8px',
              color: tokens.colorNeutralForeground3,
            }}
          >
            <DocumentTextRegular style={{ fontSize: '40px', opacity: 0.4 }} />
            <Text size={400} weight="semibold">No content found</Text>
            <Text size={300}>Adjust your filters or create new content.</Text>
          </div>
        ) : (
          <div style={{ backgroundColor: 'white', margin: '0' }}>
            <DataGrid
              items={rows}
              columns={columns}
              sortable
              getRowId={({ item }) => item.id}
            >
              <DataGridHeader style={{ backgroundColor: '#F8F8F8', borderBottom: `1px solid ${COMMAND_DIVIDER}` }}>
                <DataGridRow>
                  {({ renderHeaderCell }) => (
                    <DataGridHeaderCell>
                      <Text size={200} weight="semibold" style={{ color: '#605E5C' }}>
                        {renderHeaderCell()}
                      </Text>
                    </DataGridHeaderCell>
                  )}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<ContentRow>>
                {({ item, rowId }) => (
                  <DataGridRow<ContentRow>
                    key={rowId}
                    style={{ borderBottom: `1px solid ${COMMAND_DIVIDER}` }}
                  >
                    {({ renderCell }) => (
                      <DataGridCell>{renderCell(item)}</DataGridCell>
                    )}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>
          </div>
        )}
      </div>

      {/* ── Delete Confirmation Dialog ───────────────────────────────────────── */}
      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(_, s) => setIsDeleteDialogOpen(s.open)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Content</DialogTitle>
            <DialogContent>
              Are you sure you want to delete this content? This action cannot be undone.
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
