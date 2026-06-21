'use client';

import React, { use, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Input,
  Textarea,
  MessageBar,
  MessageBarBody,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  LayerRegular,
  ArrowClockwiseRegular,
  StarRegular,
  StarFilled,
  ChevronLeftRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import {
  useComponentDefinition,
  useComponentVersions,
  useSetLatestVersion,
  useDeactivateVersion,
  useCreateVersion,
} from '../../../../../hooks/useComponentRegistry';
import type { CreateVersionPayload } from '../../../../../hooks/useComponentRegistry';
import { COMPONENT_CATEGORIES } from '@portal/types';
import type { ComponentVersionSummary } from '@portal/types';

const COMMAND_BAR_BG  = '#FFFFFF';
const COMMAND_DIVIDER = '#EDEBE9';

interface VersionRow { item: ComponentVersionSummary }

interface AddVersionForm {
  versionNumber: string;
  changeLog: string;
  propsSchema: string;
}

const INITIAL_VERSION_FORM: AddVersionForm = {
  versionNumber: '',
  changeLog: '',
  propsSchema: '',
};

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const PAGE_SIZE = 20;

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

export default function ComponentDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const [skip, setSkip]                               = useState(0);
  const [deactivateTargetVersionId, setDeactivateTargetVersionId] = useState<string | null>(null);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen]       = useState(false);
  const [isAddVersionOpen, setIsAddVersionOpen]                   = useState(false);
  const [versionForm, setVersionForm]                             = useState<AddVersionForm>(INITIAL_VERSION_FORM);
  const [versionErrors, setVersionErrors]                         = useState<Partial<AddVersionForm>>({});

  const { data: definition, isLoading: defLoading, refetch: refetchDef } =
    useComponentDefinition(id);

  const { data: versionsData, isLoading: versLoading, refetch: refetchVersions } =
    useComponentVersions(id, { top: PAGE_SIZE, skip });

  const setLatestMutation       = useSetLatestVersion();
  const deactivateVersionMutation = useDeactivateVersion();
  const createVersionMutation   = useCreateVersion();

  const versions: ComponentVersionSummary[] = versionsData?.items ?? [];

  const columns: TableColumnDefinition<VersionRow>[] = [
    createTableColumn<VersionRow>({
      columnId: 'versionNumber',
      renderHeaderCell: () => 'Version',
      renderCell: ({ item }) => (
        <Text weight="semibold" size={300} style={{ fontFamily: 'monospace' }}>
          {item.versionNumber}
        </Text>
      ),
    }),
    createTableColumn<VersionRow>({
      columnId: 'isLatest',
      renderHeaderCell: () => 'Latest',
      renderCell: ({ item }) =>
        item.isLatest ? (
          <Badge appearance="filled" color="success" size="small">Latest</Badge>
        ) : null,
    }),
    createTableColumn<VersionRow>({
      columnId: 'changeLog',
      renderHeaderCell: () => 'Change Log',
      renderCell: ({ item }) => (
        <Text size={300}>{item.changeLog ?? '—'}</Text>
      ),
    }),
    createTableColumn<VersionRow>({
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
    createTableColumn<VersionRow>({
      columnId: 'actions',
      renderHeaderCell: () => '',
      renderCell: ({ item }) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          {!item.isLatest && (
            <Button
              appearance="subtle"
              icon={<StarRegular />}
              aria-label={`Set ${item.versionNumber} as latest`}
              title="Set as latest"
              onClick={() =>
                setLatestMutation.mutate({ definitionId: id, versionId: item.id })
              }
              disabled={setLatestMutation.isPending}
              size="small"
            />
          )}
          {item.isLatest && (
            <Button
              appearance="subtle"
              icon={<StarFilled style={{ color: '#0078D4' }} />}
              aria-label="Current latest version"
              title="Current latest"
              disabled
              size="small"
            />
          )}
          {!item.isLatest && (
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              aria-label={`Deactivate version ${item.versionNumber}`}
              onClick={() => {
                setDeactivateTargetVersionId(item.id);
                setIsDeactivateDialogOpen(true);
              }}
              size="small"
            />
          )}
        </div>
      ),
    }),
  ];

  function handleConfirmDeactivateVersion() {
    if (!deactivateTargetVersionId) return;
    deactivateVersionMutation.mutate(
      { definitionId: id, versionId: deactivateTargetVersionId },
      {
        onSettled: () => {
          setDeactivateTargetVersionId(null);
          setIsDeactivateDialogOpen(false);
        },
      },
    );
  }

  function validateVersionForm(): Partial<AddVersionForm> {
    const errors: Partial<AddVersionForm> = {};
    if (!versionForm.versionNumber.trim()) {
      errors.versionNumber = 'Version number is required.';
    } else if (!VERSION_PATTERN.test(versionForm.versionNumber.trim())) {
      errors.versionNumber = 'Must be semver format: major.minor.patch (e.g. 1.0.0).';
    }
    if (versionForm.propsSchema.trim()) {
      try {
        JSON.parse(versionForm.propsSchema.trim());
      } catch {
        errors.propsSchema = 'Must be valid JSON or left empty.';
      }
    }
    return errors;
  }

  function handleAddVersionSubmit() {
    const errors = validateVersionForm();
    if (Object.keys(errors).length > 0) {
      setVersionErrors(errors);
      return;
    }
    setVersionErrors({});

    const payload: CreateVersionPayload = {
      definitionId: id,
      body: {
        versionNumber: versionForm.versionNumber.trim(),
        changeLog:     versionForm.changeLog.trim() || null,
        propsSchema:   versionForm.propsSchema.trim() || null,
      },
    };

    createVersionMutation.mutate(payload, {
      onSuccess: () => {
        setIsAddVersionOpen(false);
        setVersionForm(INITIAL_VERSION_FORM);
        void refetchVersions();
      },
    });
  }

  function handleAddVersionClose() {
    if (createVersionMutation.isPending) return;
    setIsAddVersionOpen(false);
    setVersionForm(INITIAL_VERSION_FORM);
    setVersionErrors({});
    createVersionMutation.reset();
  }

  function setVersionField<K extends keyof AddVersionForm>(key: K, value: string) {
    setVersionForm((prev) => ({ ...prev, [key]: value }));
    if (key in versionErrors) {
      setVersionErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
    }
  }

  const categoryLabel =
    definition?.category !== undefined
      ? (COMPONENT_CATEGORIES[definition.category]?.en ?? String(definition.category))
      : '—';

  if (defLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
        <Spinner label="Loading component…" />
      </div>
    );
  }

  if (!definition) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Text size={400} weight="semibold" style={{ color: tokens.colorNeutralForeground3 }}>
          Component not found
        </Text>
      </div>
    );
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
          icon={<ChevronLeftRegular />}
          onClick={() => router.back()}
        >
          Back
        </Button>
        <div style={{ width: '1px', height: '20px', backgroundColor: COMMAND_DIVIDER, margin: '0 4px' }} />
        <Button
          appearance="subtle"
          icon={<AddRegular />}
          style={{ fontWeight: 500 }}
          onClick={() => setIsAddVersionOpen(true)}
        >
          Add Version
        </Button>
        <div style={{ width: '1px', height: '20px', backgroundColor: COMMAND_DIVIDER, margin: '0 4px' }} />
        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={() => { void refetchDef(); void refetchVersions(); }}
        >
          Refresh
        </Button>
      </div>

      {/* Definition Details Header */}
      <div
        style={{
          backgroundColor: COMMAND_BAR_BG,
          borderBottom: `1px solid ${COMMAND_DIVIDER}`,
          padding: '20px 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div
            style={{
              width: '48px', height: '48px', borderRadius: '10px',
              backgroundColor: '#EEF2FC',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <LayerRegular style={{ fontSize: '24px', color: '#0078D4' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#242424', margin: 0 }}>
              {definition.displayName}
            </h1>
            <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#605E5C', marginTop: '2px' }}>
              {definition.name}
            </div>
            {definition.descriptionEn && (
              <div style={{ fontSize: '13px', color: '#605E5C', marginTop: '8px' }}>
                {definition.descriptionEn}
              </div>
            )}
            <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#8A8886', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</span>
                <div style={{ fontSize: '13px', color: '#242424', marginTop: '2px' }}>{categoryLabel}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#8A8886', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Render Targets</span>
                <div style={{ fontSize: '13px', color: '#242424', marginTop: '2px' }}>{definition.renderTargets.join(', ')}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#8A8886', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</span>
                <div style={{ fontSize: '13px', color: definition.isActive ? '#107C10' : '#8A8886', marginTop: '2px', fontWeight: 500 }}>
                  {definition.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Versions Section */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#F3F2F1' }}>
        <div style={{ margin: '16px', backgroundColor: 'white', borderRadius: '4px', border: `1px solid ${COMMAND_DIVIDER}` }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${COMMAND_DIVIDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text weight="semibold" size={400}>Versions</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Text size={200} style={{ color: '#8A8886' }}>
                {versionsData?.total ?? 0} version{(versionsData?.total ?? 0) !== 1 ? 's' : ''}
              </Text>
              <Button
                appearance="subtle"
                icon={<AddRegular />}
                size="small"
                onClick={() => setIsAddVersionOpen(true)}
              >
                Add Version
              </Button>
            </div>
          </div>

          {versLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Spinner label="Loading versions…" />
            </div>
          ) : versions.length === 0 ? (
            <div
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '48px 24px', gap: '12px',
                color: tokens.colorNeutralForeground3,
              }}
            >
              <Text size={400} weight="semibold">No versions yet</Text>
              <Text size={300}>Create the first version to make this component deployable.</Text>
              <Button
                appearance="primary"
                icon={<AddRegular />}
                onClick={() => setIsAddVersionOpen(true)}
              >
                Add Version
              </Button>
            </div>
          ) : (
            <>
              <DataGrid
                items={versions.map((item) => ({ item }))}
                columns={columns}
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
                <DataGridBody<VersionRow>>
                  {({ item, rowId }) => (
                    <DataGridRow<VersionRow>
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

              {(versionsData?.total ?? 0) > PAGE_SIZE && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: `1px solid ${COMMAND_DIVIDER}` }}>
                  <Button appearance="subtle" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))} size="small">
                    Previous
                  </Button>
                  <Text size={300} style={{ lineHeight: '28px' }}>
                    {skip + 1}–{Math.min(skip + PAGE_SIZE, versionsData?.total ?? 0)} of {versionsData?.total ?? 0}
                  </Text>
                  <Button appearance="subtle" disabled={skip + PAGE_SIZE >= (versionsData?.total ?? 0)} onClick={() => setSkip(skip + PAGE_SIZE)} size="small">
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Deactivate Version Dialog */}
      <Dialog open={isDeactivateDialogOpen} onOpenChange={(_, s) => setIsDeactivateDialogOpen(s.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Deactivate Version</DialogTitle>
            <DialogContent>
              This version will be deactivated. You cannot deactivate the current latest version — promote another version first.
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={handleConfirmDeactivateVersion}
                disabled={deactivateVersionMutation.isPending}
              >
                {deactivateVersionMutation.isPending ? 'Deactivating…' : 'Deactivate'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Add Version Panel */}
      <OverlayDrawer
        open={isAddVersionOpen}
        onOpenChange={(_, s) => { if (!s.open) handleAddVersionClose(); }}
        position="end"
        size="small"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                aria-label="Close"
                icon={<DismissRegular />}
                onClick={handleAddVersionClose}
                disabled={createVersionMutation.isPending}
              />
            }
          >
            Add Version
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '20px', paddingBottom: '24px' }}>

          {createVersionMutation.isError && (
            <MessageBar intent="error">
              <MessageBarBody>Failed to create version. Please try again.</MessageBarBody>
            </MessageBar>
          )}

          <Field
            label="Version Number"
            required
            hint="Semver format: major.minor.patch (e.g. 1.0.0)"
            validationMessage={versionErrors.versionNumber}
            validationState={versionErrors.versionNumber ? 'error' : 'none'}
          >
            <Input
              value={versionForm.versionNumber}
              onChange={(_, d) => setVersionField('versionNumber', d.value)}
              placeholder="1.0.0"
              style={{ fontFamily: 'monospace' }}
            />
          </Field>

          <Field label="Change Log">
            <Textarea
              value={versionForm.changeLog}
              onChange={(_, d) => setVersionField('changeLog', d.value)}
              placeholder="What changed in this version…"
              rows={4}
            />
          </Field>

          <Field
            label="Props Schema (JSON)"
            hint="Optional JSON Schema describing the component's configurable props."
            validationMessage={versionErrors.propsSchema}
            validationState={versionErrors.propsSchema ? 'error' : 'none'}
          >
            <Textarea
              value={versionForm.propsSchema}
              onChange={(_, d) => setVersionField('propsSchema', d.value)}
              placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
              rows={6}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Field>

          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
            <Button
              appearance="primary"
              onClick={handleAddVersionSubmit}
              disabled={createVersionMutation.isPending}
            >
              {createVersionMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
            <Button
              appearance="secondary"
              onClick={handleAddVersionClose}
              disabled={createVersionMutation.isPending}
            >
              Cancel
            </Button>
          </div>

        </DrawerBody>
      </OverlayDrawer>

    </div>
  );
}
