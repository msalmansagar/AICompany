'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Title2,
  Body1,
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
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  SearchRegular,
  PublishRegular,
} from '@fluentui/react-icons';
import {
  useAdminCmsContent,
  useDeleteCmsContent,
  usePublishCmsContent,
  useUnpublishCmsContent,
} from '../../../../hooks/useCms';
import { CmsStatusBadge } from '../../../../components/cms/CmsStatusBadge';
import type { CmsSummary } from '@portal/types';

const useStyles = makeStyles({
  page: { maxWidth: '1200px' },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBlockEnd: tokens.spacingVerticalL,
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  filters: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  filterField: {
    minWidth: '160px',
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '240px',
    gap: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
});

interface ContentRow {
  item: CmsSummary;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

export default function AdminCmsPage() {
  const styles = useStyles();
  const router = useRouter();

  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data, isLoading } = useAdminCmsContent({
    type: typeFilter || undefined,
    status: statusFilter || undefined,
  });

  const deleteMutation = useDeleteCmsContent();
  const publishMutation = usePublishCmsContent();
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
        <Text weight="semibold" size={300}>
          {item.title}
        </Text>
      ),
    }),
    createTableColumn<ContentRow>({
      columnId: 'type',
      renderHeaderCell: () => 'Type',
      renderCell: ({ item }) => (
        <Text size={300} style={{ textTransform: 'capitalize' }}>
          {item.contentType}
        </Text>
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
      renderHeaderCell: () => 'Actions',
      renderCell: ({ item }) => (
        <div className={styles.actions}>
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
              icon={<PublishRegular />}
              aria-label={`Publish ${item.title}`}
              onClick={() => publishMutation.mutate(item.id)}
              disabled={publishMutation.isPending}
              size="small"
            />
          )}
          {item.status === 'published' && (
            <Button
              appearance="subtle"
              icon={<PublishRegular />}
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
            onClick={() => {
              setDeleteTargetId(item.id);
              setIsDeleteDialogOpen(true);
            }}
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
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div>
          <Title2 block>Content (CMS)</Title2>
          <Body1>Manage blog posts, news articles, announcements, and static pages.</Body1>
        </div>

        <div className={styles.filters}>
          <Input
            className={styles.filterField}
            placeholder="Search…"
            contentBefore={<SearchRegular />}
            value={searchQuery}
            onChange={(_, d) => setSearchQuery(d.value)}
            aria-label="Search content"
          />

          <Select
            className={styles.filterField}
            value={typeFilter}
            onChange={(_, d) => setTypeFilter(d.value)}
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            <option value="blog">Blog</option>
            <option value="news">News</option>
            <option value="announcement">Announcement</option>
            <option value="page">Page</option>
          </Select>

          <Select
            className={styles.filterField}
            value={statusFilter}
            onChange={(_, d) => setStatusFilter(d.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>

          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => router.push('/en/admin/cms/new')}
          >
            New Content
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner label="Loading content…" />
      ) : rows.length === 0 ? (
        <div className={styles.emptyState}>
          <Text size={400} weight="semibold">No content found</Text>
          <Text size={300}>Try adjusting your filters or create new content.</Text>
        </div>
      ) : (
        <DataGrid
          items={rows}
          columns={columns}
          sortable
          getRowId={({ item }) => item.id}
        >
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell }) => (
                <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<ContentRow>>
            {({ item, rowId }) => (
              <DataGridRow<ContentRow> key={rowId}>
                {({ renderCell }) => (
                  <DataGridCell>{renderCell(item)}</DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      )}

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
