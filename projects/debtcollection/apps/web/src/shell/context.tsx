import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CrmContext } from '../platform/crmContext.js';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { IReportingService } from '../reporting/ReportingService.js';
import type { RoleKey } from './routes.js';

/**
 * What the workspace knows about where it is and who is using it.
 *
 * Three separate contexts rather than one, because they change on different clocks: the CRM context
 * is fixed for the session, the organisation changes when the user switches between Housing Loan and
 * BFD, and the role changes only in the prototype's role switcher.
 */

// ── CRM session ──────────────────────────────────────────────────────────────

export interface CrmSession {
  context: CrmContext;
  adapter: XrmCrmAdapter;
  /**
   * The Report Engine, reached as the same signed-in user. Optional so a session built without one
   * — a component under test, or a host with no Custom API — leaves the operational workspace whole
   * and the reporting screens saying the service is unavailable, never a blank or a zero.
   */
  reporting?: IReportingService;
}

const CrmSessionContext = createContext<CrmSession | null>(null);

export function CrmSessionProvider({ value, children }: { value: CrmSession; children: ReactNode }) {
  return <CrmSessionContext.Provider value={value}>{children}</CrmSessionContext.Provider>;
}

export function useCrmSession(): CrmSession {
  const session = useContext(CrmSessionContext);
  if (!session) {
    throw new Error('useCrmSession was called outside CrmSessionProvider — the workspace has no CRM session.');
  }
  return session;
}

/** The reporting service, or one that answers "unavailable" to everything when the session has none. */
export function useReportingService(): IReportingService {
  const { reporting } = useCrmSession();
  return reporting ?? UNAVAILABLE_REPORTING;
}

const UNAVAILABLE_REPORTING: IReportingService = {
  runReport: async () => ({ status: 'unavailable', message: 'The reporting service is not part of this session.' }),
  runDashboard: async () => ({ status: 'unavailable', message: 'The reporting service is not part of this session.' }),
};

// ── Organisation: one workspace, two CRMs ────────────────────────────────────

/**
 * The organisation whose records are being read.
 *
 * `all` is the prototype's default and its defining behaviour: cases from Housing Loan and BFD appear
 * together, with a badge on each row naming the system of record. The customer master differs between
 * them — contact for HL, account for BFD — and that mapping comes from
 * `qdb_platformconfiguration`, never from a constant in this application.
 */
export type OrganizationScope = 'all' | 'HL' | 'BFD';

export interface OrgContextValue {
  scope: OrganizationScope;
  setScope: (scope: OrganizationScope) => void;
  /** Filter fragment for the active scope, applied **by the source**. Empty when both are in scope. */
  scopeFilter: string | undefined;
}

const OrgContext = createContext<OrgContextValue | null>(null);

/** Choice values as provisioned under the `qdb` publisher; the binding, not a business rule. */
const ORGANIZATION_CODE_VALUES: Readonly<Record<'HL' | 'BFD', number>> = { HL: 100000140, BFD: 100000141 };

export function OrgProvider({ children, initial = 'all' }: { children: ReactNode; initial?: OrganizationScope }) {
  const [scope, setScope] = useState<OrganizationScope>(initial);
  const value = useMemo<OrgContextValue>(() => ({
    scope,
    setScope,
    scopeFilter: scope === 'all' ? undefined : `qdb_organizationcode eq ${ORGANIZATION_CODE_VALUES[scope]}`,
  }), [scope]);
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const org = useContext(OrgContext);
  if (!org) throw new Error('useOrg was called outside OrgProvider.');
  return org;
}

// ── Role: presentation only ──────────────────────────────────────────────────

export interface RoleContextValue {
  role: RoleKey;
  setRole: (role: RoleKey) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

/**
 * The working role.
 *
 * **This gates presentation and nothing else.** It decides which navigation entries are offered and
 * which commands are shown, exactly as the prototype does. It authorises nothing: every read and
 * write happens in the CRM session as the signed-in user, and CRM's role-based security is what
 * permits or refuses it. A user who reaches a hidden view by URL sees whatever CRM allows them to
 * see — which is the correct outcome rather than a hole.
 */
export function RoleProvider({ children, initial = 'officer' }: { children: ReactNode; initial?: RoleKey }) {
  const [role, setRole] = useState<RoleKey>(initial);
  const value = useMemo(() => ({ role, setRole }), [role]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole was called outside RoleProvider.');
  return context;
}

export const ROLE_LABELS: Readonly<Record<RoleKey, string>> = {
  officer: 'Collection Officer',
  manager: 'Collection Manager',
  rm: 'Relationship Manager',
  legal: 'Legal Officer',
};
