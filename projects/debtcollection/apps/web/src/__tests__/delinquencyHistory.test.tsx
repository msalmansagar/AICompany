import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SnapshotRow } from '../data/caseQueries.js';
import { DpdChart } from '../views/customer360/DpdChart.js';
import { axisLabelsFor, formatSnapshotDay } from '../views/customer360/snapshotDates.js';

/**
 * The Delinquency History chart and its dates, in the form officers asked for: a scale that shows
 * the movement, a label under the points, and three-letter months everywhere.
 */

const snapshot = (date: string, dpd: number): SnapshotRow => ({ id: `s-${date}`, snapshotDate: date, dpd } as SnapshotRow);
const WEEKLY = [snapshot('2026-09-04', 60), snapshot('2026-09-11', 67), snapshot('2026-09-18', 74)];
const MONTHLY = [snapshot('2026-06-30', 122), snapshot('2026-07-31', 153), snapshot('2026-08-31', 184), snapshot('2026-09-30', 214)];

afterEach(() => { cleanup(); });

describe('formatSnapshotDay', () => {
  it('formatSnapshotDay_September_IsSepNotSept', () => {
    expect(formatSnapshotDay('2026-09-18')).toBe('18-Sep-2026');
  });

  it('formatSnapshotDay_UtcTimestampOfQatarMidnight_IsTheQatarDate', () => {
    // How the platform returns a snapshot taken on 18 September in Doha.
    expect(formatSnapshotDay('2026-09-17T22:04:43Z')).toBe('18-Sep-2026');
  });

  it('formatSnapshotDay_Unreadable_IsADash', () => {
    expect(formatSnapshotDay('not a date')).toBe('—');
  });

  it('formatSnapshotDay_NoDate_IsADash', () => {
    expect(formatSnapshotDay(undefined)).toBe('—');
  });
});

describe('axisLabelsFor', () => {
  it('axisLabelsFor_OnePointPerMonth_LabelsMonths', () => {
    expect(axisLabelsFor(MONTHLY.map(point => point.snapshotDate))).toEqual(['Jun-2026', 'Jul-2026', 'Aug-2026', 'Sep-2026']);
  });

  it('axisLabelsFor_SeveralPointsInAMonth_LabelsDays', () => {
    expect(axisLabelsFor(WEEKLY.map(point => point.snapshotDate))).toEqual(['04-Sep', '11-Sep', '18-Sep']);
  });
});

describe('DpdChart', () => {
  const heights = () => Array.from(screen.getByTestId('c360-dpd-chart').querySelectorAll('circle')).map(circle => Number(circle.getAttribute('cy')));

  it('DpdChart_SmallRise_UsesMostOfTheChartHeight', () => {
    render(<DpdChart points={WEEKLY} />);
    const [lowest, , highest] = heights();
    // From zero, 60 → 74 spanned about 14 units of a 72-unit plot; scaled to the data it spans most of it.
    expect(lowest! - highest!).toBeGreaterThan(60);
  });

  it('DpdChart_EveryPoint_HasADateUnderIt', () => {
    render(<DpdChart points={MONTHLY} />);
    expect(Array.from(screen.getByTestId('c360-dpd-chart').querySelectorAll('.c360-chart-axis')).map(label => label.textContent))
      .toEqual(['Jun-2026', 'Jul-2026', 'Aug-2026', 'Sep-2026']);
  });

  it('DpdChart_ManyPoints_LabelsAtMostSixAndAlwaysTheLatest', () => {
    const many = Array.from({ length: 12 }, (_, index) => snapshot(`2026-${String(index + 1).padStart(2, '0')}-28`, 30 + index));
    render(<DpdChart points={many} />);
    const labels = Array.from(screen.getByTestId('c360-dpd-chart').querySelectorAll('.c360-chart-axis')).map(label => label.textContent);
    expect([labels.length, labels[labels.length - 1]]).toEqual([6, 'Dec-2026']);
  });
});
