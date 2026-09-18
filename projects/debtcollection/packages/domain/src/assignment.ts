/**
 * Assignment configuration and the Smart Assignment seam.
 *
 * QDB is understood to have a Smart Assignment capability. No artefact, contract or organisation
 * evidence for it has been found in this repository or under the QDB project folder (KI-09), so this
 * module does two things and deliberately not a third:
 *
 *   1. models `qdb_assignmentconfiguration` — the rows that say which queue, team or method treats a
 *      case, with the same activation and effective-date discipline as strategy configuration;
 *   2. defines `IAssignmentEngine`, the facade a Smart Assignment adapter will implement;
 *   3. does **not** implement a routing algorithm. `UnavailableSmartAssignment` fails closed and says
 *      exactly what is missing. Building a second assignment engine is what the Master Prompt forbids
 *      and what a plausible-looking round-robin here would quietly become.
 */

import { z } from 'zod';
import { EffectivePeriodSchema, isEffective, type EffectivePeriod } from './strategy.js';

/** How a case is assigned. Exactly the provisioned `qdb_assignment_method` choice — not a superset. */
export const AssignmentMethodSchema = z.enum(['RoundRobin', 'Load', 'Territory', 'SmartAssignment', 'Manual']);
export type AssignmentMethod = z.infer<typeof AssignmentMethodSchema>;

export const AssignmentConfigurationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  method: AssignmentMethodSchema,
  priority: z.number().int(),
  effective: EffectivePeriodSchema,
  isActive: z.boolean(),
  /** Segmentation columns the ruleset or the Smart Assignment service may read. Never evaluated here. */
  customerType: z.string().optional(),
  productType: z.string().optional(),
  region: z.string().optional(),
  riskLevel: z.string().optional(),
  legalStatus: z.string().optional(),
  slaHours: z.number().int().optional(),
  /** Opaque handle the Smart Assignment capability understands. DCP passes it through, unread. */
  smartAssignmentRef: z.string().optional(),
});
export type AssignmentConfiguration = z.infer<typeof AssignmentConfigurationSchema>;

/** Where a case ended up. `queueName` is a name, never a GUID (Article V). */
export const AssignmentOutcomeSchema = z.object({
  method: AssignmentMethodSchema,
  queueName: z.string().optional(),
  teamName: z.string().optional(),
  userId: z.string().uuid().optional(),
  configurationId: z.string().uuid().optional(),
  slaHours: z.number().int().optional(),
  reason: z.string().max(500).optional(),
});
export type AssignmentOutcome = z.infer<typeof AssignmentOutcomeSchema>;

export interface AssignmentInput {
  case: {
    id?: string;
    facilityNumber: string;
    sourceSystem: string;
    organizationCode: string;
    dpd?: number;
    arrearBucket?: string;
    totalArrears?: number;
  };
  configuration: AssignmentConfiguration;
}

export class AssignmentError extends Error {
  constructor(message: string, readonly kind: 'NoneApplicable' | 'Conflict' | 'Unavailable') {
    super(message);
    this.name = 'AssignmentError';
  }
}

/** The seam a Smart Assignment adapter implements. */
export interface IAssignmentEngine {
  assign(input: AssignmentInput, context?: { correlationId?: string }): Promise<AssignmentOutcome>;
}

/**
 * The honest placeholder: QDB's Smart Assignment contract has not been located, so this refuses
 * rather than routing. It is wired in wherever the configuration asks for `SmartAssignment`, so a
 * deployment that selects it gets a clear, actionable failure instead of silent mis-assignment.
 */
export class UnavailableSmartAssignment implements IAssignmentEngine {
  async assign(input: AssignmentInput): Promise<AssignmentOutcome> {
    throw new AssignmentError(
      `Assignment configuration '${input.configuration.name}' selects SmartAssignment, but QDB's Smart Assignment ` +
      'contract has not been supplied (KI-09). No routing is performed and none is invented: confirm the ' +
      'capability and its contract, then implement IAssignmentEngine against it.',
      'Unavailable',
    );
  }
}

/**
 * Resolves the assignment configuration that applies: active, effective, lowest priority wins, and a
 * tie is a conflict rather than a coin toss. Which *cases* a configuration covers is decided by the
 * Rule Engine or by Smart Assignment — not by evaluating the segmentation columns here.
 */
export function resolveAssignmentConfiguration(
  configured: readonly AssignmentConfiguration[],
  asOf: string,
): AssignmentConfiguration {
  const usable = configured.filter(c => c.isActive && isEffective(c.effective, asOf));
  if (usable.length === 0) {
    throw new AssignmentError('No active, effective assignment configuration exists for this organisation', 'NoneApplicable');
  }
  const topPriority = Math.min(...usable.map(c => c.priority));
  const winners = usable.filter(c => c.priority === topPriority);
  if (winners.length > 1) {
    throw new AssignmentError(
      `${winners.length} assignment configurations share priority ${topPriority}; the configuration cannot say which applies`,
      'Conflict',
    );
  }
  return winners[0]!;
}

export { isEffective, type EffectivePeriod };
