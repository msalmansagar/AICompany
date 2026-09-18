/**
 * Collection settings read from the platform configuration's feature-flag bag.
 *
 * `qdb_platformconfiguration.qdb_featureflags` is a memo column holding JSON. Three Phase 2 settings
 * live there rather than in dedicated columns, because each is either provisional or a policy choice
 * that must remain QDB's:
 *
 *   - `snapshotKeyComposition` — the idempotency-key parts, in order (composition not frozen, §7.1);
 *   - `episodePolicy`          — how a closed episode may reopen (a window in days, or nothing);
 *   - `eligibilityOperation`   — the name of the Rule Engine operation that evaluates eligibility.
 *
 * None has a default. A setting the deployment has not made is reported as absent, and the caller
 * that needs it refuses to proceed. That is the same rule the rest of the platform configuration
 * follows: guessing here would be guessing QDB's policy.
 */

import { z } from 'zod';
import { EpisodePolicySchema } from './episode.js';
import { SnapshotKeyCompositionSchema } from './snapshot.js';
import { CaseNumberSourceKindSchema } from './caseNumbering.js';
import type { PlatformConfiguration } from './platformConfiguration.js';

/**
 * Names of the Rule Engine operations this deployment exposes — a Custom API on cloud, a Process
 * Action on-premises. Each is optional because a deployment may not have configured that decision
 * yet; asking for one that is unset fails closed rather than defaulting to a name that might exist.
 */
export const RuleEngineOperationsSchema = z.object({
  eligibility: z.string().min(1).optional(),
  strategy: z.string().min(1).optional(),
  contactHold: z.string().min(1).optional(),
}).strict();
export type RuleEngineOperations = z.infer<typeof RuleEngineOperationsSchema>;

export const CollectionSettingsSchema = z.object({
  snapshotKeyComposition: SnapshotKeyCompositionSchema.optional(),
  episodePolicy: EpisodePolicySchema.optional(),
  ruleEngineOperations: RuleEngineOperationsSchema.optional(),
  /** Whether DCP composes the case number or the configured QDB mechanism does (KI-49). */
  caseNumbering: CaseNumberSourceKindSchema.optional(),
}).strict();
export type CollectionSettings = z.infer<typeof CollectionSettingsSchema>;

export class CollectionSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionSettingsError';
  }
}

/**
 * Parses the Collection settings out of the feature-flag bag. Unknown flags belong to other
 * concerns and are ignored; a malformed Collection setting is an error, not a silent absence.
 */
export function readCollectionSettings(featureFlags: Record<string, unknown> | undefined): CollectionSettings {
  if (!featureFlags) return {};
  const keys = ['snapshotKeyComposition', 'episodePolicy', 'ruleEngineOperations', 'caseNumbering'] as const;
  const picked = Object.fromEntries(keys.filter(k => k in featureFlags).map(k => [k, featureFlags[k]]));
  const parsed = CollectionSettingsSchema.safeParse(picked);
  if (!parsed.success) {
    throw new CollectionSettingsError(`Collection settings in the feature flags are malformed: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Reads the settings off a resolved platform configuration. */
export function collectionSettingsOf(configuration: PlatformConfiguration): CollectionSettings {
  return readCollectionSettings(configuration.featureFlags);
}

/** Returns a required setting or explains exactly what the deployment has not configured. */
export function requireSetting<K extends keyof CollectionSettings>(
  settings: CollectionSettings,
  key: K,
  organizationCode: string,
): NonNullable<CollectionSettings[K]> {
  const value = settings[key];
  if (value === undefined) {
    throw new CollectionSettingsError(
      `Organisation ${organizationCode} has not configured '${key}' in qdb_platformconfiguration.qdb_featureflags. ` +
      'It has no default: set it before Collection synchronisation can run.',
    );
  }
  return value as NonNullable<CollectionSettings[K]>;
}
