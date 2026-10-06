import { useCallback, useMemo, useState } from 'react';
import type { HistoryEntry } from '@dcp/domain';
import type { CaseDetail, CustomerProfile } from '../../data/caseQueries.js';
import {
  currentPromise, followUpsToComplete, lastRecordedActivity, promisesOf, resolutionStatuses,
} from '../../data/caseWorkPlan.js';
import { SectionBoundary, SkeletonLines } from '../../components/SectionBoundary.js';
import { buildHash } from '../../shell/useHashRoute.js';
import { CollectionHistoryTimeline } from '../customer360/CollectionHistoryTimeline.js';
import { CaseIdentityHeader } from './CaseIdentityHeader.js';
import { CaseActionBar, type CaseCommands, type ContactChannels } from './CaseActionBar.js';
import { financialUnitTerms } from '../../data/financialUnit.js';
import { CaseOverviewPanel, type OverviewFacts } from './CaseOverviewPanel.js';
import { CaseActionPlanPanel } from './CaseActionPlanPanel.js';
import { CasePromisePanel } from './CasePromisePanel.js';
import { CaseResolutionPanel } from './CaseResolutionPanel.js';
import { CaseDelinquencyPanel } from './CaseDelinquencyPanel.js';
import { CaseRecordTabs, recordTabFor, type RecordTab, type RecordTabsProps } from './CaseRecordTabs.js';
import { CasePanes, type CasePane, type PaneOutcome } from './CasePanes.js';
import { useCaseWorkspace, type CaseWorkspaceData } from './useCaseWorkspace.js';

/**
 * The Collection Case Workspace — one delinquency episode, worked from one surface (WP3).
 *
 * Header and action bar stay on screen; below them the overview, the Action Plan and the case's
 * timeline, with the promise, resolution and delinquency panels beside them; the full records sit
 * in tabs underneath. Every command opens a pane over the case, and a save closes it, says so and
 * re-reads. Shared by V1 and V2 (V2 hosts it in its frame), so both workspaces work a case alike.
 *
 * Nothing here decides anything: the status, bucket, strategy and plan are what the platform holds,
 * and Customer 360 — the whole customer — is one click away on the customer's name.
 */
export interface CaseWorkspaceNavigation {
  onBack: () => void;
  onOpenComms: (caseId: string) => void;
  onNavigateComms: (recordId?: string, tab?: string) => void;
}

export function CaseWorkspacePage({ detail, customer, initialTab, reloadKey, onSaved, navigation }: {
  detail: CaseDetail;
  customer: CustomerProfile | undefined;
  initialTab: string | undefined;
  reloadKey: number;
  /** Re-reads the case and everything on the page. */
  onSaved: () => void;
  navigation: CaseWorkspaceNavigation;
}) {
  const data = useCaseWorkspace(detail, reloadKey);
  const [tab, setTab] = useState<RecordTab>(() => recordTabFor(initialTab) ?? 'actions');
  const [pane, setPane] = useState<CasePane | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const openTab = useCallback((next: RecordTab) => showRecordTab(detail.id, next, setTab), [detail.id]);
  const commands = useCaseCommands(setPane, openTab);
  const followUps = useMemo(() => (data.groups ? followUpsToComplete(data.groups) : []), [data.groups]);
  const outcome = useMemo<PaneOutcome>(() => ({
    onClose: () => setPane(undefined),
    onSaved: message => { setPane(undefined); setNotice(message); onSaved(); },
    onRefresh: onSaved,
  }), [onSaved]);
  const bar = (
    <CaseActionBar
      isOpen={detail.isOpen} organization={detail.organization} customer={customer}
      channels={contactChannels(data, customer)} followUps={followUps} commands={commands}
    />
  );

  return (
    <div className="cw" data-testid="view-case" data-case-id={detail.id}>
      <CaseIdentityHeader detail={detail} customer={customer} onBack={navigation.onBack} actions={bar} />
      {notice && <p className="cw-notice" role="status" data-testid="cw-notice">{notice}</p>}
      <WorkSurface detail={detail} data={data} reloadKey={reloadKey} commands={commands} openTab={openTab} />
      <CaseRecordTabs detail={detail} active={tab} onSelect={openTab} onSaved={onSaved} comms={commsOf(navigation)} />
      <CasePanes caseId={detail.id} context={describeCaseContext(detail, customer)} pane={pane} outcome={outcome} />
    </div>
  );
}

/** SMS needs the organisation's message table configured; Email needs an address on the customer. */
function contactChannels(data: CaseWorkspaceData, customer: CustomerProfile | undefined): ContactChannels {
  const messaging = data.history.state.status === 'ready' ? data.history.state.data.messaging : undefined;
  return { canSms: Boolean(messaging?.sms), canEmail: Boolean(customer?.email) };
}

/** "Aisha Al-Mansouri · Loan Account HL-99001 · Case COL-HL-000123" */
export function describeCaseContext(detail: CaseDetail, customer: CustomerProfile | undefined): string {
  const name = customer?.displayName ?? detail.customerName ?? detail.customerBusinessId;
  return `${name} · ${financialUnitTerms(detail.sourceSystem).noun} ${detail.facilityNumber} · Case ${detail.caseNumber}`;
}

function commsOf(navigation: CaseWorkspaceNavigation): RecordTabsProps['comms'] {
  return { onOpenComms: navigation.onOpenComms, onNavigateComms: navigation.onNavigateComms };
}

/**
 * Shows a record tab and brings it into view. The hash is replaced, not pushed: a refresh keeps the
 * tab, and Back leaves the case instead of stepping through every tab visited.
 */
function showRecordTab(caseId: string, tab: RecordTab, setTab: (tab: RecordTab) => void): void {
  setTab(tab);
  window.history.replaceState(window.history.state, '', buildHash('case', caseId, tab));
  window.requestAnimationFrame(() => document.getElementById('cw-records')?.scrollIntoView?.({ block: 'start' }));
}

function useCaseCommands(setPane: (pane: CasePane) => void, openTab: (tab: RecordTab) => void): CaseCommands {
  return useMemo(() => ({
    onLogAction: () => setPane({ kind: 'activity', mode: 'create' }),
    onLogCall: () => setPane({ kind: 'activity', mode: 'create', note: 'Record the call: choose the call activity type and write what the customer said.' }),
    onMessage: (channel: 'SMS' | 'Email') => setPane({ kind: 'message', channel }),
    onCapturePromise: () => setPane({ kind: 'promise', mode: 'create' }),
    onComplete: (activityId: string) => setPane({ kind: 'activity', mode: 'complete', activityId }),
    onViewPromise: (promiseId: string) => setPane({ kind: 'promise', mode: 'edit', promiseId }),
    onRaiseComplaint: () => setPane({ kind: 'complaint' }),
    onRecordDispute: () => setPane({ kind: 'activity', mode: 'create', note: 'Choose the dispute activity type to record the customer’s dispute against this case.' }),
    onOpenResolution: () => openTab('workout'),
  }), [setPane, openTab]);
}

// ── The working surface ──────────────────────────────────────────────────────

function WorkSurface({ detail, data, reloadKey, commands, openTab }: {
  detail: CaseDetail; data: CaseWorkspaceData; reloadKey: number; commands: CaseCommands; openTab: (tab: RecordTab) => void;
}) {
  const [lastContact, setLastContact] = useState<HistoryEntry | null | undefined>(undefined);
  const onEntries = useCallback((entries: readonly HistoryEntry[]) => setLastContact(entries.find(entry => entry.category === 'communications') ?? null), []);
  const facts = overviewFacts(data, lastContact);
  return (
    <div className="cw-layout">
      <div className="cw-col-main">
        <CaseOverviewPanel detail={detail} facts={facts} />
        <SectionBoundary label="The Action Plan" state={data.work.state} onRetry={data.work.retry} skeleton={<SkeletonLines lines={4} height={18} />} testId="cw-plan-section">
          {() => data.groups && <CaseActionPlanPanel groups={data.groups} canWrite={detail.isOpen} onComplete={commands.onComplete} onOpenFullPlan={() => openTab('plan')} />}
        </SectionBoundary>
        <CaseTimeline caseId={detail.id} data={data} reloadKey={reloadKey} onEntries={onEntries} />
      </div>
      <div className="cw-col-side">
        <SectionBoundary label="Promises" state={data.work.state} onRetry={data.work.retry} skeleton={<SkeletonLines lines={3} height={18} />} testId="cw-ptp-section">
          {loaded => <CasePromisePanel current={currentPromise(loaded.activities)} promises={promisesOf(loaded.activities)} onView={commands.onViewPromise} onOpenAll={() => openTab('ptp')} />}
        </SectionBoundary>
        <ResolutionSlot data={data} onOpenResolution={() => openTab('workout')} />
        <CaseDelinquencyPanel caseId={detail.id} onOpenAll={() => openTab('history')} />
      </div>
    </div>
  );
}

function overviewFacts(data: CaseWorkspaceData, lastContact: HistoryEntry | null | undefined): OverviewFacts {
  const work = data.work.state.status === 'ready' ? data.work.state.data : undefined;
  return {
    groups: data.groups,
    promise: work ? currentPromise(work.activities) : undefined,
    lastActivity: work ? lastRecordedActivity(work.activities) : undefined,
    lastContact,
  };
}

/** The case's own history, with the reader Customer 360 uses, narrowed to this one case. */
function CaseTimeline({ caseId, data, reloadKey, onEntries }: {
  caseId: string; data: CaseWorkspaceData; reloadKey: number; onEntries: (entries: readonly HistoryEntry[]) => void;
}) {
  // Stable, so the timeline sees the same question until the case changes.
  const caseIds = useMemo(() => [caseId], [caseId]);
  return (
    <div className="c360 cw-timeline">
      <SectionBoundary label="The case timeline" state={data.history.state} onRetry={data.history.retry} skeleton={<SkeletonLines lines={5} height={18} />} testId="cw-timeline-section">
        {history => <CollectionHistoryTimeline key={reloadKey} caseIds={caseIds} history={history} counts={undefined} contextOf={noCaseContext} title="Timeline" onEntries={onEntries} />}
      </SectionBoundary>
    </div>
  );
}

/** One case: no entry needs its unit and case named. */
const noCaseContext = () => undefined;

/** Needs both reads: the activities, and the type codes that say which process each one is. */
function ResolutionSlot({ data, onOpenResolution }: { data: CaseWorkspaceData; onOpenResolution: () => void }) {
  const { work, history } = data;
  if (work.state.status !== 'ready') return <SectionBoundary label="Resolution" state={work.state} onRetry={work.retry} skeleton={<SkeletonLines lines={3} height={18} />} testId="cw-resolution-section">{() => null}</SectionBoundary>;
  const activities = work.state.data.activities;
  return (
    <SectionBoundary label="Resolution" state={history.state} onRetry={history.retry} skeleton={<SkeletonLines lines={3} height={18} />} testId="cw-resolution-section">
      {context => <CaseResolutionPanel statuses={resolutionStatuses(activities, context.types)} onOpenResolution={onOpenResolution} />}
    </SectionBoundary>
  );
}
