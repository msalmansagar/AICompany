import {
  CollectionSettingsError,
  collectionSettingsOf,
  requireSetting,
  type CaseNumberSourceKind,
  type CollectionSettings,
  type CrmCallContext,
  type EpisodePolicy,
  type OrganizationCode,
  type PlatformConfiguration,
  type RuleEngineOperations,
  type SnapshotKeyComposition,
  type SnapshotPolicy,
} from '@dcp/domain';
import type { PlatformConfigurationService } from '../PlatformConfigurationService.js';

/**
 * Everything the Collection services need to run against one organisation, resolved and validated
 * once.
 *
 * `episodePolicy` and `caseNumbering` are the only two members with a stated fallback, and each
 * fallback is the conservative reading rather than a guess: no configured reopen window means a
 * re-delinquency starts a new episode, which is the rule the architecture states; no configured
 * numbering source means DCP composes the interim number, because the QDB mechanism holds no
 * configuration row to defer to (KI-49). Everything else must be configured or the organisation
 * cannot run Collection at all.
 */
export interface CollectionRuntimeConfiguration {
  platform: PlatformConfiguration;
  settings: CollectionSettings;
  snapshotPolicy: SnapshotPolicy;
  snapshotKeyComposition: SnapshotKeyComposition;
  episodePolicy: EpisodePolicy;
  caseNumbering: CaseNumberSourceKind;
  ruleEngineOperations: RuleEngineOperations;
  eligibilityRulesetCode: string;
  /** Absent until QDB confirms the strategy ruleset; a strategy decision then fails closed. */
  strategyRulesetCode?: string;
  /** Absent until QDB confirms the Contact Hold source (KI-44); a hold evaluation then fails closed. */
  contactHoldRulesetCode?: string;
}

/**
 * Assembles the Collection runtime configuration for an organisation and caches it.
 *
 * The validation here is the "no hidden defaults" rule made concrete: a missing snapshot policy,
 * eligibility ruleset or snapshot key composition stops the organisation from running rather than
 * quietly selecting one. The error names the setting and where it lives, because the person who has
 * to fix it is an administrator looking at `qdb_platformconfiguration`, not a developer reading a
 * stack trace.
 */
export class CollectionConfigurationService {
  private readonly cache = new Map<string, { value: CollectionRuntimeConfiguration; expiresAt: number }>();

  constructor(
    private readonly platformConfiguration: PlatformConfigurationService,
    private readonly options: { cacheTtlMs: number } = { cacheTtlMs: 60_000 },
  ) {}

  async get(organizationCode: OrganizationCode, _context: CrmCallContext = {}): Promise<CollectionRuntimeConfiguration> {
    const cached = this.cache.get(organizationCode);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await this.load(organizationCode);
    this.cache.set(organizationCode, { value, expiresAt: Date.now() + this.options.cacheTtlMs });
    return value;
  }

  /** Drops the cache so the next read reflects a published configuration change. */
  clearCache(): void {
    this.cache.clear();
    this.platformConfiguration.clearCache();
  }

  private async load(organizationCode: OrganizationCode): Promise<CollectionRuntimeConfiguration> {
    const platform = await this.platformConfiguration.getConfiguration(organizationCode);
    const settings = collectionSettingsOf(platform);

    if (!platform.snapshotPolicy) {
      throw new CollectionSettingsError(
        `Organisation ${organizationCode} has no snapshot policy on qdb_platformconfiguration. ` +
        'It has no default: AllReceived, EligibleOnly and ChangedOnly are materially different retention choices.');
    }
    if (!platform.eligibilityRulesetCode) {
      throw new CollectionSettingsError(
        `Organisation ${organizationCode} has no eligibility ruleset code on qdb_platformconfiguration. ` +
        'Collection synchronisation must fail closed rather than decide eligibility itself.');
    }

    return {
      platform,
      settings,
      snapshotPolicy: platform.snapshotPolicy,
      snapshotKeyComposition: requireSetting(settings, 'snapshotKeyComposition', organizationCode),
      episodePolicy: settings.episodePolicy ?? {},
      caseNumbering: settings.caseNumbering ?? 'Provisional',
      ruleEngineOperations: settings.ruleEngineOperations ?? {},
      eligibilityRulesetCode: platform.eligibilityRulesetCode,
      ...(platform.strategyRulesetCode ? { strategyRulesetCode: platform.strategyRulesetCode } : {}),
      ...(platform.contactHoldRulesetCode ? { contactHoldRulesetCode: platform.contactHoldRulesetCode } : {}),
    };
  }
}

/**
 * Returns a ruleset code the caller requires, or explains what is unconfigured.
 * Used for the two decisions whose ruleset QDB has not yet named.
 */
export function requireRulesetCode(
  configuration: CollectionRuntimeConfiguration,
  decision: 'strategy' | 'contactHold',
): string {
  const code = decision === 'strategy' ? configuration.strategyRulesetCode : configuration.contactHoldRulesetCode;
  if (!code) {
    throw new CollectionSettingsError(
      `Organisation ${configuration.platform.organizationCode} has no ${decision} ruleset code configured ` +
      `(qdb_platformconfiguration.qdb_${decision === 'strategy' ? 'strategyrulesetcode' : 'contactholdrulesetcode'}). ` +
      'The decision is refused rather than taken without a ruleset.');
  }
  return code;
}
