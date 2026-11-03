'use client';

import React, { useState } from 'react';
import {
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
  Text,
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
import {
  AddRegular,
  DeleteRegular,
  NavigationRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientGet, clientPost, clientDelete } from '../../../../lib/api-client';
import type { NavItem } from '@portal/types';

const COMMAND_BAR_BG  = '#FFFFFF';
const COMMAND_DIVIDER = '#EDEBE9';
const RECORD_HDR_BG   = '#FFFFFF';
const CONTENT_BG      = '#F3F2F1';

interface NavItemRow { item: NavItem }

const columns: TableColumnDefinition<NavItemRow>[] = [
  createTableColumn<NavItemRow>({
    columnId: 'label',
    renderHeaderCell: () => 'Label (EN)',
    renderCell: ({ item }) => <Text size={300} weight="semibold">{item.label}</Text>,
  }),
  createTableColumn<NavItemRow>({
    columnId: 'labelAr',
    renderHeaderCell: () => 'Label (AR)',
    renderCell: ({ item }) => <Text size={300}>{item.labelAr}</Text>,
  }),
  createTableColumn<NavItemRow>({
    columnId: 'pageCode',
    renderHeaderCell: () => 'Page Code',
    renderCell: ({ item }) => (
      <code style={{ fontSize: '12px', backgroundColor: '#F0F0F0', padding: '2px 6px', borderRadius: '4px' }}>
        {item.pageCode}
      </code>
    ),
  }),
  createTableColumn<NavItemRow>({
    columnId: 'order',
    renderHeaderCell: () => 'Order',
    renderCell: ({ item }) => <Text size={300}>{item.displayOrder}</Text>,
  }),
  createTableColumn<NavItemRow>({
    columnId: 'visible',
    renderHeaderCell: () => 'Visibility',
    renderCell: ({ item }) => (
      <Badge
        appearance="filled"
        color={item.isVisible ? 'success' : 'subtle'}
        size="small"
      >
        {item.isVisible ? 'Visible' : 'Hidden'}
      </Badge>
    ),
  }),
];

export default function AdminNavPage() {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<NavItem>>({
    label: '', labelAr: '', pageCode: '',
    icon: 'CircleRegular', displayOrder: 1,
    isVisible: true, badgeSource: 'none', badgeValue: null,
    requiredRole: null, parentId: null,
  });

  const { data: navResponse, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'nav-items'],
    queryFn: () => clientGet<{ data: NavItem[] }>('/api/admin/nav-items'),
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

  const items: NavItemRow[] = (navResponse?.data ?? []).map((item) => ({ item }));

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
          onClick={() => setIsAddOpen(true)}
          style={{ fontWeight: 500 }}
        >
          New Item
        </Button>
        <div style={{ width: '1px', height: '20px', backgroundColor: COMMAND_DIVIDER, margin: '0 4px' }} />
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
            <NavigationRegular style={{ fontSize: '22px', color: '#0078D4' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#242424', margin: 0, lineHeight: 1.2 }}>
              Navigation Builder
            </h1>
            <div style={{ fontSize: '12px', color: '#8A8886', marginTop: '2px' }}>
              {items.length} item{items.length !== 1 ? 's' : ''} configured
            </div>
          </div>
        </div>
      </div>

      {/* ── Content Area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: CONTENT_BG }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <Spinner label="Loading navigation…" />
          </div>
        ) : (
          <div style={{ backgroundColor: 'white' }}>
            <DataGrid items={items} columns={columns} sortable getRowId={({ item }) => item.id}>
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
              <DataGridBody<NavItemRow>>
                {({ item, rowId }) => (
                  <DataGridRow<NavItemRow>
                    key={rowId}
                    style={{ borderBottom: `1px solid ${COMMAND_DIVIDER}` }}
                  >
                    {({ renderCell, columnId }) =>
                      columnId === 'actions' ? (
                        <DataGridCell>
                          <Button
                            appearance="subtle"
                            icon={<DeleteRegular />}
                            aria-label="Delete"
                            size="small"
                            onClick={() => deleteMutation.mutate(item.item.id)}
                          />
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
        )}
      </div>

      {/* ── Add Navigation Item Dialog ───────────────────────────────────────── */}
      <Dialog open={isAddOpen} onOpenChange={(_, s) => setIsAddOpen(s.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Add Navigation Item</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Field label="Label (English)" required>
                  <Input
                    value={draft.label ?? ''}
                    onChange={(_, d) => setDraft((p) => ({ ...p, label: d.value }))}
                  />
                </Field>
                <Field label="Label (Arabic)" required>
                  <Input
                    value={draft.labelAr ?? ''}
                    dir="rtl"
                    onChange={(_, d) => setDraft((p) => ({ ...p, labelAr: d.value }))}
                  />
                </Field>
                <Field label="Page Code (URL segment)" required hint="Example: dashboard, services">
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
                    style={{ width: '100px' }}
                  />
                </Field>
                <Field label="Visible in navigation">
                  <Switch
                    checked={draft.isVisible ?? true}
                    onChange={(_, d) => setDraft((p) => ({ ...p, isVisible: d.checked }))}
                  />
                </Field>
              </div>
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
                {createMutation.isPending ? 'Adding…' : 'Add Item'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
