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
  Badge,
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
  Textarea,
  MessageBar,
  MessageBarBody,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  SearchRegular,
  LayerRegular,
  ArrowClockwiseRegular,
  ChevronRightRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import {
  useComponentDefinitions,
  useDeactivateDefinition,
  useCreateDefinition,
} from '../../../../hooks/useComponentRegistry';
import type { CreateDefinitionPayload } from '../../../../hooks/useComponentRegistry';
import { COMPONENT_CATEGORIES } from '@portal/types';
import type { ComponentDefinitionSummary } from '@portal/types';

const COMMAND_BAR_BG  = '#FFFFFF';
const COMMAND_DIVIDER = '#EDEBE9';
const SLUG_PATTERN    = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

interface DefinitionRow { item: ComponentDefinitionSummary }

interface CreateFormState {
  name: string;
  displayName: string;
  displayNameAr: string;
  category: string;
  renderTargetsInput: string;
  descriptionEn: string;
  descriptionAr: string;
}

interface FormErrors {
  name?: string;
  displayName?: string;
  category?: string;
}

const INITIAL_FORM: CreateFormState = {
  name: '',
  displayName: '',
  displayNameAr: '',
  category: '',
  renderTargetsInput: '',
  descriptionEn: '',
  descriptionAr: '',
};

function CategoryBadge({ category }: { category: number }) {
  const label = COMPONENT_CATEGORIES[category]?.en ?? String(category);
  return (
    <Badge appearance="tint" color="informative" size="small">
      {label}
    </Badge>
  );
}

const PAGE_SIZE = 20;

export default function ComponentRegistryPage() {
  const router = useRouter();

  const [categoryFilter, setCategoryFilter] = useState<number | undefined>();
  const [searchQuery, setSearchQuery]       = useState('');
  const [skip, setSkip]                     = useState(0);
  const [deactivateTargetId, setDeactivateTargetId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen]     = useState(false);
  const [isCreateOpen, setIsCreateOpen]     = useState(false);
  const [createForm, setCreateForm]         = useState<CreateFormState>(INITIAL_FORM);
  const [formErrors, setFormErrors]         = useState<FormErrors>({});

  const { data, isLoading, refetch } = useComponentDefinitions({
    ...(categoryFilter !== undefined ? { category: categoryFilter } : {}),
    top: PAGE_SIZE,
    skip,
  });

  const deactivateMutation = useDeactivateDefinition();
  const createMutation     = useCreateDefinition();

  const allItems: ComponentDefinitionSummary[] = data?.items ?? [];
  const filteredItems = allItems.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.displayName.toLowerCase().includes(q)
    );
  });
  const rows: DefinitionRow[] = filteredItems.map((item) => ({ item }));

  const columns: TableColumnDefinition<DefinitionRow>[] = [
    createTableColumn<DefinitionRow>({
      columnId: 'name',
      renderHeaderCell: () => 'Slug',
      renderCell: ({ item }) => (
        <Text weight="semibold" size={300} style={{ fontFamily: 'monospace' }}>
          {item.name}
        </Text>
      ),
    }),
    createTableColumn<DefinitionRow>({
      columnId: 'displayName',
      renderHeaderCell: () => 'Display Name',
      renderCell: ({ item }) => <Text size={300}>{item.displayName}</Text>,
    }),
    createTableColumn<DefinitionRow>({
      columnId: 'category',
      renderHeaderCell: () => 'Category',
      renderCell: ({ item }) => <CategoryBadge category={item.category} />,
    }),
    createTableColumn<DefinitionRow>({
      columnId: 'renderTargets',
      renderHeaderCell: () => 'Render Targets',
      renderCell: ({ item }) => (
        <Text size={300}>{item.renderTargets.join(', ')}</Text>
      ),
    }),
    createTableColumn<DefinitionRow>({
      columnId: 'createdOn',
      renderHeaderCell: () => 'Created On',
      renderCell: ({ item }) => (
        <Text size={300}>
          {new Intl.DateTimeFormat('en-GB', {
            year: 'numeric', month: 'short', day: 'numeric',
          }).format(new Date(item.createdOn))}
        </Text>
      ),
    }),
    createTableColumn<DefinitionRow>({
      columnId: 'actions',
      renderHeaderCell: () => '',
      renderCell: ({ item }) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            appearance="subtle"
            icon={<ChevronRightRegular />}
            aria-label={`View ${item.name}`}
            onClick={() => router.push(`/en/admin/components/${item.id}`)}
            size="small"
          />
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            aria-label={`Deactivate ${item.name}`}
            onClick={() => { setDeactivateTargetId(item.id); setIsDialogOpen(true); }}
            size="small"
          />
        </div>
      ),
    }),
  ];

  function handleConfirmDeactivate() {
    if (!deactivateTargetId) return;
    deactivateMutation.mutate(deactivateTargetId, {
      onSettled: () => {
        setDeactivateTargetId(null);
        setIsDialogOpen(false);
      },
    });
  }

  function validateForm(): FormErrors {
    const errors: FormErrors = {};
    if (!createForm.name.trim()) {
      errors.name = 'Slug is required.';
    } else if (!SLUG_PATTERN.test(createForm.name.trim())) {
      errors.name = 'Slug must be lowercase letters, numbers, and hyphens only.';
    }
    if (!createForm.displayName.trim()) {
      errors.displayName = 'Display name is required.';
    }
    if (!createForm.category) {
      errors.category = 'Category is required.';
    }
    return errors;
  }

  function handleCreateSubmit() {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    const payload: CreateDefinitionPayload = {
      name:          createForm.name.trim(),
      displayName:   createForm.displayName.trim(),
      displayNameAr: createForm.displayNameAr.trim() || null,
      category:      Number(createForm.category),
      renderTargets: createForm.renderTargetsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      descriptionEn: createForm.descriptionEn.trim() || null,
      descriptionAr: createForm.descriptionAr.trim() || null,
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setCreateForm(INITIAL_FORM);
      },
    });
  }

  function handleCreateClose() {
    if (createMutation.isPending) return;
    setIsCreateOpen(false);
    setCreateForm(INITIAL_FORM);
    setFormErrors({});
    createMutation.reset();
  }

  function setField<K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
    if (key in formErrors) {
      setFormErrors((prev) => { const next = { ...prev }; delete next[key as keyof FormErrors]; return next; });
    }
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
          onClick={() => setIsCreateOpen(true)}
        >
          New
        </Button>
        <div style={{ width: '1px', height: '20px', backgroundColor: COMMAND_DIVIDER, margin: '0 4px' }} />
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          onClick={() => deactivateTargetId && setIsDialogOpen(true)}
          disabled={!deactivateTargetId}
        >
          Deactivate
        </Button>
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
            <LayerRegular style={{ fontSize: '22px', color: '#0078D4' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#242424', margin: 0, lineHeight: 1.2 }}>
              Component Registry
            </h1>
            <div style={{ fontSize: '12px', color: '#8A8886', marginTop: '2px' }}>
              {data?.total ?? 0} component definition{(data?.total ?? 0) !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px' }}>
          <Input
            placeholder="Search by name…"
            contentBefore={<SearchRegular />}
            value={searchQuery}
            onChange={(_, d) => setSearchQuery(d.value)}
            aria-label="Search components"
            style={{ width: '220px' }}
            size="small"
          />
          <Select
            value={categoryFilter !== undefined ? String(categoryFilter) : ''}
            onChange={(_, d) => setCategoryFilter(d.value ? Number(d.value) : undefined)}
            aria-label="Filter by category"
            size="small"
            style={{ width: '180px' }}
          >
            <option value="">All categories</option>
            {Object.entries(COMPONENT_CATEGORIES).map(([code, labels]) => (
              <option key={code} value={code}>{labels.en}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#F3F2F1' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <Spinner label="Loading components…" />
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '240px', gap: '8px',
              color: tokens.colorNeutralForeground3,
            }}
          >
            <LayerRegular style={{ fontSize: '40px', opacity: 0.4 }} />
            <Text size={400} weight="semibold">No components found</Text>
            <Text size={300}>Adjust your filters or create a new component definition.</Text>
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
              <DataGridBody<DefinitionRow>>
                {({ item, rowId }) => (
                  <DataGridRow<DefinitionRow>
                    key={rowId}
                    style={{ borderBottom: `1px solid ${COMMAND_DIVIDER}`, cursor: 'pointer' }}
                    onClick={() => router.push(`/en/admin/components/${item.item.id}`)}
                  >
                    {({ renderCell }) => (
                      <DataGridCell>{renderCell(item)}</DataGridCell>
                    )}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>

            {/* Pagination */}
            {(data?.total ?? 0) > PAGE_SIZE && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: `1px solid ${COMMAND_DIVIDER}` }}>
                <Button
                  appearance="subtle"
                  disabled={skip === 0}
                  onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
                  size="small"
                >
                  Previous
                </Button>
                <Text size={300} style={{ lineHeight: '28px' }}>
                  {skip + 1}–{Math.min(skip + PAGE_SIZE, data?.total ?? 0)} of {data?.total ?? 0}
                </Text>
                <Button
                  appearance="subtle"
                  disabled={skip + PAGE_SIZE >= (data?.total ?? 0)}
                  onClick={() => setSkip(skip + PAGE_SIZE)}
                  size="small"
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deactivate Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(_, s) => setIsDialogOpen(s.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Deactivate Component</DialogTitle>
            <DialogContent>
              This component definition will be deactivated. All active versions must be deactivated first. This action can be undone by re-activating the record.
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={handleConfirmDeactivate}
                disabled={deactivateMutation.isPending}
              >
                {deactivateMutation.isPending ? 'Deactivating…' : 'Deactivate'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Create Component Definition Panel */}
      <OverlayDrawer
        open={isCreateOpen}
        onOpenChange={(_, s) => { if (!s.open) handleCreateClose(); }}
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
                onClick={handleCreateClose}
                disabled={createMutation.isPending}
              />
            }
          >
            New Component Definition
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '20px', paddingBottom: '24px' }}>

          {createMutation.isError && (
            <MessageBar intent="error">
              <MessageBarBody>
                Failed to create component definition. Please try again.
              </MessageBarBody>
            </MessageBar>
          )}

          {/* Slug */}
          <Field
            label="Slug"
            required
            hint="Lowercase letters, numbers, and hyphens only. Cannot be changed after creation."
            validationMessage={formErrors.name}
            validationState={formErrors.name ? 'error' : 'none'}
          >
            <Input
              value={createForm.name}
              onChange={(_, d) => setField('name', d.value)}
              placeholder="e.g. loan-summary-widget"
              style={{ fontFamily: 'monospace' }}
            />
          </Field>

          {/* Display Name (English) */}
          <Field
            label="Display Name (English)"
            required
            validationMessage={formErrors.displayName}
            validationState={formErrors.displayName ? 'error' : 'none'}
          >
            <Input
              value={createForm.displayName}
              onChange={(_, d) => setField('displayName', d.value)}
              placeholder="e.g. Loan Summary Widget"
            />
          </Field>

          {/* Display Name (Arabic) */}
          <Field label="Display Name (Arabic)">
            <Input
              value={createForm.displayNameAr}
              onChange={(_, d) => setField('displayNameAr', d.value)}
              placeholder="e.g. عنصر ملخص القرض"
              dir="rtl"
            />
          </Field>

          {/* Category */}
          <Field
            label="Category"
            required
            validationMessage={formErrors.category}
            validationState={formErrors.category ? 'error' : 'none'}
          >
            <Select
              value={createForm.category}
              onChange={(_, d) => setField('category', d.value)}
            >
              <option value="">Select a category…</option>
              {Object.entries(COMPONENT_CATEGORIES).map(([code, labels]) => (
                <option key={code} value={code}>{labels.en}</option>
              ))}
            </Select>
          </Field>

          {/* Render Targets */}
          <Field
            label="Render Targets"
            hint="Comma-separated list of surfaces where this component can render (e.g. portal, dashboard, mobile)."
          >
            <Input
              value={createForm.renderTargetsInput}
              onChange={(_, d) => setField('renderTargetsInput', d.value)}
              placeholder="portal, dashboard, mobile"
            />
          </Field>

          {/* Description (English) */}
          <Field label="Description (English)">
            <Textarea
              value={createForm.descriptionEn}
              onChange={(_, d) => setField('descriptionEn', d.value)}
              placeholder="Brief description of what this component does…"
              rows={3}
            />
          </Field>

          {/* Description (Arabic) */}
          <Field label="Description (Arabic)">
            <Textarea
              value={createForm.descriptionAr}
              onChange={(_, d) => setField('descriptionAr', d.value)}
              placeholder="وصف مختصر لما يفعله هذا المكوّن…"
              dir="rtl"
              rows={3}
            />
          </Field>

          {/* Footer Actions */}
          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
            <Button
              appearance="primary"
              onClick={handleCreateSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
            <Button
              appearance="secondary"
              onClick={handleCreateClose}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
          </div>

        </DrawerBody>
      </OverlayDrawer>

    </div>
  );
}
