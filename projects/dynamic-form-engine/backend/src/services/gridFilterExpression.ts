// Compiles a maker-authored depends-on filter template into a FetchXML <filter> subtree
// for the portal grid path. The template grammar, the parser, and the FetchXML emitter
// live in @qdb/shared so the in-CRM engine (which emits OData instead) interprets the
// same template identically; this module owns only the backend's failure policy.
import { buildFetchXmlFilterParts, type FetchXmlFilterParts, type LookupJoinTarget } from '@qdb/shared';
import { logger } from '../utils/logger.js';

const EMPTY_PARTS: FetchXmlFilterParts = { filterXml: '', linkEntityXml: '', unresolvedPaths: [] };

/**
 * Compiles the template into a FetchXML filter subtree, or returns '' when the
 * expression is empty after pruning (or cannot be parsed). Never throws — a broken
 * template must not take the grid down, so it degrades to an unfiltered query.
 */
export function buildDependsOnFilter(
  template: string,
  values: Record<string, string>,
): string {
  return buildDependsOnFilterParts(template, values).filterXml;
}

/**
 * As `buildDependsOnFilter`, plus the joins a template needs when it searches a lookup by
 * display text (`company/name like '%{x}%'`). A path whose target table could not be
 * resolved is dropped and logged: silently returning a wider result set would look like
 * the filter simply matched more rows.
 */
export function buildDependsOnFilterParts(
  template: string,
  values: Record<string, string>,
  joinTargets: Record<string, LookupJoinTarget> = {},
): FetchXmlFilterParts {
  try {
    const parts = buildFetchXmlFilterParts(template, values, joinTargets);
    if (parts.unresolvedPaths.length > 0) {
      logger.warn(
        { template, attributes: parts.unresolvedPaths },
        'depends-on filter searches a lookup whose target table could not be resolved — conditions dropped',
      );
    }
    return parts;
  } catch (error) {
    logger.warn(
      { template, reason: error instanceof Error ? error.message : String(error) },
      'depends-on filter template could not be parsed — skipped',
    );
    return EMPTY_PARTS;
  }
}
