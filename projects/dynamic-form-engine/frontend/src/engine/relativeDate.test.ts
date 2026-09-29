import { describe, it, expect } from 'vitest';
import {
  formatRelativeDateRef,
  isRelativeDateRef,
  parseRelativeDateRef,
  resolveRelativeDate,
} from '@qdb/shared';

// The last day of a 31-day month, so month-end and day-clamping cases are all reachable.
const NOW = new Date(2026, 0, 31, 14, 30);

describe('relativeDate', () => {
  describe('isRelativeDateRef', () => {
    it('should_recognise_the_prefix', () => {
      expect(isRelativeDateRef('@today')).toBe(true);
    });

    it('should_reject_a_field_schema_name', () => {
      expect(isRelativeDateRef('start_date')).toBe(false);
    });
  });

  describe('parseRelativeDateRef', () => {
    it('should_parse_an_anchor_without_offset', () => {
      expect(parseRelativeDateRef('@monthEnd')).toEqual({ anchor: 'monthEnd', offset: 0, unit: 'd' });
    });

    it('should_parse_a_signed_offset_and_unit', () => {
      expect(parseRelativeDateRef('@today-18y')).toEqual({ anchor: 'today', offset: -18, unit: 'y' });
    });

    it('should_return_null_for_an_unknown_anchor', () => {
      expect(parseRelativeDateRef('@yesterday')).toBeNull();
    });
  });

  describe('formatRelativeDateRef', () => {
    it('should_round_trip_a_parsed_reference', () => {
      expect(formatRelativeDateRef({ anchor: 'monthEnd', offset: 10, unit: 'y' })).toBe('@monthEnd+10y');
    });

    it('should_omit_a_zero_offset', () => {
      expect(formatRelativeDateRef({ anchor: 'today', offset: 0, unit: 'y' })).toBe('@today');
    });
  });

  describe('resolveRelativeDate', () => {
    it('should_resolve_today_as_a_local_calendar_day', () => {
      expect(resolveRelativeDate('@today', NOW)).toBe('2026-01-31');
    });

    it('should_resolve_month_start', () => {
      expect(resolveRelativeDate('@monthStart', NOW)).toBe('2026-01-01');
    });

    it('should_keep_month_end_on_the_last_day_after_a_year_offset', () => {
      expect(resolveRelativeDate('@monthEnd+10y', NOW)).toBe('2036-01-31');
    });

    it('should_land_on_the_last_day_of_a_shorter_month', () => {
      expect(resolveRelativeDate('@monthEnd+1m', NOW)).toBe('2026-02-28');
    });

    it('should_clamp_today_into_a_shorter_month', () => {
      expect(resolveRelativeDate('@today+1m', NOW)).toBe('2026-02-28');
    });

    it('should_add_days_across_a_month_boundary', () => {
      expect(resolveRelativeDate('@today+1d', NOW)).toBe('2026-02-01');
    });

    it('should_return_null_for_a_token_it_does_not_define', () => {
      expect(resolveRelativeDate('@nextWeek', NOW)).toBeNull();
    });
  });
});
