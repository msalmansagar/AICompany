import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_STATE_CODES,
  ACTIVITY_STATUS_CODES,
  PTP_STATUS_CODES,
  PTP_TRANSITIONS,
  PtpStatus,
  activityStatusFromCode,
  isActivityImmutable,
  isPtpTransitionAllowed,
  ptpStatusFromCode,
} from './activityLifecycle.js';

describe('promise-to-pay transitions', () => {
  it('lets an active promise be kept, partially kept, broken, rescheduled or cancelled', () => {
    expect(PTP_TRANSITIONS.Active).toEqual(['Kept', 'PartiallyKept', 'Broken', 'Rescheduled', 'Cancelled']);
  });

  it('allows the documented false-Broken reversal', () => {
    expect(isPtpTransitionAllowed('Broken', 'Kept')).toBe(true);
  });

  it('treats Kept and Cancelled as terminal', () => {
    expect(isPtpTransitionAllowed('Kept', 'Active')).toBe(false);
    expect(isPtpTransitionAllowed('Cancelled', 'Broken')).toBe(false);
  });
});

describe('activity lifecycle', () => {
  it('is immutable only once completed', () => {
    expect(isActivityImmutable('Completed')).toBe(true);
    expect(isActivityImmutable('Cancelled')).toBe(false);
    expect(isActivityImmutable('Open')).toBe(false);
  });

  it('maps completion and cancellation onto the native state codes', () => {
    expect(ACTIVITY_STATE_CODES.Completed).toBe(1);
    expect(ACTIVITY_STATE_CODES.Cancelled).toBe(2);
    expect(ACTIVITY_STATE_CODES.AwaitingApproval).toBe(0);
  });

  it('resolves provisioned codes back to names', () => {
    expect(activityStatusFromCode(100000640)).toBe('Open');
    expect(ptpStatusFromCode(100000081)).toBe('Kept');
    expect(ptpStatusFromCode(0)).toBeUndefined();
  });
});

describe('parity with the plugin matrix (StatusTransitionMatrix.cs)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const csharp = readFileSync(
    resolve(here, '../../../crm/plugins/Qdb.DebtCollection.Plugins/Domain/StatusTransitionMatrix.cs'), 'utf8');

  function parseCodes(source: string, className: string, nextClass: string): Record<string, number> {
    const body = source.slice(source.indexOf(`class ${className}`), source.indexOf(`class ${nextClass}`));
    const codes: Record<string, number> = {};
    for (const m of body.matchAll(/public const int (\w+) = (\d+);/g)) codes[m[1]!] = Number(m[2]);
    return codes;
  }

  function parsePtpMatrix(source: string): Record<string, string[]> {
    const body = source.slice(source.indexOf('PtpAllowed ='), source.indexOf('ContactBearingStates'));
    const matrix: Record<string, string[]> = {};
    for (const m of body.matchAll(/\[PtpStatus\.(\w+)\]\s*=\s*new HashSet<int>\s*(?:\{([^}]*)\}|\(\))/g)) {
      matrix[m[1]!] = m[2] ? [...m[2].matchAll(/PtpStatus\.(\w+)/g)].map(x => x[1]!) : [];
    }
    return matrix;
  }

  it('has the same activity status codes as the plugin', () => {
    expect(parseCodes(csharp, 'ActivityStatus', 'PtpStatus')).toEqual(ACTIVITY_STATUS_CODES);
  });

  it('has the same promise status codes as the plugin', () => {
    const body = csharp.slice(csharp.indexOf('class PtpStatus'));
    const codes: Record<string, number> = {};
    for (const m of body.slice(0, body.indexOf('}')).matchAll(/public const int (\w+) = (\d+);/g)) codes[m[1]!] = Number(m[2]);
    expect(codes).toEqual(PTP_STATUS_CODES);
  });

  it('has the same promise transitions as the plugin', () => {
    const plugin = parsePtpMatrix(csharp);
    for (const from of Object.keys(PTP_STATUS_CODES) as PtpStatus[]) {
      expect([...(plugin[from] ?? [])].sort(), `transitions from ${from}`).toEqual([...PTP_TRANSITIONS[from]].sort());
    }
  });
});
