import { useEffect, useState } from 'react';
import { ActivityDialog } from '../../../views/ActivityDialog.js';
import { PromiseDialog } from '../../../views/PromiseDialog.js';
import { CaseActionPlan } from '../../../views/strategyViews.js';
import { CommunicationCenterView } from '../../../views/CommunicationCenter.js';
import { WorkoutLegalTab } from '../../../views/workoutLegalTab.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { Card, EmptyState, ErrorState, LoadingSkeleton, Tabs, type TabItem } from '../../components/primitives.js';
import { CaseHeader } from './CaseHeader.js';
import { CaseOverview } from './CaseOverview.js';
import { ActivitiesTab, AuditTab, HistoryTab, PromisesTab } from './caseTabs.js';
import { useCaseRecord } from './useCaseRecord.js';

/**
 * Case Workspace V2 — the operational centre.
 *
 * One card answers who, which facility, how late and what can be done; the tabs hold the detail.
 * Every write goes through V1's own dialogs — the ones that carry the business rules, concurrency and
 * validation — re-skinned rather than copied. After a save the whole case re-reads, so what the
 * officer sees next is what the server holds, never an optimistic guess.
 *
 * The tab lives in the URL shared with V1 (`#case/<id>/<tab>`), so switching workspaces keeps the
 * case and, where both have it, the tab.
 */

const TABS: readonly TabItem[] = [
  { id: 'summary', label: 'Overview' },
  { id: 'plan', label: 'Action Plan' },
  { id: 'actions', label: 'Activities' },
  { id: 'ptp', label: 'Promises' },
  { id: 'comms', label: 'Communications' },
  { id: 'history', label: 'Delinquency history' },
  { id: 'workout', label: 'Workout & Legal' },
  { id: 'audit', label: 'Audit' },
];

function pickTab(requested: string | undefined): string {
  return TABS.some(tab => tab.id === requested) ? requested! : 'summary';
}

type Dialog = { kind: 'activity' | 'promise'; mode: 'create' | 'edit'; id?: string };

export function V2CasePage({ request }: { request: ViewRequest }) {
  const { go } = useV2Shell();
  const caseId = request.recordId;
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState('');
  const record = useCaseRecord(caseId, reloadKey);
  const tab = pickTab(request.tab);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!caseId) {
    return (
      <Card title="No case open">
        <EmptyState title="Open a case from Collection Cases, Work Queues or My Day." />
      </Card>
    );
  }
  if (record.status === 'loading') return <Card><LoadingSkeleton rows={6} label="Loading the case" testId="v2-case-loading" /></Card>;
  if (record.status === 'error') {
    return <Card><ErrorState title="This case could not be opened." message="Try again. If it keeps happening, report it to your administrator." onRetry={() => setReloadKey(k => k + 1)} testId="v2-case-error" /></Card>;
  }
  if (record.status === 'missing') {
    return <Card><EmptyState title="This case could not be found." message={`No collection case with id ${caseId} can be read in this CRM session.`} testId="v2-case-missing" /></Card>;
  }

  const { detail, customer } = record;
  const openTab = (next: string) => go('case', detail.id, next);
  const saved = (message: string) => { setReloadKey(k => k + 1); setToast(message); };
  const canWrite = detail.isOpen;

  return (
    <div className="v2-case" data-testid="v2-case" data-case-id={detail.id}>
      <section className="v2-card">
        <CaseHeader
          detail={detail}
          customer={customer}
          onBack={() => go('cases')}
          onLogAction={() => setDialog({ kind: 'activity', mode: 'create' })}
          onCapturePromise={() => setDialog({ kind: 'promise', mode: 'create' })}
          onMessage={() => openTab('comms')}
          onOpenCustomer={() => request.onOpenCustomer(detail.customerBusinessId)}
        />
        <Tabs label="Case sections" tabs={TABS} active={tab} onSelect={openTab} testId="v2-case-tabs" />
      </section>

      <div role="tabpanel" aria-label={TABS.find(t => t.id === tab)?.label} className="v2-case-panel" data-testid={`v2-case-panel-${tab}`}>
        {tab === 'summary' && <CaseOverview detail={detail} customer={customer} reloadKey={reloadKey} onOpenTab={openTab} />}
        {tab === 'plan' && (
          <div className="v2-bridged">
            <CaseActionPlan
              caseId={detail.id}
              {...(detail.strategyId !== undefined ? { strategyId: detail.strategyId } : {})}
              {...(detail.strategyName !== undefined ? { strategyName: detail.strategyName } : {})}
              {...(detail.episodeNumber !== undefined ? { episodeNumber: detail.episodeNumber } : {})}
            />
          </div>
        )}
        {tab === 'actions' && (
          <ActivitiesTab
            caseId={detail.id} reloadKey={reloadKey}
            onOpen={id => setDialog({ kind: 'activity', mode: 'edit', id })}
            onLog={canWrite ? () => setDialog({ kind: 'activity', mode: 'create' }) : undefined}
          />
        )}
        {tab === 'ptp' && (
          <PromisesTab
            caseId={detail.id} reloadKey={reloadKey}
            onOpen={id => setDialog({ kind: 'promise', mode: 'edit', id })}
            onCapture={canWrite ? () => setDialog({ kind: 'promise', mode: 'create' }) : undefined}
          />
        )}
        {tab === 'comms' && (
          <div className="v2-bridged">
            <CommunicationCenterView
              mode="single" caseId={detail.id}
              onSelectCase={request.onOpenComms} onNavigate={request.onNavigateComms}
            />
          </div>
        )}
        {tab === 'history' && <HistoryTab caseId={detail.id} />}
        {tab === 'workout' && <div className="v2-bridged"><WorkoutLegalTab detail={detail} /></div>}
        {tab === 'audit' && <AuditTab detail={detail} />}
      </div>

      {dialog?.kind === 'activity' && (
        <ActivityDialog
          mode={dialog.mode} caseId={detail.id}
          {...(dialog.id !== undefined ? { activityId: dialog.id } : {})}
          onClose={() => setDialog(null)}
          onSaved={() => saved('The action was saved.')}
        />
      )}
      {dialog?.kind === 'promise' && (
        <PromiseDialog
          mode={dialog.mode} caseId={detail.id}
          {...(dialog.id !== undefined ? { promiseId: dialog.id } : {})}
          onClose={() => setDialog(null)}
          onSaved={() => saved('The promise was saved.')}
        />
      )}

      <div className="v2-toast-region" aria-live="polite" data-testid="v2-toast-region">
        {toast && <div className="v2-toast" role="status">{toast}</div>}
      </div>
    </div>
  );
}
