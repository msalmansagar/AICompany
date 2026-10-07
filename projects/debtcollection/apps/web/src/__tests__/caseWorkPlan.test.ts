import { describe, expect, it } from 'vitest';
import {
  COMPLETED_SHOWN, currentPromise, followUpsToComplete, groupCaseWork, groupOfDate, nextPlannedWork, resolutionStatuses,
} from '../data/caseWorkPlan.js';
import type { CaseWork } from '../data/followUpQueries.js';
import type { PtpRow } from '../data/caseQueries.js';
import { formatDate } from '../components/primitives.js';

/**
 * The Case Workspace's grouping of a case's work. It invents no date: open work is placed by its
 * follow-up date, completed work by when it was done, and a planned action nothing answers has none.
 */

const NOW = new Date('2026-10-06T10:00:00');
const CONTEXT = { caseId: 'c-1', now: NOW, formatDate };
const activity = (over: Partial<PtpRow>): PtpRow => ({ id: 'a', subject: 'Work', stateCode: 0, ...over });
const work = (over: Partial<CaseWork>): CaseWork => ({ rows: [], unattributed: [], activities: [], ...over });

describe('groupOfDate', () => {
  it.each([
    ['2026-10-05', 'overdue'], ['2026-10-06', 'today'], ['2026-10-06T23:00:00', 'today'], ['2026-10-07', 'upcoming'],
  ])('puts %s in %s', (iso, group) => {
    expect(groupOfDate(iso, NOW)).toBe(group);
  });
});

describe('groupCaseWork', () => {
  it('places an open follow-up by its date and leaves an undated open activity out', () => {
    const groups = groupCaseWork(work({ unattributed: [
      activity({ id: 'late', followUpDate: '2026-10-01' }),
      activity({ id: 'due', followUpDate: '2026-10-06' }),
      activity({ id: 'later', followUpDate: '2026-10-20' }),
      activity({ id: 'undated' }),
    ] }), CONTEXT);

    expect([groups.overdue.map(i => i.key), groups.today.map(i => i.key), groups.upcoming.map(i => i.key)]).toEqual([['late'], ['due'], ['later']]);
  });

  it('drops cancelled work', () => {
    const groups = groupCaseWork(work({ unattributed: [activity({ id: 'x', followUpDate: '2026-10-01', stateCode: 2 })] }), CONTEXT);

    expect(Object.values(groups).flat()).toEqual([]);
  });

  it('keeps only the latest completed lines, newest first', () => {
    const done = Array.from({ length: COMPLETED_SHOWN + 2 }, (_, index) => activity({ id: `d${index}`, followUpDate: '2026-10-01', stateCode: 1, activityDate: `2026-09-${String(10 + index).padStart(2, '0')}` }));

    const completed = groupCaseWork(work({ unattributed: done }), CONTEXT).completed;

    expect([completed.length, completed[0]!.key]).toEqual([COMPLETED_SHOWN, `d${COMPLETED_SHOWN + 1}`]);
  });

  it('shows a planned action nothing has answered as upcoming, undated and not completable', () => {
    const groups = groupCaseWork(work({ rows: [{ planned: { id: 's-1', name: 'Initial call', isActive: true }, attributed: [], hasCompletedAttributed: false }] }), CONTEXT);

    expect(groups.upcoming.map(item => [item.title, item.dateIso, item.activityId])).toEqual([['Initial call', undefined, undefined]]);
  });

  it('places a planned action\'s open work by that work\'s follow-up date', () => {
    const answered = activity({ id: 'w-1', followUpDate: '2026-10-02', strategyActionId: 's-1' });
    const groups = groupCaseWork(work({ rows: [{ planned: { id: 's-1', name: 'Follow-up call', isActive: true }, attributed: [answered], hasCompletedAttributed: false }] }), CONTEXT);

    expect(groups.overdue.map(item => [item.title, item.activityId])).toEqual([['Follow-up call', 'w-1']]);
  });
});

describe('followUpsToComplete and nextPlannedWork', () => {
  it('offers what is due by today, oldest first', () => {
    const groups = groupCaseWork(work({ unattributed: [activity({ id: 'today', followUpDate: '2026-10-06' }), activity({ id: 'late', followUpDate: '2026-10-01' })] }), CONTEXT);

    expect([followUpsToComplete(groups).map(item => item.key), nextPlannedWork(groups)?.key]).toEqual([['late', 'today'], 'late']);
  });

  it('offers the next dated follow-up when nothing is due yet', () => {
    const groups = groupCaseWork(work({ unattributed: [activity({ id: 'later', followUpDate: '2026-10-20' })] }), CONTEXT);

    expect(followUpsToComplete(groups).map(item => item.key)).toEqual(['later']);
  });
});

describe('currentPromise', () => {
  it('prefers the open promise over a later broken one', () => {
    const promises = [
      activity({ id: 'open', ptpDate: '2026-10-10', ptpStatus: 'Active' }),
      activity({ id: 'broken', ptpDate: '2026-10-20', ptpStatus: 'Broken' }),
    ];

    expect(currentPromise(promises)).toEqual({ promise: promises[0], isOpen: true });
  });

  it('falls back to the latest recorded promise, marked not open', () => {
    const promises = [activity({ id: 'kept', ptpDate: '2026-09-10', ptpStatus: 'Kept' })];

    expect(currentPromise(promises)?.isOpen).toBe(false);
  });

  it('is absent when no activity carries a promise', () => {
    expect(currentPromise([activity({})])).toBeUndefined();
  });
});

describe('resolutionStatuses', () => {
  const TYPES = { legal: ['t-legal'], deceased: ['t-dec'], concern: ['t-dispute'] };

  it('classifies by hand-off and configured type, and separates open from recorded', () => {
    const statuses = resolutionStatuses([
      activity({ id: 'c1', handOff: 'Complaint' }),
      activity({ id: 'l1', activityTypeId: 't-legal', stateCode: 1 }),
      activity({ id: 'x', activityTypeId: 't-other' }),
    ], TYPES);

    expect(statuses.map(s => [s.process, s.recorded.length, s.open.length])).toEqual([['complaint', 1, 1], ['legal', 1, 0], ['deceased', 0, 0]]);
  });
});
