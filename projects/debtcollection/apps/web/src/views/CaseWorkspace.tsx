import { useState } from 'react';
import { Card, EmptyState } from '../components/primitives.js';
import { useCaseRecord } from '../data/useCaseRecord.js';
import { buildHash } from '../shell/useHashRoute.js';
import { useWorkspaceVersion } from '../v2/version/WorkspaceVersionRoot.js';
import { FILTER_SEGMENT, recallCaseListReturn } from '../v2/data/caseListFilterUrl.js';
import { CaseWorkspacePage, type CaseWorkspaceNavigation } from './caseWorkspace/CaseWorkspacePage.js';

/**
 * The `case` route in both workspaces: reads the case and its customer, then hands them to the one
 * Case Workspace. V1 draws it directly; V2 draws it inside its frame (`v2-bridged`).
 *
 * The read is `useCaseRecord` — case, then customer — re-run on every save. A case that cannot be
 * read says so; a customer that cannot be read only costs the header its name.
 */
export function CaseWorkspaceView({ caseId, initialTab, onOpenComms, onNavigateComms }: {
  caseId?: string | undefined;
  /** A record tab to open the page on, so `#case/<id>/ptp` is a working link. */
  initialTab?: string | undefined;
  onOpenComms?: (caseId: string) => void;
  onNavigateComms?: (recordId?: string, tab?: string) => void;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const record = useCaseRecord(caseId, reloadKey);
  const navigation = useCaseNavigation(onOpenComms, onNavigateComms);

  if (!caseId) return <Unavailable message="Open a case from Collection Cases, Work Queues or My Day to see it here." />;
  if (record.status === 'loading') return <div className="empty-state" data-testid="case-loading">Loading case…</div>;
  if (record.status === 'error') return <Unavailable message="This case could not be opened. Try again, and report it to your administrator if it keeps happening." />;
  if (record.status === 'missing') return <Unavailable message={`No collection case with id ${caseId} could be read in this CRM session.`} />;
  return (
    <CaseWorkspacePage
      key={record.detail.id} detail={record.detail} customer={record.customer} initialTab={initialTab}
      reloadKey={reloadKey} onSaved={() => setReloadKey(key => key + 1)} navigation={navigation}
    />
  );
}

function Unavailable({ message }: { message: string }) {
  return <Card title="Case Detail"><EmptyState icon="warn" message={message} /></Card>;
}

/**
 * Back goes to Collection Cases — in V2 to the filtered list the case was opened from, when the
 * Cases list recorded one (where the officer came from in general is WP5's work).
 */
function useCaseNavigation(
  onOpenComms: ((caseId: string) => void) | undefined,
  onNavigateComms: ((recordId?: string, tab?: string) => void) | undefined,
): CaseWorkspaceNavigation {
  const { version } = useWorkspaceVersion();
  return {
    onBack: () => { window.location.hash = backToCases(version); },
    onOpenComms: onOpenComms ?? (id => { window.location.hash = buildHash('comms', id); }),
    onNavigateComms: onNavigateComms ?? ((recordId, tab) => { window.location.hash = buildHash('comms', recordId, tab); }),
  };
}

function backToCases(version: string): string {
  const remembered = version === 'v2' ? recallCaseListReturn() : undefined;
  return remembered ? buildHash('cases', FILTER_SEGMENT, remembered) : buildHash('cases');
}
