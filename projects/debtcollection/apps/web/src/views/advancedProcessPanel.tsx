import {
  describeAdvancedProcesses, type AdvancedProcess, type ProcessCapability,
} from '@dcp/domain';
import { useAdvancedProcessEvidence } from '../data/useAdvancedProcessEvidence.js';
import { Card } from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';

/**
 * What an officer can do with each advanced process, and why not where they cannot (WP6).
 *
 * A statement, not a menu: there is no control in this card. Where something is actionable the
 * sentence says where it is done, so the capability is reached through the screen that owns it.
 */
export function AdvancedProcessPanel() {
  const { adapter } = useCrmSession();
  const aspects = describeAdvancedProcesses(useAdvancedProcessEvidence(adapter));

  return (
    <Card
      title="What can be done here"
      subtitle="Each advanced process, as this workspace supports it today."
    >
      <table className="grid" data-testid="advanced-processes">
        <thead>
          <tr>
            <th style={{ width: '150px' }}>Process</th>
            <th style={{ width: '250px' }}>Aspect</th>
            <th style={{ width: '170px' }}>State</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {aspects.map(row => (
            <tr key={row.id} data-testid={`process-aspect-${row.id}`} data-capability={row.capability}>
              <td>{PROCESS_NAME[row.process]}</td>
              <td>{row.aspect}</td>
              <td><span className={CAPABILITY_TONE[row.capability]}>{CAPABILITY_LABEL[row.capability]}</span></td>
              <td>{row.explanation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const PROCESS_NAME: Readonly<Record<AdvancedProcess, string>> = {
  Legal: 'Legal',
  Deceased: 'Deceased review',
  Dispute: 'Collection dispute',
  Complaint: 'Customer complaint',
  InsuranceClaims: 'Insurance claims',
  Restructuring: 'Restructuring',
  FieldVisit: 'Field visit',
};

const CAPABILITY_LABEL: Readonly<Record<ProcessCapability, string>> = {
  Actionable: 'Available',
  ReadOnly: 'Read-only',
  ConfigurationDependent: 'Awaiting configuration',
  Blocked: 'Awaiting QDB decision',
  Deferred: 'Deferred',
  Parked: 'Parked by QDB',
  NotKnown: 'Not known',
};

/**
 * Only an available aspect is green. Waiting states are informational rather than warnings: none is
 * something the officer did wrong or can fix.
 */
const CAPABILITY_TONE: Readonly<Record<ProcessCapability, string>> = {
  Actionable: 'pill ok',
  ReadOnly: 'pill muted',
  ConfigurationDependent: 'pill info',
  Blocked: 'pill info',
  Deferred: 'pill muted',
  Parked: 'pill muted',
  NotKnown: 'pill muted',
};
