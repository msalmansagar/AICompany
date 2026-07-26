// Compiles a maker-authored depends-on filter template into a FetchXML <filter> subtree
// for the portal grid path. The template grammar, the parser, and the FetchXML emitter
// live in @qdb/shared so the in-CRM engine (which emits OData instead) interprets the
// same template identically; this module owns only the backend's failure policy.
import { buildFetchXmlFilter } from '@qdb/shared';
import { logger } from '../utils/logger.js';

/**
 * Compiles the template into a FetchXML filter subtree, or returns '' when the
 * expression is empty after pruning (or cannot be parsed). Never throws — a broken
 * template must not take the grid down, so it degrades to an unfiltered query.
 */
export function buildDependsOnFilter(
  template: string,
  values: Record<string, string>,
): string {
  try {
    return buildFetchXmlFilter(template, values);
  } catch (error) {
    logger.warn(
      { template, reason: error instanceof Error ? error.message : String(error) },
      'depends-on filter template could not be parsed — skipped',
    );
    return '';
  }
}
