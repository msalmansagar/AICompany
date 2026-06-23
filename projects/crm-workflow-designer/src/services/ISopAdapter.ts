// src/services/ISopAdapter.ts
import type { ICrmAdapter } from './ICrmAdapter';
import type {
  CrmRole,
  Sop,
  SopStep,
  SopOutcome,
  SopSummary,
  CreateRoleRequest,
  UpdateRoleRequest,
  CreateSopRequest,
  UpdateSopRequest,
  CreateSopStepRequest,
  UpdateSopStepRequest,
  CreateSopOutcomeRequest,
  UpdateSopOutcomeRequest,
  CreateProcessFromSopRequest,
} from '@/types/SopTypes';

/**
 * Extends the base CRM adapter with SOP-domain operations.
 * Implemented by both DataverseAdapter (Xrm.WebApi) and ODataAdapter (fetch/proxy),
 * so the SOP Designer is available in local dev mode and in the CRM iframe.
 */
export interface ISopAdapter extends ICrmAdapter {
  // --- Roles ---
  getRoles(search?: string): Promise<CrmRole[]>;
  createRole(data: CreateRoleRequest): Promise<string>;
  updateRole(id: string, data: UpdateRoleRequest): Promise<void>;
  deleteRole(id: string): Promise<void>;

  // --- SOPs ---
  getSopList(): Promise<SopSummary[]>;
  getSop(id: string): Promise<Sop>;
  createSop(data: CreateSopRequest): Promise<string>;
  updateSop(id: string, data: UpdateSopRequest): Promise<void>;

  // --- SOP Steps ---
  getSopSteps(sopId: string): Promise<SopStep[]>;
  createSopStep(data: CreateSopStepRequest): Promise<string>;
  updateSopStep(id: string, data: UpdateSopStepRequest): Promise<void>;
  deleteSopStep(id: string): Promise<void>;

  // --- SOP Outcomes ---
  getSopOutcomes(sopStepId: string): Promise<SopOutcome[]>;
  createSopOutcome(data: CreateSopOutcomeRequest): Promise<string>;
  updateSopOutcome(id: string, data: UpdateSopOutcomeRequest): Promise<void>;
  deleteSopOutcome(id: string): Promise<void>;

  // --- Derivation ---
  /** Calls qdb_CreateProcessFromSop Custom API. Returns the new processId. */
  createProcessFromSop(request: CreateProcessFromSopRequest): Promise<string>;
}

/** Type guard — runtime check that an ICrmAdapter is also an ISopAdapter. */
export function isSopAdapter(adapter: ICrmAdapter): adapter is ISopAdapter {
  return (
    typeof (adapter as ISopAdapter).getSopList === 'function' &&
    typeof (adapter as ISopAdapter).createProcessFromSop === 'function'
  );
}
