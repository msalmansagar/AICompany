import { describe, it, expect } from 'vitest';
import postcss from 'postcss';
import type { AcceptedPlugin } from 'postcss';
import { createCssSanitiserPlugin } from '@qdb/shared';

function sanitise(css: string, allowedDomains: string[] = []): string {
  const plugin = createCssSanitiserPlugin(allowedDomains) as unknown as AcceptedPlugin;
  return postcss([plugin]).process(css, { from: undefined }).css;
}

describe('createCssSanitiserPlugin', () => {
  // ── @import / @charset / @namespace removal ──────────────────────────────

  it('sanitise_importAtRule_removed', () => {
    const result = sanitise('@import url("https://example.com/style.css");');
    expect(result).not.toContain('@import');
  });

  it('sanitise_charsetAtRule_removed', () => {
    const result = sanitise('@charset "UTF-8";');
    expect(result).not.toContain('@charset');
  });

  it('sanitise_namespaceAtRule_removed', () => {
    const result = sanitise('@namespace url("http://www.w3.org/1999/xhtml");');
    expect(result).not.toContain('@namespace');
  });

  // ── @font-face ────────────────────────────────────────────────────────────

  it('sanitise_fontFaceWithAllowedDomain_retained', () => {
    const css = `@font-face { font-family: "MyFont"; src: url("https://fonts.example.com/font.woff2"); }`;
    const result = sanitise(css, ['fonts.example.com']);
    expect(result).toContain('@font-face');
  });

  it('sanitise_fontFaceWithBlockedDomain_removed', () => {
    const css = `@font-face { font-family: "Evil"; src: url("https://evil.com/font.woff2"); }`;
    const result = sanitise(css, ['fonts.example.com']);
    expect(result).not.toContain('@font-face');
  });

  it('sanitise_fontFaceWithNoSrc_removed', () => {
    const css = `@font-face { font-family: "NoSrc"; }`;
    const result = sanitise(css, ['fonts.example.com']);
    expect(result).not.toContain('@font-face');
  });

  // ── @keyframes retention ─────────────────────────────────────────────────

  it('sanitise_keyframesBlock_retained', () => {
    const css = `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`;
    const result = sanitise(css);
    expect(result).toContain('@keyframes');
    expect(result).toContain('fadeIn');
  });

  // ── @media passthrough ────────────────────────────────────────────────────

  it('sanitise_mediaQueryWithQdbRule_retainsRule', () => {
    const css = `@media (max-width: 768px) { .qdb-form { display: block; } }`;
    const result = sanitise(css);
    expect(result).toContain('@media');
    expect(result).toContain('.qdb-form');
  });

  // ── Global selectors ──────────────────────────────────────────────────────

  it('sanitise_htmlSelector_removed', () => {
    const result = sanitise('html { color: red; }');
    expect(result).not.toContain('html');
  });

  it('sanitise_bodySelector_removed', () => {
    const result = sanitise('body { font-size: 16px; }');
    expect(result).not.toContain('body');
  });

  it('sanitise_wildcardSelector_removed', () => {
    const result = sanitise('* { box-sizing: border-box; }');
    expect(result).not.toMatch(/^\s*\*\s*\{/);
  });

  it('sanitise_rootPseudoSelector_removed', () => {
    const result = sanitise(':root { --color: red; }');
    expect(result).not.toContain(':root');
  });

  // ── Unscoped / mixed / qdb-scoped selectors ──────────────────────────────

  it('sanitise_unscopedSelector_removed', () => {
    const result = sanitise('.my-button { color: blue; }');
    expect(result).not.toContain('.my-button');
  });

  it('sanitise_mixedSelectorWithUnscopedPart_removed', () => {
    const result = sanitise('.qdb-form, .other-class { padding: 0; }');
    expect(result).not.toContain('.qdb-form, .other-class');
  });

  it('sanitise_fullyQdbScopedSelector_retained', () => {
    const result = sanitise('.qdb-form .qdb-field { color: green; }');
    expect(result).toContain('.qdb-form .qdb-field');
  });

  it('sanitise_multipleQdbScopedParts_retained', () => {
    const result = sanitise('.qdb-form, .qdb-btn { margin: 0; }');
    expect(result).toContain('.qdb-form');
    expect(result).toContain('.qdb-btn');
  });

  // ── Dangerous declaration values ──────────────────────────────────────────

  it('sanitise_expressionValue_removed', () => {
    const result = sanitise('.qdb-form { width: expression(document.body.clientWidth); }');
    expect(result).not.toContain('expression(');
  });

  it('sanitise_javascriptColonInValue_removed', () => {
    const result = sanitise('.qdb-form { background-image: url("javascript:alert(1)"); }');
    expect(result).not.toContain('javascript:');
  });

  it('sanitise_behaviorProperty_removed', () => {
    const result = sanitise('.qdb-form { behavior: url(xss.htc); }');
    expect(result).not.toContain('behavior');
  });

  // ── URL domain filtering in declarations ──────────────────────────────────

  it('sanitise_urlWithAllowedDomain_retained', () => {
    const css = `.qdb-form { background-image: url("https://cdn.example.com/img.png"); }`;
    const result = sanitise(css, ['cdn.example.com']);
    expect(result).toContain('cdn.example.com');
  });

  it('sanitise_urlWithBlockedDomain_removed', () => {
    const css = `.qdb-form { background-image: url("https://evil.com/tracker.png"); }`;
    const result = sanitise(css, ['cdn.example.com']);
    expect(result).not.toContain('evil.com');
  });
});
