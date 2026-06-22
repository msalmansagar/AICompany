import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ValidationCheckResult } from '../types/ProvisioningResult.js';

const REQUIRED_OPTION_SETS = ['qdb_token_type', 'qdb_token_level', 'qdb_token_category'] as const;
const REQUIRED_ENTITIES = ['qdb_token_definitions', 'qdb_token_values'] as const;
const RELATIONSHIP_SCHEMA_NAME = 'qdb_tokendefinition_values';
const ALT_KEY_SCHEMA_NAME = 'qdb_TokenDefinitionSlugKey';
const EXPECTED_DEFINITION_COUNT = 27;
const EXPECTED_ARABIC_VALUE_COUNT = 4;
const GUARD_SOLUTIONS = ['QdbPortalShell', 'QdbDynamicFormEngine'] as const;

interface EntityRecord {
  readonly MetadataId: string;
  readonly SchemaName: string;
}

interface OptionSetRecord {
  readonly MetadataId: string;
  readonly Name: string;
}

interface RelationshipRecord {
  readonly MetadataId: string;
  readonly SchemaName: string;
}

interface AlternateKeyRecord {
  readonly MetadataId: string;
  readonly SchemaName: string;
}

interface SolutionRecord {
  readonly solutionid: string;
  readonly uniquename: string;
}

interface CountCollection {
  readonly value: readonly unknown[];
}

export class PostProvisioningValidator {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async runAll(): Promise<readonly ValidationCheckResult[]> {
    console.log('[Phase 11] Running post-provisioning validation...');

    const checks = await Promise.all([
      this.checkOptionSets(),
      this.checkEntities(),
      this.checkRelationship(),
      this.checkAlternateKey(),
      this.checkDefinitionCount(),
      this.checkArabicValueCount(),
      this.checkSnapshotGuard(),
    ]);

    return checks.flat();
  }

  private async checkOptionSets(): Promise<ValidationCheckResult[]> {
    const result = await this.http.get<{ value: readonly OptionSetRecord[] }>(
      'GlobalOptionSetDefinitions',
      { select: ['MetadataId', 'Name'] },
    );
    const existingNames = new Set((result?.value ?? []).map((os) => os.Name));

    return REQUIRED_OPTION_SETS.map((name) => ({
      checkName: `option-set:${name}`,
      passed: existingNames.has(name),
      detail: existingNames.has(name) ? `Found '${name}'` : `MISSING: '${name}' not found`,
    }));
  }

  private async checkEntities(): Promise<ValidationCheckResult[]> {
    const results: ValidationCheckResult[] = [];

    for (const schemaName of REQUIRED_ENTITIES) {
      const result = await this.http.get<{ value: readonly EntityRecord[] }>(
        'EntityDefinitions',
        {
          filter: `SchemaName eq '${schemaName}'`,
          select: ['MetadataId', 'SchemaName'],
          top: 1,
        },
      );

      const found = (result?.value?.length ?? 0) > 0;
      results.push({
        checkName: `entity:${schemaName}`,
        passed: found,
        detail: found ? `Found '${schemaName}'` : `MISSING: '${schemaName}' not found`,
      });
    }

    return results;
  }

  private async checkRelationship(): Promise<ValidationCheckResult[]> {
    const result = await this.http.get<{ value: readonly RelationshipRecord[] }>(
      'RelationshipDefinitions',
      {
        filter: `SchemaName eq '${RELATIONSHIP_SCHEMA_NAME}'`,
        select: ['MetadataId', 'SchemaName'],
        top: 1,
      },
    );

    const found = (result?.value?.length ?? 0) > 0;
    return [{
      checkName: `relationship:${RELATIONSHIP_SCHEMA_NAME}`,
      passed: found,
      detail: found ? `Found '${RELATIONSHIP_SCHEMA_NAME}'` : `MISSING: '${RELATIONSHIP_SCHEMA_NAME}' not found`,
    }];
  }

  private async checkAlternateKey(): Promise<ValidationCheckResult[]> {
    const result = await this.http.get<{ value: readonly AlternateKeyRecord[] }>(
      "EntityDefinitions(LogicalName='qdb_token_definitions')/Keys",
      { select: ['MetadataId', 'SchemaName'] },
    );

    const found = (result?.value ?? []).some((k) => k.SchemaName === ALT_KEY_SCHEMA_NAME);
    return [{
      checkName: `alternate-key:${ALT_KEY_SCHEMA_NAME}`,
      passed: found,
      detail: found ? `Found '${ALT_KEY_SCHEMA_NAME}'` : `MISSING: '${ALT_KEY_SCHEMA_NAME}' not found on qdb_token_definitions`,
    }];
  }

  private async checkDefinitionCount(): Promise<ValidationCheckResult[]> {
    const result = await this.http.get<CountCollection>(
      'qdb_token_definitionses',
      { select: ['qdb_token_definitionsid'], top: 100 },
    );

    const count = result?.value?.length ?? 0;
    const passed = count >= EXPECTED_DEFINITION_COUNT;
    return [{
      checkName: 'seed:token-definitions-count',
      passed,
      detail: passed
        ? `Found ${count} token definitions (expected ≥ ${EXPECTED_DEFINITION_COUNT})`
        : `Only ${count} definitions found — expected ≥ ${EXPECTED_DEFINITION_COUNT}`,
    }];
  }

  private async checkArabicValueCount(): Promise<ValidationCheckResult[]> {
    const result = await this.http.get<CountCollection>(
      'qdb_token_valueses',
      {
        filter: "qdb_locale eq 'ar'",
        select: ['qdb_token_valuesid'],
        top: 20,
      },
    );

    const count = result?.value?.length ?? 0;
    const passed = count >= EXPECTED_ARABIC_VALUE_COUNT;
    return [{
      checkName: 'seed:arabic-locale-values-count',
      passed,
      detail: passed
        ? `Found ${count} Arabic locale values (expected ≥ ${EXPECTED_ARABIC_VALUE_COUNT})`
        : `Only ${count} Arabic values found — expected ≥ ${EXPECTED_ARABIC_VALUE_COUNT}`,
    }];
  }

  private async checkSnapshotGuard(): Promise<ValidationCheckResult[]> {
    const results: ValidationCheckResult[] = [];

    for (const uniqueName of GUARD_SOLUTIONS) {
      const result = await this.http.get<{ value: readonly SolutionRecord[] }>(
        'solutions',
        {
          filter: `uniquename eq '${uniqueName}'`,
          select: ['solutionid', 'uniquename'],
          top: 1,
        },
      );

      const found = (result?.value?.length ?? 0) > 0;
      results.push({
        checkName: `snapshot-guard:${uniqueName}`,
        passed: found,
        detail: found
          ? `Solution '${uniqueName}' found — snapshot guard satisfied`
          : `WARNING: Solution '${uniqueName}' not found — snapshot guard will fail at publish`,
      });
    }

    return results;
  }
}
