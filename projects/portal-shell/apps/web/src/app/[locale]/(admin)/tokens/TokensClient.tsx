'use client';

import React, { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Field,
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
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  ArrowClockwiseRegular,
  ArrowUploadRegular,
  ColorRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import {
  useTokenDefinitions,
  useTokenValues,
  useTokenPreview,
  useCreateTokenDefinition,
  useDeactivateTokenDefinition,
  useCreateTokenValue,
  useDeactivateTokenValue,
  usePublishTokens,
} from '../../../../hooks/useTokens';
import type {
  TokenDefinitionSummary,
  TokenValueSummary,
  TokenDefinitionCreatePayload,
  TokenValueCreatePayload,
} from '../../../../hooks/useTokens';

// ---------------------------------------------------------------------------
// Constants — option set codes from arch Section 6.1
// ---------------------------------------------------------------------------

const TOKEN_TYPE_LABELS: Record<number, string> = {
  860005001: 'color',
  860005002: 'typography-family',
  860005003: 'typography-size',
  860005004: 'typography-weight',
  860005005: 'spacing',
  860005006: 'border-radius',
  860005007: 'shadow',
  860005008: 'direction',
};

const TOKEN_LEVEL_LABELS: Record<number, string> = {
  860005011: 'global',
  860005012: 'render-target',
  860005013: 'category',
  860005014: 'component',
  860005015: 'service',
};

// Level codes that require additional context fields in the value create form
const LEVEL_RENDER_TARGET = 860005012;
const LEVEL_CATEGORY = 860005013;
const LEVEL_COMPONENT = 860005014;
const LEVEL_SERVICE = 860005015;

// D365-aligned design tokens
const COMMAND_BAR_BG = '#FFFFFF';
const COMMAND_DIVIDER = '#EDEBE9';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

function resolveApiErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

// ---------------------------------------------------------------------------
// Sub-component: token type badge
// ---------------------------------------------------------------------------

interface TokenTypeBadgeProps {
  tokenType: number;
}

function TokenTypeBadge({ tokenType }: TokenTypeBadgeProps) {
  const label = TOKEN_TYPE_LABELS[tokenType] ?? `type-${tokenType}`;

  const colorMap: Record<string, 'brand' | 'success' | 'warning' | 'danger' | 'informative' | 'important' | 'severe'> = {
    color: 'brand',
    'typography-family': 'informative',
    'typography-size': 'informative',
    'typography-weight': 'informative',
    spacing: 'success',
    'border-radius': 'warning',
    shadow: 'severe',
    direction: 'important',
  };

  return (
    <Badge appearance="tint" color={colorMap[label] ?? 'brand'} size="small">
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: token value create form (rendered inside a Dialog)
// ---------------------------------------------------------------------------

interface TokenValueCreateFormProps {
  definitionSlug: string;
  onClose: () => void;
}

function TokenValueCreateForm({ definitionSlug, onClose }: TokenValueCreateFormProps) {
  const [level, setLevel] = useState<number>(860005011);
  const [renderTarget, setRenderTarget] = useState<'portal' | 'admin' | 'mobile'>('portal');
  const [category, setCategory] = useState<number>(860005021);
  const [componentSlug, setComponentSlug] = useState('');
  const [serviceSlug, setServiceSlug] = useState('');
  const [locale, setLocale] = useState<'ar' | 'en' | ''>('');
  const [value, setValue] = useState('');

  const createValue = useCreateTokenValue();

  function buildPayload(): TokenValueCreatePayload {
    const base: TokenValueCreatePayload = {
      definitionSlug,
      level,
      value,
    };

    if (locale) base.locale = locale;
    if (level === LEVEL_RENDER_TARGET) base.renderTarget = renderTarget;
    if (level === LEVEL_CATEGORY) { base.renderTarget = renderTarget; base.category = category; }
    if (level === LEVEL_COMPONENT) { base.renderTarget = renderTarget; base.category = category; base.componentSlug = componentSlug; }
    if (level === LEVEL_SERVICE) base.serviceSlug = serviceSlug;

    return base;
  }

  function handleSubmit() {
    createValue.mutate(buildPayload(), {
      onSuccess: () => onClose(),
    });
  }

  return (
    <>
      <Field label="Level" required>
        <Select
          value={String(level)}
          onChange={(_, d) => setLevel(Number(d.value))}
        >
          {Object.entries(TOKEN_LEVEL_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </Select>
      </Field>

      {(level === LEVEL_RENDER_TARGET || level === LEVEL_CATEGORY || level === LEVEL_COMPONENT) && (
        <Field label="Render Target" required>
          <Select
            value={renderTarget}
            onChange={(_, d) => setRenderTarget(d.value as 'portal' | 'admin' | 'mobile')}
          >
            <option value="portal">portal</option>
            <option value="admin">admin</option>
            <option value="mobile">mobile</option>
          </Select>
        </Field>
      )}

      {(level === LEVEL_CATEGORY || level === LEVEL_COMPONENT) && (
        <Field label="Category" required>
          <Select
            value={String(category)}
            onChange={(_, d) => setCategory(Number(d.value))}
          >
            <option value="860005021">widget</option>
            <option value="860005022">form</option>
            <option value="860005023">nav-component</option>
            <option value="860005024">layout</option>
            <option value="860005025">data-display</option>
          </Select>
        </Field>
      )}

      {level === LEVEL_COMPONENT && (
        <Field label="Component Slug" required>
          <Input
            value={componentSlug}
            onChange={(_, d) => setComponentSlug(d.value)}
            placeholder="e.g. hero-banner"
          />
        </Field>
      )}

      {level === LEVEL_SERVICE && (
        <Field label="Service Slug" required>
          <Input
            value={serviceSlug}
            onChange={(_, d) => setServiceSlug(d.value)}
            placeholder="e.g. home-finance"
          />
        </Field>
      )}

      <Field label="Locale">
        <Select value={locale} onChange={(_, d) => setLocale(d.value as 'ar' | 'en' | '')}>
          <option value="">— neutral (all locales) —</option>
          <option value="en">en</option>
          <option value="ar">ar</option>
        </Select>
      </Field>

      <Field label="Value" required>
        <Input
          value={value}
          onChange={(_, d) => setValue(d.value)}
          placeholder="e.g. #1a4d8f or 16px"
        />
      </Field>

      {createValue.isError && (
        <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
          {resolveApiErrorMessage(createValue.error)}
        </Text>
      )}

      <DialogActions>
        <Button appearance="secondary" onClick={onClose}>Cancel</Button>
        <Button
          appearance="primary"
          onClick={handleSubmit}
          disabled={createValue.isPending || !value.trim()}
        >
          {createValue.isPending ? <Spinner size="tiny" /> : 'Create Value'}
        </Button>
      </DialogActions>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: token definition create form (rendered inside a Dialog)
// ---------------------------------------------------------------------------

interface TokenDefinitionCreateFormProps {
  onClose: () => void;
}

function TokenDefinitionCreateForm({ onClose }: TokenDefinitionCreateFormProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tokenType, setTokenType] = useState<number>(860005001);
  const [description, setDescription] = useState('');
  const [defaultValue, setDefaultValue] = useState('');

  const createDefinition = useCreateTokenDefinition();

  function handleSubmit() {
    const payload: TokenDefinitionCreatePayload = {
      name,
      slug,
      tokenType,
      ...(description ? { description } : {}),
      ...(defaultValue ? { defaultValue } : {}),
    };

    createDefinition.mutate(payload, {
      onSuccess: () => onClose(),
    });
  }

  return (
    <>
      <Field label="Display Name" required>
        <Input
          value={name}
          onChange={(_, d) => setName(d.value)}
          placeholder="e.g. Primary Brand Colour"
        />
      </Field>

      <Field label="Slug" required hint="Kebab-case only (a-z, 0-9, -)">
        <Input
          value={slug}
          onChange={(_, d) => setSlug(d.value)}
          placeholder="e.g. color-primary"
        />
      </Field>

      <Field label="Token Type" required>
        <Select
          value={String(tokenType)}
          onChange={(_, d) => setTokenType(Number(d.value))}
        >
          {Object.entries(TOKEN_TYPE_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </Select>
      </Field>

      <Field label="Description">
        <Input
          value={description}
          onChange={(_, d) => setDescription(d.value)}
          placeholder="Purpose of this token"
        />
      </Field>

      <Field label="Default Value" hint="Fallback when no value override exists">
        <Input
          value={defaultValue}
          onChange={(_, d) => setDefaultValue(d.value)}
          placeholder="e.g. #1a4d8f"
        />
      </Field>

      {createDefinition.isError && (
        <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
          {resolveApiErrorMessage(createDefinition.error)}
        </Text>
      )}

      <DialogActions>
        <Button appearance="secondary" onClick={onClose}>Cancel</Button>
        <Button
          appearance="primary"
          onClick={handleSubmit}
          disabled={createDefinition.isPending || !name.trim() || !slug.trim()}
        >
          {createDefinition.isPending ? <Spinner size="tiny" /> : 'Create'}
        </Button>
      </DialogActions>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: token values panel (shown when a definition row is selected)
// ---------------------------------------------------------------------------

interface TokenValuesPanelProps {
  definitionSlug: string;
  definitionName: string;
}

function TokenValuesPanel({ definitionSlug, definitionName }: TokenValuesPanelProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deactivateTargetId, setDeactivateTargetId] = useState<string | null>(null);

  const { data, isLoading } = useTokenValues({ slug: definitionSlug });
  const deactivateValue = useDeactivateTokenValue();

  const values: TokenValueSummary[] = data?.data ?? [];

  const valueColumns: TableColumnDefinition<{ item: TokenValueSummary }>[] = [
    createTableColumn<{ item: TokenValueSummary }>({
      columnId: 'level',
      renderHeaderCell: () => 'Level',
      renderCell: ({ item }) => (
        <Badge appearance="outline" size="small">
          {TOKEN_LEVEL_LABELS[item.level] ?? item.level}
        </Badge>
      ),
    }),
    createTableColumn<{ item: TokenValueSummary }>({
      columnId: 'context',
      renderHeaderCell: () => 'Context',
      renderCell: ({ item }) => {
        const parts = [
          item.renderTarget,
          item.serviceSlug,
          item.componentSlug,
        ].filter(Boolean);
        return <Text size={200}>{parts.join(' / ') || '—'}</Text>;
      },
    }),
    createTableColumn<{ item: TokenValueSummary }>({
      columnId: 'locale',
      renderHeaderCell: () => 'Locale',
      renderCell: ({ item }) => (
        <Text size={200}>{item.locale ?? 'neutral'}</Text>
      ),
    }),
    createTableColumn<{ item: TokenValueSummary }>({
      columnId: 'value',
      renderHeaderCell: () => 'Value',
      renderCell: ({ item }) => (
        <Text size={200} style={{ fontFamily: 'monospace' }}>{item.value}</Text>
      ),
    }),
    createTableColumn<{ item: TokenValueSummary }>({
      columnId: 'publishedOn',
      renderHeaderCell: () => 'Published',
      renderCell: ({ item }) => (
        <Text size={200}>{formatDate(item.publishedOn)}</Text>
      ),
    }),
    createTableColumn<{ item: TokenValueSummary }>({
      columnId: 'actions',
      renderHeaderCell: () => '',
      renderCell: ({ item }) => (
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          size="small"
          aria-label={`Deactivate value ${item.id}`}
          onClick={() => setDeactivateTargetId(item.id)}
        />
      ),
    }),
  ];

  function handleConfirmDeactivate() {
    if (!deactivateTargetId) return;
    deactivateValue.mutate(deactivateTargetId, {
      onSettled: () => setDeactivateTargetId(null),
    });
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${COMMAND_DIVIDER}`,
        backgroundColor: '#FAFAF9',
        padding: '16px 28px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <Text weight="semibold" size={300}>
          Value overrides for: {definitionName}
        </Text>

        <Dialog open={isCreateOpen} onOpenChange={(_, s) => setIsCreateOpen(s.open)}>
          <DialogTrigger disableButtonEnhancement>
            <Button
              appearance="primary"
              icon={<AddRegular />}
              size="small"
              onClick={() => setIsCreateOpen(true)}
            >
              Add Value
            </Button>
          </DialogTrigger>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Add Value Override — {definitionName}</DialogTitle>
              <DialogContent
                style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
                <TokenValueCreateForm
                  definitionSlug={definitionSlug}
                  onClose={() => setIsCreateOpen(false)}
                />
              </DialogContent>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>

      {isLoading ? (
        <Spinner size="small" label="Loading values…" />
      ) : values.length === 0 ? (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          No value overrides. The default value from the definition will be used.
        </Text>
      ) : (
        <DataGrid
          items={values.map((item) => ({ item }))}
          columns={valueColumns}
          getRowId={({ item }) => item.id}
          style={{ backgroundColor: 'white' }}
        >
          <DataGridHeader
            style={{
              backgroundColor: '#F8F8F8',
              borderBottom: `1px solid ${COMMAND_DIVIDER}`,
            }}
          >
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
          <DataGridBody<{ item: TokenValueSummary }>>
            {({ item, rowId }) => (
              <DataGridRow
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
      )}

      <Dialog
        open={deactivateTargetId !== null}
        onOpenChange={(_, s) => { if (!s.open) setDeactivateTargetId(null); }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Deactivate Value Override</DialogTitle>
            <DialogContent>
              This value override will be soft-deleted. The definition default value will be
              used instead until a new override is added. This change enters draft state —
              publish to make it live.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeactivateTargetId(null)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleConfirmDeactivate}
                disabled={deactivateValue.isPending}
              >
                {deactivateValue.isPending ? 'Deactivating…' : 'Deactivate'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: draft preview panel
// ---------------------------------------------------------------------------

function DraftPreviewPanel() {
  const [previewLocale, setPreviewLocale] = useState<'en' | 'ar'>('en');
  const { data, isLoading, refetch } = useTokenPreview({
    renderTarget: 'portal',
    locale: previewLocale,
  });

  const tokenMap: Record<string, string> = data?.data ?? {};
  const entries = Object.entries(tokenMap);

  return (
    <div
      style={{
        borderTop: `1px solid ${COMMAND_DIVIDER}`,
        backgroundColor: '#F3F2F1',
        padding: '16px 28px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <Text weight="semibold" size={300}>Draft Preview</Text>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Select
            value={previewLocale}
            onChange={(_, d) => setPreviewLocale(d.value as 'en' | 'ar')}
            size="small"
            style={{ width: '80px' }}
            aria-label="Preview locale"
          >
            <option value="en">en</option>
            <option value="ar">ar</option>
          </Select>
          <Button
            appearance="subtle"
            icon={<ArrowClockwiseRegular />}
            size="small"
            onClick={() => void refetch()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner size="small" label="Loading preview…" />
      ) : entries.length === 0 ? (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          No token data in draft cache.
        </Text>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '8px',
          }}
        >
          {entries.map(([slug, value]) => (
            <div
              key={slug}
              style={{
                backgroundColor: 'white',
                border: `1px solid ${COMMAND_DIVIDER}`,
                borderRadius: '4px',
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Text size={200} style={{ fontFamily: 'monospace', color: '#605E5C' }}>
                --{slug}
              </Text>
              <Text size={200} style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {value}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

/**
 * TokensClient — interactive admin UI for theme token management.
 *
 * Displays:
 *   1. Token definitions table with inline type badge and selection
 *   2. Value overrides panel for the selected definition
 *   3. Draft preview panel (resolves from draft cache)
 *   4. Publish button with confirmation dialog (ADR-003-002 staging window)
 */
export function TokensClient() {
  const [selectedDefinitionSlug, setSelectedDefinitionSlug] = useState<string | null>(null);
  const [selectedDefinitionName, setSelectedDefinitionName] = useState<string>('');
  const [isCreateDefOpen, setIsCreateDefOpen] = useState(false);
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<'success' | 'error' | null>(null);

  const { data, isLoading, refetch } = useTokenDefinitions({ activeOnly: true });
  const deactivateDefinition = useDeactivateTokenDefinition();
  const publishTokens = usePublishTokens();

  const definitions: TokenDefinitionSummary[] = data?.data ?? [];

  const definitionColumns: TableColumnDefinition<{ item: TokenDefinitionSummary }>[] = [
    createTableColumn<{ item: TokenDefinitionSummary }>({
      columnId: 'name',
      renderHeaderCell: () => 'Name',
      renderCell: ({ item }) => (
        <Text
          weight={selectedDefinitionSlug === item.slug ? 'semibold' : 'regular'}
          size={300}
        >
          {item.name}
        </Text>
      ),
    }),
    createTableColumn<{ item: TokenDefinitionSummary }>({
      columnId: 'slug',
      renderHeaderCell: () => 'Slug',
      renderCell: ({ item }) => (
        <Text size={200} style={{ fontFamily: 'monospace', color: '#605E5C' }}>
          {item.slug}
        </Text>
      ),
    }),
    createTableColumn<{ item: TokenDefinitionSummary }>({
      columnId: 'tokenType',
      renderHeaderCell: () => 'Type',
      renderCell: ({ item }) => <TokenTypeBadge tokenType={item.tokenType} />,
    }),
    createTableColumn<{ item: TokenDefinitionSummary }>({
      columnId: 'defaultValue',
      renderHeaderCell: () => 'Default Value',
      renderCell: ({ item }) => (
        <Text size={200} style={{ fontFamily: 'monospace' }}>
          {item.defaultValue ?? '—'}
        </Text>
      ),
    }),
    createTableColumn<{ item: TokenDefinitionSummary }>({
      columnId: 'modifiedOn',
      renderHeaderCell: () => 'Last Modified',
      renderCell: ({ item }) => (
        <Text size={200}>{formatDate(item.modifiedOn)}</Text>
      ),
    }),
    createTableColumn<{ item: TokenDefinitionSummary }>({
      columnId: 'actions',
      renderHeaderCell: () => '',
      renderCell: ({ item }) => (
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          size="small"
          aria-label={`Deactivate ${item.name}`}
          onClick={(e) => {
            e.stopPropagation();
            deactivateDefinition.mutate(item.slug);
          }}
          disabled={deactivateDefinition.isPending}
        />
      ),
    }),
  ];

  function handlePublishConfirm() {
    publishTokens.mutate(undefined, {
      onSuccess: () => {
        setPublishFeedback('success');
        setIsPublishConfirmOpen(false);
        setTimeout(() => setPublishFeedback(null), 4000);
      },
      onError: () => {
        setPublishFeedback('error');
        setIsPublishConfirmOpen(false);
        setTimeout(() => setPublishFeedback(null), 6000);
      },
    });
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
        <Dialog open={isCreateDefOpen} onOpenChange={(_, s) => setIsCreateDefOpen(s.open)}>
          <DialogTrigger disableButtonEnhancement>
            <Button
              appearance="subtle"
              icon={<AddRegular />}
              onClick={() => setIsCreateDefOpen(true)}
              style={{ fontWeight: 500 }}
            >
              New Definition
            </Button>
          </DialogTrigger>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Create Token Definition</DialogTitle>
              <DialogContent
                style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
                <TokenDefinitionCreateForm
                  onClose={() => setIsCreateDefOpen(false)}
                />
              </DialogContent>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <div
          style={{
            width: '1px',
            height: '20px',
            backgroundColor: COMMAND_DIVIDER,
            margin: '0 4px',
          }}
        />

        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={() => void refetch()}
        >
          Refresh
        </Button>

        <div style={{ flex: 1 }} />

        {/* Publish button — right-aligned in command bar */}
        <Dialog
          open={isPublishConfirmOpen}
          onOpenChange={(_, s) => setIsPublishConfirmOpen(s.open)}
        >
          <DialogTrigger disableButtonEnhancement>
            <Button
              appearance="primary"
              icon={<ArrowUploadRegular />}
              onClick={() => setIsPublishConfirmOpen(true)}
            >
              Publish
            </Button>
          </DialogTrigger>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Publish Token Changes</DialogTitle>
              <DialogContent>
                Publishing will update the live portal for <strong>all users</strong>. Draft
                token values will replace the currently live values immediately. This action
                cannot be undone — confirm you have reviewed the draft preview before
                publishing.
              </DialogContent>
              <DialogActions>
                <Button
                  appearance="secondary"
                  onClick={() => setIsPublishConfirmOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  appearance="primary"
                  onClick={handlePublishConfirm}
                  disabled={publishTokens.isPending}
                  icon={publishTokens.isPending ? <Spinner size="tiny" /> : undefined}
                >
                  {publishTokens.isPending ? 'Publishing…' : 'Confirm Publish'}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>

      {/* Page header */}
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
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#EEF2FC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ColorRegular style={{ fontSize: '22px', color: '#0078D4' }} />
          </div>
          <div>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#242424',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Theme Tokens
            </h1>
            <div style={{ fontSize: '12px', color: '#8A8886', marginTop: '2px' }}>
              {definitions.length} active definition{definitions.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Publish feedback banners */}
        {publishFeedback === 'success' && (
          <div
            role="status"
            style={{
              marginTop: '12px',
              padding: '8px 12px',
              backgroundColor: '#DFF6DD',
              border: '1px solid #107C10',
              borderRadius: '4px',
              color: '#107C10',
              fontSize: '13px',
            }}
          >
            Tokens published successfully. The live portal has been updated.
          </div>
        )}
        {publishFeedback === 'error' && (
          <div
            role="alert"
            style={{
              marginTop: '12px',
              padding: '8px 12px',
              backgroundColor: '#FDE7E9',
              border: '1px solid #A4262C',
              borderRadius: '4px',
              color: '#A4262C',
              fontSize: '13px',
            }}
          >
            {resolveApiErrorMessage(publishTokens.error)} — the live portal was not updated.
          </div>
        )}
      </div>

      {/* Definitions table */}
      <div
        style={{
          flex: 'none',
          overflowY: 'auto',
          maxHeight: '40vh',
          backgroundColor: '#F3F2F1',
        }}
      >
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '160px',
            }}
          >
            <Spinner label="Loading definitions…" />
          </div>
        ) : definitions.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '160px',
              gap: '8px',
              color: tokens.colorNeutralForeground3,
            }}
          >
            <SettingsRegular style={{ fontSize: '40px', opacity: 0.4 }} />
            <Text size={400} weight="semibold">No token definitions</Text>
            <Text size={300}>Create a definition to get started.</Text>
          </div>
        ) : (
          <div style={{ backgroundColor: 'white' }}>
            <DataGrid
              items={definitions.map((item) => ({ item }))}
              columns={definitionColumns}
              sortable
              getRowId={({ item }) => item.id}
            >
              <DataGridHeader
                style={{
                  backgroundColor: '#F8F8F8',
                  borderBottom: `1px solid ${COMMAND_DIVIDER}`,
                }}
              >
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
              <DataGridBody<{ item: TokenDefinitionSummary }>>
                {({ item, rowId }) => (
                  <DataGridRow<{ item: TokenDefinitionSummary }>
                    key={rowId}
                    style={{
                      borderBottom: `1px solid ${COMMAND_DIVIDER}`,
                      cursor: 'pointer',
                      backgroundColor:
                        selectedDefinitionSlug === item.item.slug
                          ? tokens.colorNeutralBackground1Selected
                          : undefined,
                    }}
                    onClick={() => {
                      setSelectedDefinitionSlug(item.item.slug);
                      setSelectedDefinitionName(item.item.name);
                    }}
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

      {/* Value overrides panel — visible only when a definition is selected */}
      {selectedDefinitionSlug && (
        <TokenValuesPanel
          definitionSlug={selectedDefinitionSlug}
          definitionName={selectedDefinitionName}
        />
      )}

      {/* Draft preview panel */}
      <DraftPreviewPanel />
    </div>
  );
}
