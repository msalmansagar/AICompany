import { useEffect, useRef, useState } from 'react';
import type { ReportingScope } from '@dcp/domain';
import type { ReportResult } from './reportEngineContracts.js';
import type { IReportingService, ReportingFailureKind } from './ReportingService.js';

/**
 * One report, kept current with its question.
 *
 * The answer shown always belongs to the scope and definition asked for now: a run that resolves
 * after the question changed is dropped, so switching the CRM picker while a slow report is still
 * in flight cannot leave the previous CRM's figures under the new heading. A missing definition —
 * the catalogue names a code this organisation has no record for — is its own state, because it is
 * a provisioning fact and not a service failure.
 */
export type ReportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ok'; result: ReportResult }
  | { status: ReportingFailureKind; message: string };

export interface ReportQuestion {
  reportId: string | undefined;
  scope: ReportingScope;
  /** False until the definition index has been read; nothing runs before then. */
  isResolved: boolean;
}

export function useReport(service: IReportingService, question: ReportQuestion): ReportState {
  const [state, setState] = useState<ReportState>({ status: 'idle' });
  const sequence = useRef(0);
  const scopeKey = JSON.stringify(question.scope);

  useEffect(() => {
    if (!question.isResolved) { setState({ status: 'loading' }); return; }
    if (!question.reportId) { setState({ status: 'missing' }); return; }
    const mine = ++sequence.current;
    setState({ status: 'loading' });
    void service.runReport({ reportId: question.reportId, scope: question.scope }).then(outcome => {
      if (mine !== sequence.current) return;
      setState(outcome.status === 'ok' ? { status: 'ok', result: outcome.result } : { status: outcome.status, message: outcome.message });
    });
    // The scope's identity is its content; the object is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, question.reportId, question.isResolved, scopeKey]);

  return state;
}
