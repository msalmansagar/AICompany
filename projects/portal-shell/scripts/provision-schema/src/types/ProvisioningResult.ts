// Typed result shapes for each provisioning phase step.
// Every provisioner returns one of these shapes — no void returns.

export type StepStatus = 'created' | 'skipped' | 'dry-run' | 'failed';

export interface StepResult {
  readonly name: string;
  readonly status: StepStatus;
  readonly id?: string;
  readonly message?: string;
}

export interface PhaseResult {
  readonly phase: number;
  readonly name: string;
  readonly steps: readonly StepResult[];
  readonly durationMs: number;
}

export interface CheckResult {
  readonly passed: boolean;
  readonly message: string;
  readonly detail?: unknown;
}

export interface ValidationCheckResult {
  readonly checkName: string;
  readonly passed: boolean;
  readonly detail: string;
}

// Sentinel type returned by DRY_RUN skips on POST operations
export interface DryRunResult {
  readonly dryRun: true;
  readonly wouldCreate: string;
}

export type PublisherCheckResult =
  | { readonly found: true; readonly publisherId: string; readonly prefix: string }
  | { readonly found: false; readonly created: true; readonly publisherId: string }
  | { readonly found: false; readonly created: false; readonly dryRun: true; readonly mockPublisherId: string };

export interface ExistingSolutionSnapshot {
  readonly solutionId: string;
  readonly uniqueName: string;
  readonly version: string;
  readonly componentCount: number;
}
