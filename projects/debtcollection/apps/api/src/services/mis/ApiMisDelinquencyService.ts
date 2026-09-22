import {
  MisUnavailableError,
  type ArrearBreakdown,
  type ArrearChangeBatch,
  type ArrearDetailQuery,
  type IMisDelinquencyService,
  type MisCallContext,
  type MisDelinquencyRecord,
  type MisProvider,
  type MisResponse,
  type Page,
} from '@dcp/domain';

/**
 * What a deployment must supply before this provider can be used at all.
 *
 * Every member is unknown today. They are configuration rather than constants so that confirming the
 * MIS contract is a deployment change, not a code change.
 */
export interface MisApiSettings {
  /** Base URL of the QDB MIS service. **TBD — Actual MIS Contract Required.** */
  baseUrl?: string;
  /** Path of the delinquency detail operation. **TBD.** */
  arrearDetailsPath?: string;
  /** Path of the facility position operation. **TBD.** */
  facilityPositionPath?: string;
  /** Path of the aggregate breakdown operation. **TBD.** */
  breakdownPath?: string;
  /** Path of the changed-since operation, if MIS offers one at all. **TBD.** */
  changesPath?: string;
  /** Maximum page size MIS will honour. **TBD** — not guessed, because guessing it wastes a run. */
  maxPageSize?: number;
  requestTimeoutMs?: number;
}

/**
 * The QDB MIS provider — **a boundary, not an implementation.**
 *
 * `docs/MISContractEvidence.md` records the search that produced this class: this repository, the
 * wider AICompany repository and `D:/QDB/Projects` were inspected, and **no MIS API exists in
 * evidence anywhere** — no endpoint, no schema, no auth, no paging mechanism, no change feed. The
 * only MIS evidence that exists is two spreadsheet exports.
 *
 * So this class refuses. Every method fails closed with `NotConfigured` and says exactly what QDB
 * must supply. That is deliberate and is the whole point:
 *
 *   • an invented endpoint would be **indistinguishable from a real one** in the code, and would
 *     quietly become the contract;
 *   • a provider that returned plausible data would let Phase 4 report a green runtime result that
 *     proves nothing;
 *   • a refusal is visible, is logged, and costs one adapter class to replace when the contract lands.
 *
 * The interface, the normalization model, the paging abstraction and the mock provider are all real
 * and tested. This is the one piece that cannot be, and it says so rather than pretending.
 */
export class ApiMisDelinquencyService implements IMisDelinquencyService {
  readonly provider: MisProvider = 'Api';

  constructor(private readonly settings: MisApiSettings = {}) {}

  /** @inheritdoc */
  async getArrearDetails(_query: ArrearDetailQuery, _context?: MisCallContext): Promise<MisResponse<Page<MisDelinquencyRecord>>> {
    throw this.refuse('arrear details', 'arrearDetailsPath');
  }

  /** @inheritdoc */
  async getFacilityArrearPosition(
    _facility: { facilityNumber: string; sourceSystem: string },
    _context?: MisCallContext,
  ): Promise<MisResponse<MisDelinquencyRecord | null>> {
    throw this.refuse('facility arrear position', 'facilityPositionPath');
  }

  /** @inheritdoc */
  async getArrearBreakdown(_context?: MisCallContext): Promise<MisResponse<ArrearBreakdown>> {
    throw this.refuse('arrear breakdown', 'breakdownPath');
  }

  /** @inheritdoc */
  async getArrearChanges(
    _checkpoint: string | undefined,
    _pageSize: number,
    _context?: MisCallContext,
  ): Promise<MisResponse<ArrearChangeBatch>> {
    throw this.refuse('changed-since feed', 'changesPath');
  }

  /** @inheritdoc */
  async health(): Promise<{ provider: MisProvider; reachable: boolean; detail?: string }> {
    return {
      provider: this.provider,
      reachable: false,
      detail: 'TBD — Actual MIS Contract Required. No QDB MIS endpoint, schema, authentication, ' +
        'paging mechanism or change feed is in evidence; see docs/MISContractEvidence.md.',
    };
  }

  private refuse(operation: string, setting: keyof MisApiSettings): MisUnavailableError {
    const configured = this.settings[setting] !== undefined && this.settings.baseUrl !== undefined;
    return new MisUnavailableError(
      configured
        ? `The MIS ${operation} endpoint is configured, but its request and response contract has not been ` +
          'confirmed by QDB, so this provider will not call it. Confirm the contract, then implement this ' +
          'method against it. TBD — Actual MIS Contract Required.'
        : `MIS ${operation} is unavailable: this deployment has no confirmed QDB MIS contract ` +
          `(qdb_platformconfiguration MIS settings, '${String(setting)}' and baseUrl). No endpoint, schema, ` +
          'authentication, paging mechanism or change feed is in evidence — see docs/MISContractEvidence.md. ' +
          'TBD — Actual MIS Contract Required.',
      'NotConfigured');
  }
}
