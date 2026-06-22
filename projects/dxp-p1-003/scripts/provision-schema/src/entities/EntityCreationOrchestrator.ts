import type { EntityProvisioner } from './EntityProvisioner.js';
import { TOKEN_DEFINITIONS_ENTITY, TOKEN_VALUES_ENTITY } from './definitions/tokenEntities.js';
import type { StepResult } from '../types/ProvisioningResult.js';

export class EntityCreationOrchestrator {
  private readonly entityProvisioner: EntityProvisioner;

  constructor(entityProvisioner: EntityProvisioner) {
    this.entityProvisioner = entityProvisioner;
  }

  async provisionAll(): Promise<readonly StepResult[]> {
    console.log('[Phase 6] Provisioning entities...');

    const tokenDefinitionsResult = await this.entityProvisioner.ensureEntityExists(
      TOKEN_DEFINITIONS_ENTITY,
    );

    const tokenValuesResult = await this.entityProvisioner.ensureEntityExists(
      TOKEN_VALUES_ENTITY,
    );

    return [tokenDefinitionsResult, tokenValuesResult];
  }
}
