'use client';

import React, { useState } from 'react';
import {
  Title2,
  Body1,
  Button,
  DataGrid,
  DataGridHeader,
  DataGridRow,
  DataGridHeaderCell,
  DataGridBody,
  DataGridCell,
  TableColumnDefinition,
  createTableColumn,
  Badge,
  makeStyles,
  tokens,
  Spinner,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Field,
  Input,
  Select,
  Switch,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular, EditRegular } from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientGet, clientPost, clientPatch, clientDelete } from '../../../../lib/api-client';
import type { NavItem } from '@portal/types';

const useStyles = makeStyles({
  page: { maxWidth: '1000px' },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBlockEnd: tokens.spacingVerticalL,
  },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS },
});

interface NavItemRow {
  item: NavItem;
}

const columns: TableColumnDefinition<NavItemRow>[] = [
  createTableColumn<NavItemRow>({
    columnId: 'label',
    renderHeaderCell: () => 'Label (EN)',
    renderCell: ({ item }) => item.label,
  }),
  createTableColumn<NavItemRow>({
    columnId: 'labelAr',
    renderHeaderCell: () => 'Label (AR)',
    renderCell: ({ item }) => item.labelAr,
  }),
  createTableColumn<NavItemRow>({
    columnId: 'pageCode',
    renderHeaderCell: () => 'Page Code',
    renderCell: ({ item }) => <code>{item.pageCode}</code>,
  }),
  createTableColumn<NavItemRow>({
    columnId: 'order',
    renderHeaderCell: () => 'Order',
    renderCell: ({ item }) => item.displayOrder,
  }),
  createTableColumn<NavItemRow>({
    columnId: 'visible',
    renderHeaderCell: () => 'Visible',
    renderCell: ({ item }) => (
      <Badge appearance="filled" color={item.isVisible ? 'success' : 'subtle'}>
        {item.isVisible ? 'Visible' : 'Hidden'}
      </Badge>
    ),
  }),
];

export default function AdminNavPage() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<NavItem>>({
    label: '',
    labelAr: '',
    pageCode: '',
    icon: 'CircleRegular',
    displayOrder: 1,
    isVisible: true,
    badgeSource: 'none',
    badgeValue: null,
    requiredRole: null,
    parentId: null,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'nav-items'],
    queryFn: () => clientGet<{ items: NavItem[] }>('/api/admin/nav-items'),
  });

  const createMutation = useMutation({
    mutationFn: (body: Partial<NavItem>) => clientPost('/api/admin/nav-items', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'nav-items'] });
      setIsAddOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => clientDelete(`/api/admin/nav-items/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'nav-items'] });
    },
  });

  const items: NavItemRow[] = (data?.items ?? []).map((item) => ({ item }));

  if (isLoading) return <Spinner label="Loading navigation…" />;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div>
          <Title2 block>Navigation Builder</Title2>
          <Body1>Configure the portal navigation menu items.</Body1>
        </div>
        <Dialog open={isAddOpen} onOpenChange={(_, s) => setIsAddOpen(s.open)}>
          <DialogTrigger disableButtonEnhancement>
            <Button appearance="primary" icon={<AddRegular />}>
              Add Item
            </Button>
          </DialogTrigger>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Add Navigation Item</DialogTitle>
              <DialogContent>
                <Field label="Label (English)">
                  <Input
                    value={draft.label ?? ''}
                    onChange={(_, d) => setDraft((p) => ({ ...p, label: d.value }))}
                  />
                </Field>
                <Field label="Label (Arabic)">
                  <Input
                    value={draft.labelAr ?? ''}
                    onChange={(_, d) => setDraft((p) => ({ ...p, labelAr: d.value }))}
                  />
                </Field>
                <Field label="Page Code (URL segment)">
                  <Input
                    value={draft.pageCode ?? ''}
                    onChange={(_, d) => setDraft((p) => ({ ...p, pageCode: d.value }))}
                    placeholder="dashboard"
                  />
                </Field>
                <Field label="Display Order">
                  <Input
                    type="number"
                    value={String(draft.displayOrder ?? 1)}
                    onChange={(_, d) =>
                      setDraft((p) => ({ ...p, displayOrder: parseInt(d.value, 10) || 1 }))
                    }
                  />
                </Field>
                <Field label="Visible">
                  <Switch
                    checked={draft.isVisible ?? true}
                    onChange={(_, d) => setDraft((p) => ({ ...p, isVisible: d.checked }))}
                  />
                </Field>
              </DialogContent>
              <DialogActions>
                <DialogTrigger disableButtonEnhancement>
                  <Button appearance="secondary">Cancel</Button>
                </DialogTrigger>
                <Button
                  appearance="primary"
                  onClick={() => createMutation.mutate(draft)}
                  disabled={createMutation.isPending || !draft.label || !draft.pageCode}
                >
                  {createMutation.isPending ? 'Adding…' : 'Add'}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>

      <DataGrid items={items} columns={columns} sortable getRowId={({ item }) => item.id}>
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell }) => (
              <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
            )}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<NavItemRow>>
          {({ item, rowId }) => (
            <DataGridRow<NavItemRow> key={rowId}>
              {({ renderCell, columnId }) =>
                columnId === 'actions' ? (
                  <DataGridCell>
                    <div className={styles.actions}>
                      <Button
                        appearance="subtle"
                        icon={<DeleteRegular />}
                        aria-label="Delete"
                        onClick={() => deleteMutation.mutate(item.item.id)}
                      />
                    </div>
                  </DataGridCell>
                ) : (
                  <DataGridCell>{renderCell(item)}</DataGridCell>
                )
              }
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}
