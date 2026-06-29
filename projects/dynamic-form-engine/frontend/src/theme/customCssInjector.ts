// customCssInjector — defense-in-depth CSS sanitization before DOM injection (C-005b).
//
// The backend sanitizes customCss on save for all paths (cloud + on-prem render cache).
// This module adds a second pass at render time as defense-in-depth for the on-prem path:
//
//   On-prem path  — postcss-bundle.iife.js is deployed as a sibling web resource.
//                   window.PostCSS is available; run the same qdb-css-sanitiser plugin the
//                   backend uses, with an EMPTY allowlist (block all url()) since the
//                   Dataverse allowlist is not reachable from this render-time path.
//   Portal path   — PostCSS IIFE is not loaded; apply a lightweight regex-based filter.
//                   The backend already sanitized the cache entry for this path.

import { createCssSanitiserPlugin } from '@qdb/shared';

/* eslint-disable no-var */
declare var PostCSS: PostCssGlobal | undefined;
/* eslint-enable no-var */

interface PostCssGlobal {
  version?: string;
  parse(css: string): unknown;
  default(plugins: unknown[]): { process(css: string, opts: { from: undefined }): { css: string } };
}

const DANGEROUS_VALUE_PATTERNS: readonly RegExp[] = [
  /expression\s*\(/gi,
  /javascript:/gi,
  /(-\w+-)?behavior\s*:/gi,
];

const IMPORT_PATTERN = /@import\b/gi;
const URL_PATTERN = /url\([^)]*\)/gi;

function isPostCssAvailable(): boolean {
  try {
    return typeof PostCSS !== 'undefined' && typeof PostCSS.default === 'function';
  } catch {
    return false;
  }
}

function regexFallbackSanitise(css: string): string {
  let result = css.replace(IMPORT_PATTERN, '/* @import removed */');
  // Conservative: strip all url() when PostCSS AST is unavailable and no allowlist can be checked.
  result = result.replace(URL_PATTERN, '/* url() removed */');
  for (const pattern of DANGEROUS_VALUE_PATTERNS) {
    result = result.replace(pattern, '/* removed */');
  }
  return result;
}

function sanitiseWithPostCss(css: string): string {
  try {
    if (typeof PostCSS === 'undefined') return '';
    // Run the qdb-css-sanitiser plugin (same one the backend uses) with an empty
    // allowlist, so @import/@charset/@namespace, expression()/javascript: values,
    // behavior: declarations, non-.qdb- selectors, and ALL url() references are
    // stripped. Malformed CSS throws and yields empty output rather than raw CSS.
    const plugin = createCssSanitiserPlugin([]);
    const result = PostCSS.default([plugin]).process(css, { from: undefined });
    return result.css;
  } catch {
    return '';
  }
}

/**
 * Sanitizes raw customCss before injecting it into the DOM as a <style> block.
 * Uses PostCSS AST (on-prem path) when available, regex fallback (portal path) otherwise.
 * Returns empty string for null/undefined/empty input.
 */
export function sanitiseCustomCssForRuntime(rawCss: string | undefined | null): string {
  if (!rawCss || rawCss.trim() === '') return '';
  if (isPostCssAvailable()) {
    return sanitiseWithPostCss(rawCss);
  }
  return regexFallbackSanitise(rawCss);
}
