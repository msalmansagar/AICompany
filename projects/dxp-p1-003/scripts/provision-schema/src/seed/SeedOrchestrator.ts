import type { TokenDefinitionSeed } from './TokenDefinitionSeed.js';
import type { TokenValueSeed } from './TokenValueSeed.js';
import type { StepResult } from '../types/ProvisioningResult.js';

export interface SeedResults {
  readonly definitions: readonly StepResult[];
  readonly values: readonly StepResult[];
}

export class SeedOrchestrator {
  private readonly tokenDefinitionSeed: TokenDefinitionSeed;
  private readonly tokenValueSeed: TokenValueSeed;

  constructor(tokenDefinitionSeed: TokenDefinitionSeed, tokenValueSeed: TokenValueSeed) {
    this.tokenDefinitionSeed = tokenDefinitionSeed;
    this.tokenValueSeed = tokenValueSeed;
  }

  async seedAll(): Promise<SeedResults> {
    const definitions = await this.tokenDefinitionSeed.seedAll();
    const slugToIdMap = await this.tokenDefinitionSeed.fetchSlugToIdMap();
    const values = await this.tokenValueSeed.seedAll(slugToIdMap);
    return { definitions, values };
  }
}
