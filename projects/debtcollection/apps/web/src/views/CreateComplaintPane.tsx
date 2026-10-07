import { useEffect, useState } from 'react';
import { Dialog, TextAreaField } from '../components/forms.js';
import { Card, FieldList, Icon } from '../components/primitives.js';
import {
  ComplaintServiceError, resolveComplaintService,
  type ComplaintServiceAvailability, type RaisedComplaint,
} from '../data/complaintService.js';
import { describeFailure } from '../platform/errors.js';
import { useCrmSession } from '../shell/context.js';
import { formatMoment } from './Customer360.js';

/** Case Management's description is a 2,000-character memo. */
const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * "Create complaint" on a Housing Loan Collection Case.
 *
 * DCP starts the complaint and QDB's existing Case Management owns it from then on — its workflow,
 * assignment, status and closure. So there is no complaint form here beyond what cannot be
 * derived: the officer writes the description, and the Integration Service fills every other Case
 * value from the approved HL mapping.
 */
export function RaiseComplaintCard({ caseId, organization }: { caseId: string; organization: string }) {
  const [isOpen, setIsOpen] = useState(false);
  if (organization !== 'HL') return null;
  return (
    <Card
      title="Raise a complaint"
      subtitle="Starts a Case in QDB's Case Management, which owns it from then on."
      actions={<button type="button" className="btn" onClick={() => setIsOpen(true)} data-testid="create-complaint"><Icon name="add" />Create complaint</button>}
    >
      {isOpen && <CreateComplaintPane caseId={caseId} onClose={() => setIsOpen(false)} />}
    </Card>
  );
}

function useComplaintService(): ComplaintServiceAvailability | null {
  const { adapter, integrationServiceToken } = useCrmSession();
  const [availability, setAvailability] = useState<ComplaintServiceAvailability | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveComplaintService(adapter, 'HL', integrationServiceToken)
      .then(result => { if (!cancelled) setAvailability(result); })
      .catch((failure: unknown) => { if (!cancelled) setAvailability({ kind: 'unavailable', reason: describeFailure(failure) }); });
    return () => { cancelled = true; };
  }, [adapter, integrationServiceToken]);
  return availability;
}

export function CreateComplaintPane({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const availability = useComplaintService();
  // One id per pane, repeated on every retry: the service turns it into the Case id, so a
  // double-click or a timed-out attempt can never create a second complaint.
  const [requestId] = useState(() => crypto.randomUUID());
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [raised, setRaised] = useState<RaisedComplaint | null>(null);

  const submit = async () => {
    if (availability?.kind !== 'available') return;
    setBusy(true);
    setFailure('');
    try {
      setRaised(await availability.client.raiseComplaint(caseId, { requestId, description: description.trim() }));
    } catch (error) {
      setFailure(error instanceof ComplaintServiceError ? error.message : describeFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = availability?.kind === 'available' && !busy && description.trim().length > 0 && !raised;
  return (
    <Dialog
      title="Create complaint" subtitle="Raised in Case Management for this Housing Loan case" onClose={onClose} testId="complaint-pane"
      footer={raised
        ? <button type="button" className="btn primary" onClick={onClose} data-testid="complaint-done">Done</button>
        : <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => { void submit(); }} disabled={!canSubmit} data-busy={busy} data-testid="complaint-submit">
            {busy ? 'Creating…' : 'Create complaint'}
          </button>
        </>}
    >
      <ComplaintPaneBody availability={availability} raised={raised} failure={failure} busy={busy} description={description} onDescription={setDescription} />
    </Dialog>
  );
}

function ComplaintPaneBody({ availability, raised, failure, busy, description, onDescription }: {
  availability: ComplaintServiceAvailability | null; raised: RaisedComplaint | null; failure: string; busy: boolean;
  description: string; onDescription: (value: string) => void;
}) {
  if (raised) return <RaisedComplaintSummary complaint={raised} />;
  if (availability === null) return <div className="empty-state" data-testid="complaint-checking">Checking the Case Management connection…</div>;
  if (availability.kind === 'unavailable') {
    return <div className="info-banner" data-testid="complaint-unavailable"><Icon name="info" /><div><b>A complaint cannot be raised from here yet.</b><p>{availability.reason}</p></div></div>;
  }
  return (
    <>
      <TextAreaField
        label="Complaint description" required rows={6} value={description} disabled={busy} testId="complaint-description"
        onChange={value => onDescription(value.slice(0, MAX_DESCRIPTION_LENGTH))}
        hint={`${description.length} of ${MAX_DESCRIPTION_LENGTH} characters`}
      />
      <p className="hint" data-testid="complaint-derived">
        Case Management fills in the rest for Housing Loan: the customer&apos;s name and mobile, the business unit,
        department, product and assigned manager, the case type and origin, and today as the received date.
      </p>
      {failure && <div className="info-banner bad" role="alert" data-testid="complaint-error"><Icon name="warn" /><div><b>The complaint was not created.</b><p>{failure}</p></div></div>}
    </>
  );
}

function RaisedComplaintSummary({ complaint }: { complaint: RaisedComplaint }) {
  return (
    <div data-testid="complaint-raised">
      <div className="info-banner ok">
        <Icon name="check" />
        <div><b>{complaint.isRepeatSubmission ? 'This complaint had already been created.' : 'Complaint created in Case Management.'}</b></div>
      </div>
      <FieldList testId="complaint-summary" fields={[
        { label: 'Case number', value: complaint.caseNumber ?? '—' },
        { label: 'Status', value: complaint.status ?? '—' },
        { label: 'Created', value: formatMoment(complaint.createdOn) },
        { label: 'Assigned to', value: complaint.assignedTo ?? '—' },
        { label: 'Owner', value: complaint.owner ?? '—' },
      ]} />
      <a className="btn" href={complaint.openUrl} target="_blank" rel="noopener noreferrer" data-testid="complaint-open">
        Open Case Management Case
      </a>
    </div>
  );
}
