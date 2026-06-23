import { env } from '../config/env.js';
import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { StepResult } from '../types/ProvisioningResult.js';

interface TokenDefinitionRecord {
  readonly qdb_token_definitionsid: string;
  readonly qdb_slug: string;
}

interface TokenDefinitionSeedData {
  readonly slug: string;
  readonly name: string;
  readonly cssVariable: string;
  readonly tokenType: number;
  readonly tokenLevel: number;
  readonly tokenCategory: number | null;
  readonly defaultValue: string;
  readonly description: string;
}

const ENTITY_SET = 'qdb_token_definitionses';

// token_type codes: color=860005001, font-family=860005002, font-size=860005003,
//   font-weight=860005004, spacing=860005005, border-radius=860005006, shadow=860005007, direction=860005008
// token_level codes: global=860005011, render-target=860005012, category=860005013, component=860005014, service=860005015
// token_category: widget=860005021, form=860005022, nav=860005023, layout=860005024, data-display=860005025

const SEED_DEFINITIONS: readonly TokenDefinitionSeedData[] = [
  // Colors — global (Level 1)
  { slug: 'color-primary', name: 'Color Primary', cssVariable: '--qdb-color-primary', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#0057A8', description: 'Brand primary color' },
  { slug: 'color-secondary', name: 'Color Secondary', cssVariable: '--qdb-color-secondary', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#00395E', description: 'Brand secondary color' },
  { slug: 'color-accent', name: 'Color Accent', cssVariable: '--qdb-color-accent', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#F5A623', description: 'Brand accent color' },
  { slug: 'color-surface', name: 'Color Surface', cssVariable: '--qdb-color-surface', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#FFFFFF', description: 'Default surface background' },
  { slug: 'color-surface-alt', name: 'Color Surface Alt', cssVariable: '--qdb-color-surface-alt', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#F4F7FB', description: 'Alternate surface background' },
  { slug: 'color-text-primary', name: 'Color Text Primary', cssVariable: '--qdb-color-text-primary', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#1A1A2E', description: 'Primary body text color' },
  { slug: 'color-text-secondary', name: 'Color Text Secondary', cssVariable: '--qdb-color-text-secondary', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#6B7280', description: 'Secondary and helper text color' },
  { slug: 'color-border', name: 'Color Border', cssVariable: '--qdb-color-border', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#E2E8F0', description: 'Default border color' },
  { slug: 'color-error', name: 'Color Error', cssVariable: '--qdb-color-error', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#DC2626', description: 'Error state color' },
  { slug: 'color-success', name: 'Color Success', cssVariable: '--qdb-color-success', tokenType: 860005001, tokenLevel: 860005011, tokenCategory: null, defaultValue: '#16A34A', description: 'Success state color' },
  // Typography — global (Level 1)
  { slug: 'font-family-base', name: 'Font Family Base', cssVariable: '--qdb-font-family-base', tokenType: 860005002, tokenLevel: 860005011, tokenCategory: null, defaultValue: "'Inter', 'Segoe UI', sans-serif", description: 'Base body font family stack' },
  { slug: 'font-family-heading', name: 'Font Family Heading', cssVariable: '--qdb-font-family-heading', tokenType: 860005002, tokenLevel: 860005011, tokenCategory: null, defaultValue: "'Inter', 'Segoe UI', sans-serif", description: 'Heading font family stack' },
  { slug: 'font-size-sm', name: 'Font Size Small', cssVariable: '--qdb-font-size-sm', tokenType: 860005003, tokenLevel: 860005011, tokenCategory: null, defaultValue: '0.875rem', description: 'Small text size' },
  { slug: 'font-size-base', name: 'Font Size Base', cssVariable: '--qdb-font-size-base', tokenType: 860005003, tokenLevel: 860005011, tokenCategory: null, defaultValue: '1rem', description: 'Base body text size' },
  { slug: 'font-size-lg', name: 'Font Size Large', cssVariable: '--qdb-font-size-lg', tokenType: 860005003, tokenLevel: 860005011, tokenCategory: null, defaultValue: '1.125rem', description: 'Large text size' },
  { slug: 'font-size-xl', name: 'Font Size XL', cssVariable: '--qdb-font-size-xl', tokenType: 860005003, tokenLevel: 860005011, tokenCategory: null, defaultValue: '1.25rem', description: 'Extra large text size' },
  { slug: 'font-weight-normal', name: 'Font Weight Normal', cssVariable: '--qdb-font-weight-normal', tokenType: 860005004, tokenLevel: 860005011, tokenCategory: null, defaultValue: '400', description: 'Normal font weight' },
  { slug: 'font-weight-medium', name: 'Font Weight Medium', cssVariable: '--qdb-font-weight-medium', tokenType: 860005004, tokenLevel: 860005011, tokenCategory: null, defaultValue: '500', description: 'Medium font weight' },
  { slug: 'font-weight-bold', name: 'Font Weight Bold', cssVariable: '--qdb-font-weight-bold', tokenType: 860005004, tokenLevel: 860005011, tokenCategory: null, defaultValue: '700', description: 'Bold font weight' },
  // Spacing — global (Level 1)
  { slug: 'spacing-xs', name: 'Spacing XS', cssVariable: '--qdb-spacing-xs', tokenType: 860005005, tokenLevel: 860005011, tokenCategory: null, defaultValue: '0.25rem', description: 'Extra small spacing unit' },
  { slug: 'spacing-sm', name: 'Spacing SM', cssVariable: '--qdb-spacing-sm', tokenType: 860005005, tokenLevel: 860005011, tokenCategory: null, defaultValue: '0.5rem', description: 'Small spacing unit' },
  { slug: 'spacing-md', name: 'Spacing MD', cssVariable: '--qdb-spacing-md', tokenType: 860005005, tokenLevel: 860005011, tokenCategory: null, defaultValue: '1rem', description: 'Medium spacing unit' },
  { slug: 'spacing-lg', name: 'Spacing LG', cssVariable: '--qdb-spacing-lg', tokenType: 860005005, tokenLevel: 860005011, tokenCategory: null, defaultValue: '1.5rem', description: 'Large spacing unit' },
  // Border radius — global (Level 1)
  { slug: 'border-radius-sm', name: 'Border Radius SM', cssVariable: '--qdb-border-radius-sm', tokenType: 860005006, tokenLevel: 860005011, tokenCategory: null, defaultValue: '0.25rem', description: 'Small border radius' },
  { slug: 'border-radius-md', name: 'Border Radius MD', cssVariable: '--qdb-border-radius-md', tokenType: 860005006, tokenLevel: 860005011, tokenCategory: null, defaultValue: '0.5rem', description: 'Medium border radius' },
  // Direction — global (Level 1)
  { slug: 'text-direction', name: 'Text Direction', cssVariable: '--qdb-text-direction', tokenType: 860005008, tokenLevel: 860005011, tokenCategory: null, defaultValue: 'ltr', description: 'Document text direction (ltr or rtl)' },
  // Shadow — global (Level 1)
  { slug: 'shadow-card', name: 'Shadow Card', cssVariable: '--qdb-shadow-card', tokenType: 860005007, tokenLevel: 860005011, tokenCategory: null, defaultValue: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)', description: 'Default card shadow' },
];

export class TokenDefinitionSeed {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async seedAll(): Promise<readonly StepResult[]> {
    console.log('[Phase 9] Seeding token definitions...');
    const results: StepResult[] = [];

    for (const definition of SEED_DEFINITIONS) {
      const result = await this.seedDefinition(definition);
      results.push(result);
    }

    return results;
  }

  private async seedDefinition(data: TokenDefinitionSeedData): Promise<StepResult> {
    const existing = await this.findBySlug(data.slug);

    if (existing !== null) {
      console.log(`  [SKIP] Token definition '${data.slug}' already exists`);
      return { name: data.slug, status: 'skipped', id: existing.qdb_token_definitionsid };
    }

    if (env.DRY_RUN) {
      console.log(`  [DRY-RUN] Would seed token definition '${data.slug}'`);
      return { name: data.slug, status: 'dry-run' };
    }

    const payload: Record<string, unknown> = {
      qdb_name: data.name,
      qdb_slug: data.slug,
      qdb_css_variable: data.cssVariable,
      qdb_token_type: data.tokenType,
      qdb_token_level: data.tokenLevel,
      qdb_default_value: data.defaultValue,
      qdb_description: data.description,
      qdb_is_active: true,
    };

    if (data.tokenCategory !== null) {
      payload['qdb_token_category'] = data.tokenCategory;
    }

    const response = await this.http.postRaw(ENTITY_SET, payload);

    const entityId = response.headers.get('OData-EntityId') ?? '';
    const match = entityId.match(/\(([^)]+)\)$/);
    const recordId = match?.[1] ?? entityId;

    console.log(`  [OK] Seeded '${data.slug}': ${recordId}`);
    return { name: data.slug, status: 'created', id: recordId };
  }

  private async findBySlug(slug: string): Promise<TokenDefinitionRecord | null> {
    const result = await this.http.get<{ value: readonly TokenDefinitionRecord[] }>(
      ENTITY_SET,
      {
        filter: `qdb_slug eq '${slug}'`,
        select: ['qdb_token_definitionsid', 'qdb_slug'],
        top: 1,
      },
    );
    return result?.value?.[0] ?? null;
  }

  async fetchSlugToIdMap(): Promise<ReadonlyMap<string, string>> {
    const result = await this.http.get<{ value: readonly TokenDefinitionRecord[] }>(
      ENTITY_SET,
      { select: ['qdb_token_definitionsid', 'qdb_slug'] },
    );
    return new Map(
      (result?.value ?? []).map((r) => [r.qdb_slug, r.qdb_token_definitionsid]),
    );
  }
}
