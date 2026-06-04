import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CssSanitiserService } from './cssSanitiser.js';

// We stub config before the module is loaded so QDB_CSS_ALLOWED_DOMAINS is controllable per test.
vi.mock('../config/env.js', () => ({
  config: {
    QDB_CSS_ALLOWED_DOMAINS: 'cdn.example.com',
  },
}));

// Silence logger output in tests — the sanitiser logs every stripped item.
vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

describe('CssSanitiserService', () => {
  let service: CssSanitiserService;

  beforeEach(() => {
    service = new CssSanitiserService();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('sanitise_allowedProperties_returnsCssUnchanged', () => {
    const input = '.qdb-field { color: red; font-size: 14px; padding: 8px; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).toContain('color: red');
    expect(result).toContain('font-size: 14px');
    expect(result).toContain('padding: 8px');
  });

  it('sanitise_customQdbProperty_isRetained', () => {
    const input = '.qdb-field { --qdb-primary: #0078d4; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).toContain('--qdb-primary: #0078d4');
  });

  it('sanitise_allowedUrlDomain_isRetained', () => {
    const input = '.qdb-bg { background-image: url("https://cdn.example.com/img.png"); }';
    const result = service.sanitise(input, 'test-form');
    expect(result).toContain('background-image');
  });

  it('sanitise_mediaQuery_isRetained', () => {
    const input = '@media (max-width: 768px) { .qdb-field { padding: 4px; } }';
    const result = service.sanitise(input, 'test-form');
    expect(result).toContain('@media');
    expect(result).toContain('padding: 4px');
  });

  // ── Blocked properties ────────────────────────────────────────────────────

  it('sanitise_disallowedProperty_isStripped', () => {
    const input = '.qdb-field { cursor: pointer; color: blue; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('cursor');
    expect(result).toContain('color: blue');
  });

  it('sanitise_positionFixed_isStripped', () => {
    const input = '.qdb-overlay { position: fixed; color: red; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('position: fixed');
    expect(result).toContain('color: red');
  });

  it('sanitise_positionAbsolute_isStripped', () => {
    const input = '.qdb-popup { position: absolute; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('position: absolute');
  });

  it('sanitise_zIndexAboveTen_isStripped', () => {
    const input = '.qdb-modal { z-index: 9999; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('z-index: 9999');
  });

  it('sanitise_zIndexAtOrBelowTen_isRetained', () => {
    const input = '.qdb-card { z-index: 1; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).toContain('z-index: 1');
  });

  // ── Dangerous values ──────────────────────────────────────────────────────

  it('sanitise_cssExpression_isStripped', () => {
    const input = '.qdb-field { width: expression(document.body.clientWidth); }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('expression');
  });

  it('sanitise_msBehavior_isStripped', () => {
    const input = '.qdb-field { -ms-behavior: url(script.htc); }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('-ms-behavior');
  });

  // ── Dangerous selectors ───────────────────────────────────────────────────

  it('sanitise_htmlSelector_isStripped', () => {
    const input = 'html { font-size: 10px; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('font-size: 10px');
  });

  it('sanitise_bodySelector_isStripped', () => {
    const input = 'body { background-color: black; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('background-color: black');
  });

  it('sanitise_rootPseudoSelector_isStripped', () => {
    const input = ':root { --primary: red; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('--primary');
  });

  it('sanitise_nonQdbHashSelector_isStripped', () => {
    const input = '#someElement { color: blue; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('color: blue');
  });

  it('sanitise_qdbHashSelector_isRetained', () => {
    const input = '#qdb-header { color: blue; }';
    const result = service.sanitise(input, 'test-form');
    expect(result).toContain('color: blue');
  });

  // ── Blocked at-rules ──────────────────────────────────────────────────────

  it('sanitise_atImport_isStripped', () => {
    const input = "@import url('https://cdn.example.com/evil.css'); .qdb-field { color: red; }";
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('@import');
    expect(result).toContain('color: red');
  });

  it('sanitise_atFontFace_isStripped', () => {
    const input = "@font-face { font-family: 'Custom'; src: url('font.woff2'); } .qdb-field { color: red; }";
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('@font-face');
  });

  // ── URL domain filtering ──────────────────────────────────────────────────

  it('sanitise_urlFromDisallowedDomain_isStripped', () => {
    const input = '.qdb-bg { background-image: url("https://evil.com/track.png"); }';
    const result = service.sanitise(input, 'test-form');
    expect(result).not.toContain('background-image');
  });
});
