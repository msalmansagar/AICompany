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
  Text,
  Spinner,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  Textarea,
  MessageBar,
  MessageBarBody,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  GridRegular,
  ArrowClockwiseRegular,
  EditRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientGet, clientPost, clientPatch, clientDelete } from '../../../../lib/api-client';
import type { WidgetInstanceConfig, WidgetCreate } from '@portal/types';

const COMMAND_BAR_BG  = '#FFFFFF';
const COMMAND_DIVIDER = '#EDEBE9';

interface WidgetRow { item: WidgetInstanceConfig }

interface WidgetFormState {
  widgetType: string;
  title: string;
  displayOrder: string;
  columnSpan: string;
  configJson: string;
}

interface FormErrors {
  widgetType?: string;
  title?: string;
  displayOrder?: string;
  columnSpan?: string;
  configJson?: string;
}

type DrawerMode = 'create' | 'edit';

const INITIAL_FORM: WidgetFormState = {
  widgetType:   '',
  title:        '',
  displayOrder: '0',
  columnSpan:   '4',
  configJson:   '{}',
};

function formFromWidget(w: WidgetInstanceConfig): WidgetFormState {
  return {
    widgetType:   w.widgetType,
    title:        w.title,
    displayOrder: String(w.displayOrder),
    columnSpan:   String(w.columnSpan),
    configJson:   JSON.stringify(w.config, null, 2),
  };
}

export default function AdminWidgetsPage() {
  const queryClient = useQueryClient();

  const [drawerMode, setDrawerMode]         = useState<DrawerMode>('create');
  const [isDrawerOpen, setIsDrawerOpen]     = useState(false);
  const [editTargetId, setEditTargetId]     = useState<string | null>(null);
  const [form, setForm]                     = useState<WidgetFormState>(INITIAL_FORM);
  const [formErrors, setFormErrors]         = useState<FormErrors>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'widgets'],
    queryFn: () => clientGet<{ data: WidgetInstanceConfig[] }>('/api/admin/widgets'),
  });

  const createMutation = useMutation({
    mutationFn: (body: WidgetCreate) => clientPost('/api/admin/widgets', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'widgets'] });
      closeDrawer();
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<WidgetCreate> }) =>
      clientPatch(`/api/admin/widgets/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'widgets'] });
      closeDrawer();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => clientDelete(`/api/admin/widgets/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'widgets'] });
      setDeleteTargetId(null);
      setIsDeleteDialogOpen(false);
    },
  });

  const items: WidgetInstanceConfig[] = data?.data ?? [];
  const rows: WidgetRow[] = items.map((item) => ({ item }));

  const isMutating = createMutation.isPending || patchMutation.isPending;
  const mutationError = createMutation.isError || patchMutation.isError;

  const columns: TableColumnDefinition<WidgetRow>[] = [
    createTableColumn<WidgetRow>({
      columnId: 'widgetType',
      renderHeaderCell: () => 'Widget Type',
      renderCell: ({ item }) => (
        <Text weight="semibold" size={300} style={{ fontFamily: 'monospace' }}>
          {item.widgetType}
        </Text>
      ),
    }),
    createTableColumn<WidgetRow>({
      columnId: 'title',
      renderHeaderCell: () => 'Title',
      renderCell: ({ item }) => <Text size={300}>{item.title}</Text>,
    }),
    createTableColumn<WidgetRow>({
      columnId: 'columnSpan',
      renderHeaderCell: () => 'Column Span',
      renderCell: ({ item }) => <Text size={300}>{item.columnSpan}</Text>,
    }),
    createTableColumn<WidgetRow>({
      columnId: 'displayOrder',
      renderHeaderCell: () => 'Order',
      renderCell: ({ item }) => <Text size={300}>{item.displayOrder}</Text>,
    }),
    createTableColumn<WidgetRow>({
      columnId: 'actions',
      renderHeaderCell: () => '',
      renderCell: ({ item }) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            appearance="subtle"
            icon={<EditRegular />}
            aria-label={`Edit ${item.title}`}
            size="small"
            onClick={() => openEdit(item)}
          />
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            aria-label={`Delete ${item.title}`}
            size="small"
            onClick={() => { setDeleteTargetId(item.id); setIsDeleteDialogOpen(true); }}
          />
        </div>
      ),
    }),
  ];

  function openCreate() {
    setDrawerMode('create');
    setForm(INITIAL_FORM);
    setFormErrors({});
    createMutation.reset();
    setIsDrawerOpen(true);
  }

  function openEdit(widget: WidgetInstanceConfig) {
    setDrawerMode('edit');
    setEditTargetId(widget.id);
    setForm(formFromWidget(widget));
    setFormErrors({});
    patchMutation.reset();
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    if (isMutating) return;
    setIsDrawerOpen(false);
    setEditTargetId(null);
    setFormErrors({});
    createMutation.reset();
    patchMutation.reset();
  }

  function setField<K extends keyof WidgetFormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in formErrors) {
      setFormErrors((prev) => { const next = { ...prev }; delete next[key as keyof FormErrors]; return next; });
    }
  }

  function validateForm(): FormErrors {
    const errors: FormErrors = {};
    if (!form.widgetType.trim()) errors.widgetType = 'Widget type is required.';
    if (!form.title.trim())      errors.title      = 'Title is required.';

    const order = parseInt(form.displayOrder, 10);
    if (isNaN(order) || order < 0) errors.displayOrder = 'Must be a non-negative integer.';

    const span = parseInt(form.columnSpan, 10);
    if (isNaN(span) || span < 1 || span > 12) errors.columnSpan = 'Must be between 1 and 12.';

    try {
      JSON.parse(form.configJson.trim() || '{}');
    } catch {
      errors.configJson = 'Must be valid JSON.';
    }

    return errors;
  }

  function buildPayload(): WidgetCreate {
    return {
      widgetType:   form.widgetType.trim(),
      title:        form.title.trim(),
      displayOrder: parseInt(form.displayOrder, 10),
      columnSpan:   parseInt(form.columnSpan, 10),
      config:       JSON.parse(form.configJson.trim() || '{}') as Record<string, unknown>,
    };
  }

  function handleSubmit() {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});

    if (drawerMode === 'create') {
      createMutation.mutate(buildPayload());
    } else if (editTargetId) {
      patchMutation.mutate({ id: editTargetId, body: buildPayload() });
    }
  }

  function handleConfirmDelete() {
    if (!deleteTargetId) return;
    deleteMutation.mutate(deleteTargetId);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Command Bar */}
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
          style={{ fontWeight: 500 }}
          onClick={openCreate}
        >
          New
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

      {/* Entity Record Header */}
      <div
        style={{
          backgroundColor: COMMAND_BAR_BG,
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
            <GridRegular style={{ fontSize: '22px', color: '#0078D4' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#242424', margin: 0, lineHeight: 1.2 }}>
              Widget Configs
            </h1>
            <div style={{ fontSize: '12px', color: '#8A8886', marginTop: '2px' }}>
              {items.length} widget{items.length !== 1 ? 's' : ''} configured
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#F3F2F1' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <Spinner label="Loading widgets…" />
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '240px', gap: '8px',
              color: tokens.colorNeutralForeground3,
            }}
          >
            <GridRegular style={{ fontSize: '40px', opacity: 0.4 }} />
            <Text size={400} weight="semibold">No widgets configured</Text>
            <Text size={300}>Create your first widget to populate the portal dashboard.</Text>
          </div>
        ) : (
          <div style={{ backgroundColor: 'white' }}>
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
              <DataGridBody<WidgetRow>>
                {({ item, rowId }) => (
                  <DataGridRow<WidgetRow>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={(_, s) => setIsDeleteDialogOpen(s.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Widget</DialogTitle>
            <DialogContent>
              This widget configuration will be permanently deleted. This action cannot be undone.
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

      {/* Create / Edit Widget Panel */}
      <OverlayDrawer
        open={isDrawerOpen}
        onOpenChange={(_, s) => { if (!s.open) closeDrawer(); }}
        position="end"
        size="medium"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                aria-label="Close"
                icon={<DismissRegular />}
                onClick={closeDrawer}
                disabled={isMutating}
              />
            }
          >
            {drawerMode === 'create' ? 'New Widget Config' : 'Edit Widget Config'}
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '20px', paddingBottom: '24px' }}>

          {mutationError && (
            <MessageBar intent="error">
              <MessageBarBody>Failed to save widget. Please try again.</MessageBarBody>
            </MessageBar>
          )}

          <Field
            label="Widget Type"
            required
            hint="Identifier matching a registered widget in the widget registry."
            validationMessage={formErrors.widgetType}
            validationState={formErrors.widgetType ? 'error' : 'none'}
          >
            <Input
              value={form.widgetType}
              onChange={(_, d) => setField('widgetType', d.value)}
              placeholder="e.g. loan-summary, request-tracker"
              style={{ fontFamily: 'monospace' }}
              disabled={drawerMode === 'edit'}
            />
          </Field>

          <Field
            label="Title"
            required
            validationMessage={formErrors.title}
            validationState={formErrors.title ? 'error' : 'none'}
          >
            <Input
              value={form.title}
              onChange={(_, d) => setField('title', d.value)}
              placeholder="e.g. Loan Summary"
            />
          </Field>

          <div style={{ display: 'flex', gap: '16px' }}>
            <Field
              label="Display Order"
              validationMessage={formErrors.displayOrder}
              validationState={formErrors.displayOrder ? 'error' : 'none'}
              style={{ flex: 1 }}
            >
              <Input
                type="number"
                value={form.displayOrder}
                onChange={(_, d) => setField('displayOrder', d.value)}
                min={0}
              />
            </Field>

            <Field
              label="Column Span"
              hint="1–12"
              validationMessage={formErrors.columnSpan}
              validationState={formErrors.columnSpan ? 'error' : 'none'}
              style={{ flex: 1 }}
            >
              <Input
                type="number"
                value={form.columnSpan}
                onChange={(_, d) => setField('columnSpan', d.value)}
                min={1}
                max={12}
              />
            </Field>
          </div>

          <Field
            label="Config (JSON)"
            hint="Widget-specific configuration object."
            validationMessage={formErrors.configJson}
            validationState={formErrors.configJson ? 'error' : 'none'}
          >
            <Textarea
              value={form.configJson}
              onChange={(_, d) => setField('configJson', d.value)}
              rows={8}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Field>

          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
            <Button
              appearance="primary"
              onClick={handleSubmit}
              disabled={isMutating}
            >
              {isMutating ? 'Saving…' : drawerMode === 'create' ? 'Create' : 'Save'}
            </Button>
            <Button
              appearance="secondary"
              onClick={closeDrawer}
              disabled={isMutating}
            >
              Cancel
            </Button>
          </div>

        </DrawerBody>
      </OverlayDrawer>

    </div>
  );
}
