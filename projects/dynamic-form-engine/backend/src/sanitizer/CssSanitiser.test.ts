import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

vi.mock('postcss', () => {
  const process = vi.fn().mockReturnValue({ css: 'sanitised-output' });
  return { default: vi.fn(() => ({ process })) };
});

vi.mock('@qdb/shared', () => ({
  createCssSanitiserPlugin: vi.fn().mockReturnValue({ postcssPlugin: 'mock-plugin' }),
}));

describe('CssSanitiser', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['ALLOWED_CSS_DOMAINS_JSON'];
  });

  it('sanitiseCustomCss_emptyString_returnsEmpty', async () => {
    const { sanitiseCustomCss } = await import('./CssSanitiser.js');
    expect(sanitiseCustomCss('')).toBe('');
  });

  it('sanitiseCustomCss_whitespaceOnly_returnsEmpty', async () => {
    const { sanitiseCustomCss } = await import('./CssSanitiser.js');
    expect(sanitiseCustomCss('   ')).toBe('');
  });

  it('sanitiseCustomCss_validCss_returnsPostcssOutput', async () => {
    const { sanitiseCustomCss } = await import('./CssSanitiser.js');
    const result = sanitiseCustomCss('.qdb-form { color: red; }');
    expect(result).toBe('sanitised-output');
  });

  it('getAllowedDomains_noEnvVar_returnsEmptyArray', async () => {
    const { getAllowedDomains } = await import('./CssSanitiser.js');
    expect(getAllowedDomains()).toEqual([]);
  });

  it('getAllowedDomains_validJsonArray_returnsDomains', async () => {
    vi.resetModules();
    process.env['ALLOWED_CSS_DOMAINS_JSON'] = '["fonts.example.com","cdn.example.com"]';
    const { getAllowedDomains } = await import('./CssSanitiser.js');
    expect(getAllowedDomains()).toEqual(['fonts.example.com', 'cdn.example.com']);
  });

  it('getAllowedDomains_invalidJson_returnsEmptyArray', async () => {
    vi.resetModules();
    process.env['ALLOWED_CSS_DOMAINS_JSON'] = 'not-json';
    const { getAllowedDomains } = await import('./CssSanitiser.js');
    expect(getAllowedDomains()).toEqual([]);
  });

  it('getAllowedDomains_jsonNotArray_returnsEmptyArray', async () => {
    vi.resetModules();
    process.env['ALLOWED_CSS_DOMAINS_JSON'] = '{"domain":"example.com"}';
    const { getAllowedDomains } = await import('./CssSanitiser.js');
    expect(getAllowedDomains()).toEqual([]);
  });
});
