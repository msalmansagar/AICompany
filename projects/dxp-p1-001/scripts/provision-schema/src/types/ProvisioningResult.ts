export type StepStatus = 'created' | 'skipped' | 'dry-run' | 'failed';

export interface StepResult {
  readonly name: string;
  readonly status: StepStatus;
  readonly id?: string;
  readonly message?: string;
}

export interface ValidationCheckResult {
  readonly checkName: string;
  readonly passed: boolean;
  readonly detail: string;
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
