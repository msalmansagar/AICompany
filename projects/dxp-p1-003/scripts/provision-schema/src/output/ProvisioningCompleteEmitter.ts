import type { StepResult, ValidationCheckResult } from '../types/ProvisioningResult.js';

export interface ProvisioningReport {
  readonly publisher: string;
  readonly solution: StepResult;
  readonly optionSets: readonly StepResult[];
  readonly entities: readonly StepResult[];
  readonly relationship: StepResult;
  readonly alternateKey: StepResult;
  readonly seedDefinitions: readonly StepResult[];
  readonly seedValues: readonly StepResult[];
  readonly validationChecks: readonly ValidationCheckResult[];
  readonly durationMs: number;
  readonly dryRun: boolean;
}

export class ProvisioningCompleteEmitter {
  emit(report: ProvisioningReport): void {
    const allValidationsPassed = report.validationChecks.every((c) => c.passed);
    const failedChecks = report.validationChecks.filter((c) => !c.passed);

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  DXP-P1-003 Schema Provisioning Complete');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Mode    : ${report.dryRun ? 'DRY RUN (no changes made)' : 'LIVE'}`);
    console.log(`  Duration: ${(report.durationMs / 1000).toFixed(1)}s`);
    console.log('');
    console.log('  Option Sets');
    this.printStepResults(report.optionSets);
    console.log('');
    console.log('  Entities');
    this.printStepResults(report.entities);
    console.log('');
    console.log('  Relationship');
    this.printStepResults([report.relationship]);
    console.log('');
    console.log('  Alternate Key');
    this.printStepResults([report.alternateKey]);
    console.log('');
    console.log('  Seed — Token Definitions');
    this.printSeedSummary(report.seedDefinitions);
    console.log('');
    console.log('  Seed — Token Values');
    this.printSeedSummary(report.seedValues);
    console.log('');
    console.log('  Post-Provisioning Validation');
    for (const check of report.validationChecks) {
      const icon = check.passed ? '✓' : '✗';
      console.log(`    ${icon} ${check.checkName}: ${check.detail}`);
    }
    console.log('');

    if (allValidationsPassed) {
      console.log('  STATUS: ALL CHECKS PASSED — ready for staging integration tests');
    } else {
      console.log(`  STATUS: ${failedChecks.length} VALIDATION FAILURE(S)`);
      for (const check of failedChecks) {
        console.log(`    ✗ ${check.checkName}: ${check.detail}`);
      }
      console.log('');
      console.log('  ACTION REQUIRED: Fix failures before running integration tests');
      process.exitCode = 1;
    }

    console.log('═══════════════════════════════════════════════════════');
  }

  private printStepResults(steps: readonly StepResult[]): void {
    for (const step of steps) {
      const icon = step.status === 'created' ? '+' : step.status === 'skipped' ? '=' : step.status === 'dry-run' ? '~' : '✗';
      const idSuffix = step.id ? ` (${step.id})` : '';
      console.log(`    [${icon}] ${step.name}${idSuffix}`);
    }
  }

  private printSeedSummary(steps: readonly StepResult[]): void {
    const created = steps.filter((s) => s.status === 'created').length;
    const skipped = steps.filter((s) => s.status === 'skipped').length;
    const dryRun = steps.filter((s) => s.status === 'dry-run').length;
    const failed = steps.filter((s) => s.status === 'failed').length;
    console.log(`    created=${created}  skipped=${skipped}  dry-run=${dryRun}  failed=${failed}  total=${steps.length}`);
  }
}
