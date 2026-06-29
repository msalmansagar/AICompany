// Pure WCAG 2.1 contrast ratio calculation — no React, no side effects.

export interface ContrastResult {
  ratio: number;
  level: 'AAA' | 'AA' | 'AA Large' | 'Fail';
  /** true when ratio >= 3.0 */
  passesMinimumGate: boolean;
  /** true when 3.0 <= ratio < 4.5 (advisory warning zone) */
  isAdvisoryWarning: boolean;
}

/** @returns null when hex is not a valid 3- or 6-digit colour */
function parseHexChannels(hex: string): [number, number, number] | null {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const expanded = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ];
}

function linearizeChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function computeRelativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearizeChannel(r)
    + 0.7152 * linearizeChannel(g)
    + 0.0722 * linearizeChannel(b);
}

function classifyLevel(ratio: number): ContrastResult['level'] {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}

const FAILURE_RESULT: ContrastResult = {
  ratio: 0,
  level: 'Fail',
  passesMinimumGate: false,
  isAdvisoryWarning: false,
};

/**
 * Calculates WCAG 2.1 contrast ratio between two hex colours.
 * Accepts 3- or 6-digit hex strings, with or without leading #.
 * Returns FAILURE_RESULT for any malformed input.
 */
export function calculateContrastRatio(
  hexForeground: string,
  hexBackground: string,
): ContrastResult {
  const fg = parseHexChannels(hexForeground);
  const bg = parseHexChannels(hexBackground);
  if (!fg || !bg) return FAILURE_RESULT;

  const L1 = computeRelativeLuminance(...fg);
  const L2 = computeRelativeLuminance(...bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  const ratio = parseFloat(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
  const level = classifyLevel(ratio);

  return {
    ratio,
    level,
    passesMinimumGate: ratio >= 3.0,
    isAdvisoryWarning: ratio >= 3.0 && ratio < 4.5,
  };
}
