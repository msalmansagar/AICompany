import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fingerprintQuery, renderTemplate, selectableTemplates,
  type CommunicationTemplate, type TemplateChannel, type TemplateLanguage,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { Card, EmptyState, InfoBanner, StatusPill, formatCount, formatDate } from '../components/primitives.js';
import { Dialog, SelectField, TextAreaField, TextField } from '../components/forms.js';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import { createCaseQuery, LABELS, type CaseQuery, type CaseRow } from '../data/collectionQueries.js';
import {
  countPopulation, createRunQuery, resolvePopulation, type RunQuery, type RunRow,
} from '../data/communicationRunQueries.js';
import { loadTemplateCatalogue } from '../data/templateQueries.js';
import { BULK_CHANNELS, createBulkService } from '../services/bulkRunDriver.js';
import type { RunStatus } from '../services/bulkCommunicationService.js';
import { useCrmSession, useOrg } from '../shell/context.js';
import { BulkRunDetailView } from './BulkRunDetail.js';

/**
 * Bulk SMS and Bulk Email, for the officer who sends them.
 *
 * The screen is built on the executor Phase 7 proved live, and adds nothing to it. What it adds is
 * the part an engine cannot have: a way to decide **who**, agree **what**, and then watch it happen.
 *
 * Two properties are stated on the screen rather than left to be discovered.
 *
 * **The population and the wording freeze at confirmation.** After that the run sends what was
 * agreed, to who was agreed, however long it takes and however many times it is resumed. Narrowing
 * the filter afterwards changes nothing, which is the behaviour an officer must be able to rely on.
 *
 * **Every recipient gets the same message.** The frozen body is one piece of text. A template whose
 * placeholders vary per customer cannot be used for bulk, so any placeholder is filled once, by the
 * officer, and the preview is exactly what every recipient receives.
 *
 * Bulk WhatsApp is out of scope and is not offered. Warning Letters are out of scope entirely.
 */

const LANGUAGES: readonly { value: TemplateLanguage; label: string }[] = [
  { value: 'English', label: 'English' },
  { value: 'Arabic', label: 'العربية' },
];

const RUN_STATUSES: readonly RunStatus[] = [
  'Draft', 'Running', 'Paused', 'Completed', 'Cancelled', 'Failed',
];

/**
 * The preview is displayed, never typed into.
 *
 * Bulk wording comes from an approved template and is frozen at confirmation, so there is no edit
 * for this handler to accept. It exists because the field component requires one, and it does
 * nothing on purpose rather than by omission.
 */
const NO_EDIT = (): void => undefined;

export function BulkCommunicationView({ runId, onOpenRun, onCloseRun }: {
  runId?: string | undefined;
  onOpenRun: (runId: string) => void;
  onCloseRun: () => void;
}) {
  if (runId) return <BulkRunDetailView runId={runId} onBack={onCloseRun} />;

  return (
    <div data-testid="bulk-communication">
      <InfoBanner>
        A bulk run creates <b>one message per recipient</b> for QDB&rsquo;s own mechanism to deliver.
        The recipients and the wording are fixed when you confirm, and cannot change afterwards.
      </InfoBanner>
      <NewRunPanel onCreated={onOpenRun} />
      <RunsPanel onOpenRun={onOpenRun} />
    </div>
  );
}

// ── The runs that already exist ──────────────────────────────────────────────

const RUN_COLUMNS: readonly DataGridColumn<RunRow>[] = [
  { key: 'name', header: 'Run', render: row => row.name },
  { key: 'channel', header: 'Channel', width: '90px', render: row => row.channel },
  { key: 'status', header: 'Status', width: '120px', render: row => <StatusPill status={row.status} /> },
  { key: 'target', header: 'Target', width: '90px', numeric: true, render: row => formatCount(row.total) },
  { key: 'processed', header: 'Processed', width: '110px', numeric: true, render: row => formatCount(row.processed) },
  { key: 'created', header: 'Created', width: '170px', render: row => formatDate(row.createdOn) },
];

/**
 * The run list.
 *
 * Server-paged through the same grid every large list uses, and filtered by the source rather than
 * by hiding rows already fetched. It selects the narrow column set on purpose: a run's frozen
 * population is a memo column holding one line per recipient, and putting it in a grid would pull
 * every population on the page into the browser at once.
 */
function RunsPanel({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const { adapter } = useCrmSession();
  const [status, setStatus] = useState<RunStatus | ''>('');
  const fetchPage = useMemo(() => createRunQuery(adapter), [adapter]);
  const query = useMemo<RunQuery>(() => (status ? { status } : {}), [status]);

  return (
    <Card title="Bulk runs" subtitle="Open a run to see where it reached, resume it, or stop it.">
      <div className="action-row">
        <label>
          Status
          <select
            className="fluent-select" value={status} data-testid="bulk-run-status-filter"
            onChange={event => setStatus(event.target.value as RunStatus | '')}
          >
            <option value="">All</option>
            {RUN_STATUSES.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <DataGrid<RunRow, RunQuery>
        columns={RUN_COLUMNS}
        fetchPage={fetchPage}
        query={query}
        rowKey={row => row.id}
        pageSize={50}
        height={300}
        emptyMessage="No bulk run has been created yet."
        onRowClick={(row: RunRow) => onOpenRun(row.id)}
        data-testid="bulk-runs-grid"
      />
    </Card>
  );
}

// ── Starting a run ───────────────────────────────────────────────────────────

type SelectionMode = 'SelectedRecords' | 'FilterDefinition';

interface Composition {
  channel: Extract<TemplateChannel, 'SMS' | 'Email'>;
  language: TemplateLanguage;
  templateId: string;
  values: Record<string, string>;
}

const INITIAL_COMPOSITION: Composition = {
  channel: 'SMS', language: 'English', templateId: '', values: {},
};

function NewRunPanel({ onCreated }: { onCreated: (runId: string) => void }) {
  const { scopeFilter } = useOrg();
  const [mode, setMode] = useState<SelectionMode>('FilterDefinition');
  const [bucket, setBucket] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlyMap<string, string>>(new Map());
  const [composition, setComposition] = useState<Composition>(INITIAL_COMPOSITION);
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const population = useMemo<CaseQuery>(() => ({
    ...(scopeFilter !== undefined ? { scopeFilter } : {}),
    ...(bucket ? { bucket } : {}),
    ...(search ? { search } : {}),
    openOnly: true,
  }), [scopeFilter, bucket, search]);

  const target = usePopulationCount(population, mode, selected.size);
  const offered = useOfferedTemplates(composition);
  const template = offered.find(candidate => candidate.id === composition.templateId) ?? null;
  const rendered = template ? renderTemplate(template, composition.values) : null;
  const unresolved = rendered && !rendered.rendered ? rendered.unresolved : [];
  const ready = Boolean(rendered?.rendered) && target !== null && target > 0;

  return (
    <Card
      title="New bulk run"
      subtitle="Choose who it goes to, agree the wording, then confirm. Both are fixed from that moment."
    >
      <PopulationChooser
        filters={{ mode, bucket, search }}
        onFiltersChange={next => { setMode(next.mode); setBucket(next.bucket); setSearch(next.search); }}
        population={population} selected={selected} onSelectedChange={setSelected}
      />

      <ComposerFields
        composition={composition} template={template} offered={offered} onChange={setComposition}
        preview={rendered?.rendered ? rendered.body : template?.body ?? ''}
      />

      {unresolved.length > 0 && (
        <p className="field-error" data-testid="bulk-unresolved">
          This message still needs {unresolved.join(', ')}. Every recipient receives the same wording,
          so it has to be complete before a run can start.
        </p>
      )}
      {refusal && <p className="field-error" data-testid="bulk-refusal">{refusal}</p>}

      <div className="action-row">
        <span className="hint" data-testid="bulk-target-count">
          {target === null
            ? 'Counting how many recipients this matches…'
            : <><b>{formatCount(target)}</b> recipients will be contacted.</>}
        </span>
        <button
          type="button" className="btn primary" data-testid="bulk-confirm-open"
          disabled={!ready} onClick={() => { setRefusal(null); setConfirming(true); }}
        >
          Review and confirm
        </button>
      </div>

      {confirming && rendered?.rendered && target !== null && (
        <ConfirmRun
          target={target}
          channel={composition.channel}
          body={rendered.body}
          subject={rendered.subject}
          onClose={() => setConfirming(false)}
          onRefused={message => { setRefusal(message); setConfirming(false); }}
          onCreated={onCreated}
          population={population}
          selectedIds={[...selected.keys()]}
          mode={mode}
        />
      )}
    </Card>
  );
}

/**
 * The target count, before anything is confirmed.
 *
 * For a filter it is the platform's own `$count` — asked for without fetching the rows, which is the
 * only way to answer "how many" for a population that must never be loaded. For an explicit
 * selection it is simply how many the officer ticked.
 */
function usePopulationCount(
  population: CaseQuery, mode: SelectionMode, selectedCount: number,
): number | null {
  const { adapter } = useCrmSession();
  const [count, setCount] = useState<number | null>(null);
  // The question's identity, so an unchanged filter does not re-ask and a changed one always does.
  const fingerprint = fingerprintQuery(population);
  const latest = useRef(population);
  latest.current = population;

  useEffect(() => {
    if (mode === 'SelectedRecords') return;
    let live = true;
    setCount(null);
    void countPopulation(adapter, latest.current)
      // `null` is "not known", and it is deliberately not zero. A count that could not be read must
      // not be shown as a number, because "0 recipients" reads as a fact about the population.
      .then(result => { if (live) setCount(result.value ?? null); })
      .catch(() => { if (live) setCount(null); });
    return () => { live = false; };
  }, [adapter, fingerprint, mode]);

  return mode === 'SelectedRecords' ? selectedCount : count;
}

/** The approved templates for the chosen channel and language. Loaded once for the panel. */
function useOfferedTemplates(composition: Composition): readonly CommunicationTemplate[] {
  const { adapter } = useCrmSession();
  const [catalogue, setCatalogue] = useState<readonly CommunicationTemplate[]>([]);

  useEffect(() => {
    let live = true;
    void loadTemplateCatalogue(adapter)
      .then(loaded => { if (live) setCatalogue(loaded); })
      .catch(() => { if (live) setCatalogue([]); });
    return () => { live = false; };
  }, [adapter]);

  return useMemo(
    () => selectableTemplates(catalogue, composition.channel, composition.language),
    [catalogue, composition.channel, composition.language]);
}

// ── Who it goes to ───────────────────────────────────────────────────────────

/** How the population is narrowed. One object, because they are one question. */
interface PopulationFilters {
  mode: SelectionMode;
  bucket: string;
  /** Case number or customer reference. Sent to the source, never applied to fetched rows. */
  search: string;
}

function PopulationChooser({
  filters, onFiltersChange, population, selected, onSelectedChange,
}: {
  filters: PopulationFilters;
  onFiltersChange: (filters: PopulationFilters) => void;
  population: CaseQuery;
  selected: ReadonlyMap<string, string>;
  onSelectedChange: (selected: ReadonlyMap<string, string>) => void;
}) {
  const { adapter } = useCrmSession();
  const { mode } = filters;
  const fetchPage = useMemo(() => createCaseQuery(adapter), [adapter]);

  const toggle = useCallback((row: CaseRow) => {
    const next = new Map(selected);
    if (next.has(row.id)) next.delete(row.id); else next.set(row.id, row.caseNumber);
    onSelectedChange(next);
  }, [onSelectedChange, selected]);

  const columns = useMemo<readonly DataGridColumn<CaseRow>[]>(() => [
    {
      key: 'pick', header: '', width: '44px',
      render: row => (mode === 'SelectedRecords' ? (selected.has(row.id) ? '☑' : '☐') : ''),
    },
    { key: 'case', header: 'Case', width: '160px', render: row => row.caseNumber },
    { key: 'customer', header: 'Customer reference', width: '160px', render: row => row.customerBusinessId },
    { key: 'bucket', header: 'Bucket', width: '110px', render: row => row.bucket ?? '—' },
    { key: 'status', header: 'Status', render: row => <StatusPill status={row.status} /> },
  ], [mode, selected]);

  return (
    <>
      <div className="field-grid" data-testid="bulk-population">
        <SelectField
          label="Who it goes to" value={mode} testId="bulk-selection-mode"
          choices={[
            { value: 'FilterDefinition', label: 'Everyone matching a filter' },
            { value: 'SelectedRecords', label: 'Only the cases I tick' },
          ]}
          onChange={next => onFiltersChange({ ...filters, mode: next as SelectionMode })}
        />
        <SelectField
          label="Arrears bucket" value={filters.bucket} testId="bulk-bucket"
          placeholder="Every bucket"
          choices={Object.values(LABELS.BUCKET_LABELS).map(name => ({ value: name, label: name }))}
          onChange={next => onFiltersChange({ ...filters, bucket: next })}
        />
        {/*
          Bucket alone is far too coarse to commit a campaign to: on this organisation the narrowest
          bucket is still thousands of cases. Narrowing by case number or customer reference is what
          makes a small, deliberate run expressible at all — and it is the same server-side filter
          the Collection Cases list sends, so what is counted is what was being looked at.
        */}
        <TextField
          label="Case number or customer reference" testId="bulk-search"
          value={filters.search}
          hint="Narrows the population. Leave empty to include every matching case."
          onChange={next => onFiltersChange({ ...filters, search: next })}
        />
      </div>

      {mode === 'SelectedRecords' && (
        <p className="hint" data-testid="bulk-selection-hint">
          Tick the cases to include. {formatCount(selected.size)} ticked.
        </p>
      )}

      <DataGrid<CaseRow, CaseQuery>
        columns={columns}
        fetchPage={fetchPage}
        query={population}
        rowKey={row => row.id}
        pageSize={50}
        height={280}
        emptyMessage="No open case matches this filter."
        {...(mode === 'SelectedRecords' ? { onRowClick: toggle } : {})}
        data-testid="bulk-population-grid"
      />
    </>
  );
}

// ── What it says ─────────────────────────────────────────────────────────────

function ComposerFields({ composition, template, offered, preview, onChange }: {
  composition: Composition;
  template: CommunicationTemplate | null;
  offered: readonly CommunicationTemplate[];
  preview: string;
  onChange: (composition: Composition) => void;
}) {
  return (
    <>
      <div className="field-grid" data-testid="bulk-composer">
        <SelectField
          label="Channel" value={composition.channel} testId="bulk-channel"
          choices={BULK_CHANNELS.map(channel => ({ value: channel.value, label: channel.label }))}
          onChange={next => onChange({
            ...composition, channel: next as Composition['channel'], templateId: '',
          })}
        />
        <SelectField
          label="Language" value={composition.language} testId="bulk-language"
          choices={LANGUAGES.map(language => ({ value: language.value, label: language.label }))}
          onChange={next => onChange({
            ...composition, language: next as TemplateLanguage, templateId: '',
          })}
        />
        <SelectField
          label="Template" value={composition.templateId} testId="bulk-template"
          placeholder={offered.length === 0 ? 'No approved template for this channel' : 'Choose a template'}
          choices={offered.map(option => ({ value: option.id, label: `${option.code} — ${option.name}` }))}
          onChange={next => onChange({ ...composition, templateId: next })}
        />
      </div>

      {offered.length === 0 && (
        <EmptyState
          icon="letter"
          message={'No template is available for this channel and language. A template must be active, '
            + 'approved where approval is required, and within its effective dates.'}
        />
      )}

      {template?.placeholders.map(name => (
        <TextField
          key={name} label={name} testId={`bulk-placeholder-${name}`}
          value={composition.values[name] ?? ''}
          hint="Filled once. Every recipient receives this same value."
          onChange={next => onChange({
            ...composition, values: { ...composition.values, [name]: next },
          })}
        />
      ))}

      {template && (
        <TextAreaField
          label="Message every recipient receives" testId="bulk-preview" rows={5}
          value={preview} disabled onChange={NO_EDIT}
          hint="Approved wording from configuration. It is frozen when the run is confirmed."
        />
      )}
    </>
  );
}

// ── Confirming ───────────────────────────────────────────────────────────────

const POPULATION_EMPTY = 'Nothing matches this selection any more, so there is no run to start.';

function tooLargeMessage(limit: number): string {
  return `This selection is larger than one run may contain (${formatCount(limit)} recipients). `
    + 'Narrow it and confirm again — nothing was started, and nothing was sent to part of it.';
}

/**
 * The last point at which anything can change.
 *
 * The population is resolved **here**, page by page against the source, and written down once. From
 * the moment the run exists it sends to that list, and re-running the filter later would be a
 * different campaign wearing the same name.
 */
function ConfirmRun({
  target, channel, body, subject, mode, population, selectedIds, onClose, onCreated, onRefused,
}: {
  target: number;
  channel: Composition['channel'];
  body: string;
  subject: string;
  mode: SelectionMode;
  population: CaseQuery;
  selectedIds: readonly string[];
  onClose: () => void;
  onCreated: (runId: string) => void;
  onRefused: (message: string) => void;
}) {
  const { adapter } = useCrmSession();
  const [working, setWorking] = useState(false);

  const confirm = useCallback(async () => {
    setWorking(true);
    try {
      const built = await createBulkService(adapter);
      if (built.status !== 'ready') { onRefused(built.message); return; }

      const recipientIds = mode === 'SelectedRecords'
        ? selectedIds
        : await resolveOrRefuse(adapter, population, onRefused);
      if (!recipientIds) return;

      const outcome = await built.service.createRun({
        name: runName(channel, target),
        channel,
        selectionMode: mode,
        ...(mode === 'FilterDefinition' ? { filterDefinition: JSON.stringify(population) } : {}),
        body,
        ...(channel === 'Email' ? { subject } : {}),
        recipientIds,
      });

      if (outcome.status === 'refused') { onRefused(outcome.message); return; }
      onCreated(outcome.runId);
    } catch {
      onRefused('This run could not be created. Nothing was started and nothing was sent.');
    } finally {
      setWorking(false);
    }
  }, [adapter, body, channel, mode, onCreated, onRefused, population, selectedIds, subject, target]);

  return (
    <Dialog
      title="Confirm this bulk run"
      subtitle="After this, the recipients and the wording cannot be changed."
      testId="bulk-confirm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} data-testid="bulk-confirm-cancel">
            Go back
          </button>
          <button
            type="button" className="btn primary" data-testid="bulk-confirm-create"
            disabled={working} onClick={() => { void confirm(); }}
          >
            {working ? 'Creating…' : 'Create the run'}
          </button>
        </>
      }
    >
      <p data-testid="bulk-confirm-summary">
        <b>{formatCount(target)}</b> recipients will each be sent one {channel} message.
      </p>
      <p className="hint">
        The list of recipients is fixed now. Changing the filter afterwards does not change this run.
      </p>
      <TextAreaField
        label="Wording" testId="bulk-confirm-body" rows={4} value={body} disabled onChange={NO_EDIT}
      />
      <p className="hint">
        The run is created ready to start. Nothing is sent until you start it, and delivery is
        reported by QDB&rsquo;s messaging service rather than by this screen.
      </p>
    </Dialog>
  );
}

/** Resolves the filter into a frozen list, or reports why it cannot be. */
async function resolveOrRefuse(
  adapter: XrmCrmAdapter,
  population: CaseQuery,
  onRefused: (message: string) => void,
): Promise<readonly string[] | null> {
  const resolved = await resolvePopulation(adapter, population);
  if (resolved.status === 'empty') { onRefused(POPULATION_EMPTY); return null; }
  if (resolved.status === 'tooLarge') { onRefused(tooLargeMessage(resolved.limit)); return null; }
  return resolved.recipientIds;
}

/** A name an officer will recognise in the list, with no identifier in it. */
function runName(channel: string, target: number): string {
  return `${channel} to ${formatCount(target)} recipients — ${formatDate(new Date().toISOString())}`;
}
