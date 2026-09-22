import { useEffect, useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  createPlatformMappingQuery, retrievePlatformConfigurations,
  type PlatformConfigurationRow, type PlatformMappingRow,
} from '../data/configurationQueries.js';
import {
  Card, EmptyState, FieldList, InfoBanner, OrgBadge, PartialCapabilityNotice,
} from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';
import type { ViewDefinition } from '../shell/routes.js';
import { toError } from '../platform/errors.js';

/**
 * Configuration — the deployment's own shape, read.
 *
 * This is the screen that makes the dual-platform design visible: one row per organisation saying
 * whether it is on-premises or cloud, which table holds its customers, and which ruleset codes it
 * defers to. Everything the workspace branches on comes from here rather than from a constant, which
 * is exactly what lets one build serve Housing Loan and BFD on two platforms.
 *
 * Publishing, comparison, version history and export are preserved as disabled commands. They are
 * Phases 8–10, and a configuration this application could publish would make it a second source of
 * platform truth.
 */

export function ConfigurationView({ view }: { view: ViewDefinition }) {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<{
    status: 'loading' | 'ready' | 'error';
    rows?: readonly PlatformConfigurationRow[];
    error?: Error;
  }>({ status: 'loading' });
  const [selected, setSelected] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    retrievePlatformConfigurations(adapter)
      .then(rows => {
        if (cancelled) return;
        setState({ status: 'ready', rows });
        setSelected(rows[0]?.id);
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', error: toError(error) });
      });
    return () => { cancelled = true; };
  }, [adapter]);

  return (
    <div data-testid="view-admin">
      <PartialCapabilityNotice view={view} />
      <SessionCard />

      {state.status === 'loading' && <div className="empty-state" data-testid="config-loading">Loading configuration…</div>}
      {state.status === 'error' && (
        <Card title="Platform configuration">
          <EmptyState icon="warn" message="The configuration could not be read. Try again, and report it to your administrator if it keeps happening." />
        </Card>
      )}
      {state.status === 'ready' && (state.rows?.length ?? 0) === 0 && (
        <Card title="Platform configuration">
          <EmptyState
            icon="settings"
            message="No platform configuration row exists in this organisation. Nothing in the platform can resolve its customer table or ruleset codes without one."
          />
        </Card>
      )}
      {state.rows?.map(row => (
        <ConfigurationCard
          key={row.id} row={row} isSelected={row.id === selected} onSelect={() => setSelected(row.id)}
        />
      ))}

      {selected && <MappingsCard configurationId={selected} />}
      <DisabledCommands />
    </div>
  );
}

/** Where this workspace is actually running, read from the CRM session rather than assumed. */
function SessionCard() {
  const { context } = useCrmSession();
  return (
    <Card title="This session" subtitle="Resolved from the Dynamics global context when the workspace loaded.">
      <FieldList
        testId="session-fields"
        fields={[
          { label: 'Client URL', value: context.clientUrl },
          { label: 'Web API version', value: context.apiVersion },
          { label: 'Web API base', value: context.apiBase },
          // The organisation unique name is deliberately absent. A manager is not a developer,
          // and `unq8e28c4d88f8f4c42aa0a31a680cc0` tells them nothing the client URL below does
          // not (KI-93). It reached this panel because the header fix was made in one place and
          // this was the other.
          { label: 'User', value: context.userName },
          { label: 'Language', value: String(context.languageId) },
          { label: 'Security roles', value: String(context.securityRoleIds.length) },
        ]}
      />
      {/*
        Whether this is on-premises or cloud is *not* inferred from the API version here. The
        authoritative answer is the platform configuration row below, which is what every adapter
        reads — an inference in the UI could disagree with it and be believed.
      */}
    </Card>
  );
}

function ConfigurationCard({ row, isSelected, onSelect }: {
  row: PlatformConfigurationRow;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      title={row.name}
      subtitle={`${row.platformType ?? 'platform not set'} · ${row.environmentCode ?? 'environment not set'} · ${row.isActive ? 'active' : 'inactive'}`}
      actions={
        <button
          type="button" className={isSelected ? 'btn primary' : 'btn'}
          data-testid={`select-config-${row.id}`} onClick={onSelect}
        >
          {isSelected ? 'Showing mappings' : 'Show mappings'}
        </button>
      }
    >
      <div className="action-row"><OrgBadge org={row.organization} /></div>
      <FieldList
        testId={`config-fields-${row.id}`}
        fields={[
          { label: 'Customer table', value: row.customerEntity ?? '—' },
          { label: 'Customer business id field', value: row.customerBusinessIdField ?? '—' },
          { label: 'Facility table', value: row.facilityEntity ?? 'none — facility identity comes from MIS' },
          { label: 'Eligibility ruleset', value: row.eligibilityRulesetCode ?? '—' },
          { label: 'Strategy ruleset', value: row.strategyRulesetCode ?? '—' },
          { label: 'Contact-hold ruleset', value: row.contactHoldRulesetCode ?? '— not configured' },
          { label: 'Snapshot policy', value: row.snapshotPolicy ?? '—' },
          { label: 'MIS integration', value: row.misIntegrationEnabled ? 'Enabled' : 'Disabled' },
          { label: 'MIS provider', value: row.misProvider ?? '—' },
          { label: 'Feature flags', value: row.featureFlags ?? '—' },
        ]}
      />
    </Card>
  );
}

const MAPPING_COLUMNS: readonly DataGridColumn<PlatformMappingRow>[] = [
  { key: 'object', header: 'Business object', width: '160px', render: r => r.businessObject ?? '—' },
  { key: 'canonical', header: 'Canonical field', width: '180px', render: r => r.canonicalField ?? '—' },
  { key: 'entity', header: 'CRM table', width: '180px', render: r => r.crmEntity ?? '—' },
  { key: 'field', header: 'CRM column', render: r => r.crmField ?? '—' },
  { key: 'type', header: 'Type', width: '110px', render: r => r.dataType ?? '—' },
  { key: 'required', header: 'Required', width: '90px', render: r => (r.isRequired ? 'Yes' : '—') },
  { key: 'access', header: 'Access', width: '110px', render: r => r.accessMode ?? '—' },
  { key: 'state', header: 'State', width: '90px', render: r => (r.isActive ? 'Active' : 'Inactive') },
];

function MappingsCard({ configurationId }: { configurationId: string }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createPlatformMappingQuery(adapter), [adapter]);
  const query = useMemo(() => ({ configurationId }), [configurationId]);
  return (
    <Card
      title="Field mappings"
      subtitle="Canonical field to CRM column, per business object. This is what makes one codebase serve two schemas."
    >
      <DataGrid<PlatformMappingRow, { configurationId?: string }>
        columns={MAPPING_COLUMNS} fetchPage={fetchPage} query={query}
        rowKey={row => row.id} pageSize={100} height={360}
        emptyMessage="No field mapping is configured for this row."
        data-testid="config-mappings"
      />
    </Card>
  );
}

/** The approved command bar for this screen, preserved and disabled with the phase that owns each. */
function DisabledCommands() {
  const commands: readonly { label: string; phase: number }[] = [
    { label: 'Publish configuration', phase: 8 },
    { label: 'Compare organisations', phase: 9 },
    { label: 'Version history', phase: 9 },
    { label: 'Export', phase: 10 },
  ];
  return (
    <Card title="Configuration commands" subtitle="Preserved from the approved design and deliberately disabled.">
      <InfoBanner>
        A configuration this application could publish would make it a second source of platform truth.
        Publishing stays with the phase that owns configuration lifecycle.
      </InfoBanner>
      <div className="action-row" data-testid="config-commands">
        {commands.map(command => (
          <button
            key={command.label} type="button" className="btn" disabled
            data-pending-phase={command.phase} title={`Phase ${command.phase} owns this`}
          >
            {command.label}
            <span className="rel-tag">P{command.phase}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
