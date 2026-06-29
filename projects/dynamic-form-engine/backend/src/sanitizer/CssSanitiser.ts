import postcss from 'postcss';
import type { AcceptedPlugin } from 'postcss';
import { createCssSanitiserPlugin } from '@qdb/shared';
import { logger } from '../utils/logger.js';

const ALLOWED_DOMAINS: readonly string[] = parseAllowedDomainsFromEnv();

function parseAllowedDomainsFromEnv(): readonly string[] {
  const raw = process.env['ALLOWED_CSS_DOMAINS_JSON'];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      logger.warn({ raw }, 'ALLOWED_CSS_DOMAINS_JSON is not a JSON array — using empty domain list');
      return [];
    }
    return parsed.filter((d): d is string => typeof d === 'string' && d.trim() !== '');
  } catch {
    logger.warn({ raw }, 'ALLOWED_CSS_DOMAINS_JSON is not valid JSON — using empty domain list');
    return [];
  }
}

export function sanitiseCustomCss(rawCss: string): string {
  if (!rawCss || rawCss.trim() === '') return '';
  const plugin = createCssSanitiserPlugin(ALLOWED_DOMAINS) as unknown as AcceptedPlugin;
  return postcss([plugin]).process(rawCss, { from: undefined }).css;
}

export function getAllowedDomains(): readonly string[] {
  return ALLOWED_DOMAINS;
}
