import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';

/**
 * Where DCP's report definitions live on this organisation.
 *
 * A definition is provisioned by its code (`qdb_reportcode`), and its record id — what `qdb_RunReport`
 * takes — is whatever the organisation assigned. The id is therefore read at run time and never
 * written into DCP: the same build runs against the sandbox, an on-premises organisation and
 * production, each with its own ids, and a code with no record on this organisation is reported as
 * missing rather than guessed.
 */
export interface ResolvedDefinition {
  code: string;
  id: string;
  version: number | undefined;
  isPublished: boolean;
}

export type DefinitionIndex = ReadonlyMap<string, ResolvedDefinition>;

const REPORT_DEFINITION_SET = 'qdb_reportdefinitions';
const DCP_CODE_PREFIX = 'DCP-';
const RESOLVER_COLUMNS = ['qdb_reportdefinitionid', 'qdb_reportcode', 'qdb_currentversionnumber', 'qdb_ispublished'];

/** Reads every DCP definition the signed-in user can see. A read failure propagates: it is the caller's state to name. */
export async function resolveDcpDefinitions(adapter: XrmCrmAdapter): Promise<DefinitionIndex> {
  const rows = await adapter.retrieveMultiple(REPORT_DEFINITION_SET, {
    select: RESOLVER_COLUMNS,
    filter: `startswith(qdb_reportcode,'${DCP_CODE_PREFIX}')`,
    top: 200,
  });
  const index = new Map<string, ResolvedDefinition>();
  for (const row of rows) {
    const resolved = toResolved(row);
    if (resolved) index.set(resolved.code, resolved);
  }
  return index;
}

function toResolved(row: Record<string, unknown>): ResolvedDefinition | undefined {
  const id = row['qdb_reportdefinitionid'];
  const code = row['qdb_reportcode'];
  if (typeof id !== 'string' || typeof code !== 'string') return undefined;
  const version = row['qdb_currentversionnumber'];
  return {
    code, id,
    version: typeof version === 'number' ? version : undefined,
    isPublished: row['qdb_ispublished'] === true,
  };
}
