import type { ValidationRule } from '@qdb/shared';
import { isRelativeDateRef, resolveRelativeDate } from '@qdb/shared';

/** The calendar window a date field's relative bounds allow, as YYYY-MM-DD strings. */
export interface DateBounds {
  min?: string;
  max?: string;
}

/**
 * Derives the native date picker's window from the field's relative cross-field rules.
 *
 * The validation engine still judges the value; this only lets the picker grey out the days
 * a rule would reject. Only relative tokens qualify: a bound on another field moves as the
 * user types and cannot be a static picker attribute.
 */
export function resolveDateBounds(rules: ValidationRule[], now: Date = new Date()): DateBounds {
  return rules
    .filter((rule) => rule.isActive && rule.ruleType === 'crossField')
    .reduce<DateBounds>((bounds, rule) => tightenBounds(bounds, rule, now), {});
}

function tightenBounds(bounds: DateBounds, rule: ValidationRule, now: Date): DateBounds {
  const targetRef = rule.crossFieldTargetRef;
  if (!targetRef || !isRelativeDateRef(targetRef)) return bounds;

  const boundary = resolveRelativeDate(targetRef, now);
  if (!boundary) return bounds;

  switch (rule.crossFieldOperator) {
    case '>=': return { ...bounds, min: laterOf(bounds.min, boundary) };
    case '>':  return { ...bounds, min: laterOf(bounds.min, shiftDay(boundary, 1)) };
    case '<=': return { ...bounds, max: earlierOf(bounds.max, boundary) };
    case '<':  return { ...bounds, max: earlierOf(bounds.max, shiftDay(boundary, -1)) };
    default:   return bounds;
  }
}

function laterOf(current: string | undefined, candidate: string): string {
  return current === undefined || candidate > current ? candidate : current;
}

function earlierOf(current: string | undefined, candidate: string): string {
  return current === undefined || candidate < current ? candidate : current;
}

function shiftDay(isoDate: string, days: number): string {
  // isoDate always comes from resolveRelativeDate, so it is YYYY-MM-DD and all three parts exist.
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(year!, month! - 1, day! + days);
  const mm = String(shifted.getMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getDate()).padStart(2, '0');
  return `${shifted.getFullYear()}-${mm}-${dd}`;
}
