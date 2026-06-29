import postcss from 'postcss';
import type { AcceptedPlugin } from 'postcss';
import { createCssSanitiserPlugin } from '@qdb/shared';
import { logger } from '../utils/logger.js';

const ALLOWED_DOMAINS: readonly string[] = parseAllowedDomainsFromEnv();

// S-08 / SEC-06: surface the active allowlist at startup so operations can confirm the
// running state without a restart; flag an empty allowlist loudly (error in production,
// since it silently strips every url()/fontUrl in customCss).
if (ALLOWED_DOMAINS.length === 0) {
  const message = 'CSS sanitiser: ALLOWED_CSS_DOMAINS_JSON is empty — all url()/fontUrl in customCss will be stripped';
  if (process.env['NODE_ENV'] === 'production') logger.error(message);
  else logger.warn(message);
} else {
  logger.info({ allowedDomains: ALLOWED_DOMAINS }, 'CSS sanitiser: active allowed CDN domains');
}

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
