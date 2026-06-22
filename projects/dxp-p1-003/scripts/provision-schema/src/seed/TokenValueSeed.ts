import { env } from '../config/env.js';
import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { StepResult } from '../types/ProvisioningResult.js';

const ENTITY_SET = 'qdb_token_valueses';

interface TokenValueRecord {
  readonly qdb_token_valuesid: string;
  readonly qdb_name: string;
}

interface TokenValueSeedData {
  readonly name: string;
  readonly slug: string;
  readonly cssValue: string;
  readonly locale: string | null;
  readonly renderTarget: string | null;
  readonly isDraft: boolean;
}

// 4 Arabic locale overrides for Level 1 global tokens that need RTL values
const ARABIC_LOCALE_OVERRIDES: readonly TokenValueSeedData[] = [
  {
    name: 'Text Direction — Arabic',
    slug: 'text-direction',
    cssValue: 'rtl',
    locale: 'ar',
    renderTarget: null,
    isDraft: false,
  },
  {
    name: 'Font Family Base — Arabic',
    slug: 'font-family-base',
    cssValue: "'IBM Plex Sans Arabic', 'Segoe UI', sans-serif",
    locale: 'ar',
    renderTarget: null,
    isDraft: false,
  },
  {
    name: 'Font Family Heading — Arabic',
    slug: 'font-family-heading',
    cssValue: "'IBM Plex Sans Arabic', 'Segoe UI', sans-serif",
    locale: 'ar',
    renderTarget: null,
    isDraft: false,
  },
  {
    name: 'Font Size Base — Arabic',
    slug: 'font-size-base',
    cssValue: '1.0625rem',
    locale: 'ar',
    renderTarget: null,
    isDraft: false,
  },
];

export class TokenValueSeed {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async seedAll(slugToIdMap: ReadonlyMap<string, string>): Promise<readonly StepResult[]> {
    console.log('[Phase 10] Seeding token values (Arabic locale overrides)...');
    const results: StepResult[] = [];

    for (const override of ARABIC_LOCALE_OVERRIDES) {
      const definitionId = slugToIdMap.get(override.slug);

      if (definitionId === undefined) {
        console.warn(`  [WARN] No definition found for slug '${override.slug}' — skipping value`);
        results.push({ name: override.name, status: 'skipped', message: 'definition not found' });
        continue;
      }

      const result = await this.seedValue(override, definitionId);
      results.push(result);
    }

    return results;
  }

  private async seedValue(
    data: TokenValueSeedData,
    definitionId: string,
  ): Promise<StepResult> {
    const existing = await this.findExisting(data.name);

    if (existing !== null) {
      console.log(`  [SKIP] Token value '${data.name}' already exists`);
      return { name: data.name, status: 'skipped', id: existing.qdb_token_valuesid };
    }

    if (env.DRY_RUN) {
      console.log(`  [DRY-RUN] Would seed token value '${data.name}'`);
      return { name: data.name, status: 'dry-run' };
    }

    const payload: Record<string, unknown> = {
      qdb_name: data.name,
      qdb_css_value: data.cssValue,
      qdb_is_draft: data.isDraft,
      'qdb_TokenDefinitionId@odata.bind': `/qdb_token_definitionses(${definitionId})`,
    };

    if (data.locale !== null) {
      payload['qdb_locale'] = data.locale;
    }
    if (data.renderTarget !== null) {
      payload['qdb_render_target'] = data.renderTarget;
    }

    const response = await this.http.postRaw(ENTITY_SET, payload);

    const entityId = response.headers.get('OData-EntityId') ?? '';
    const match = entityId.match(/\(([^)]+)\)$/);
    const recordId = match?.[1] ?? entityId;

    console.log(`  [OK] Seeded value '${data.name}': ${recordId}`);
    return { name: data.name, status: 'created', id: recordId };
  }

  private async findExisting(name: string): Promise<TokenValueRecord | null> {
    const escaped = name.replace(/'/g, "''");
    const result = await this.http.get<{ value: readonly TokenValueRecord[] }>(
      ENTITY_SET,
      {
        filter: `qdb_name eq '${escaped}'`,
        select: ['qdb_token_valuesid', 'qdb_name'],
        top: 1,
      },
    );
    return result?.value?.[0] ?? null;
  }
}
