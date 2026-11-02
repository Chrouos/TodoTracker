import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySeries, durationOfEntry, fmtDate } from '../src/lib/time.js';
import { comparisonBounds, deltaPercent, reportRangeBounds, shiftRangeAnchor, trendDateBounds } from '../src/lib/report-range.js';

const formatBounds = ({ from, to }) => ({ from: fmtDate(from), to: fmtDate(to) });

test('report quick ranges have exclusive end boundaries', () => {
  const now = new Date(2026, 7, 17, 15, 30);
  assert.deepEqual(formatBounds(reportRangeBounds('today', now, 1)), {
    from: '2026-08-17', to: '2026-08-18',
  });
  assert.deepEqual(formatBounds(reportRangeBounds('week', now, 1)), {
    from: '2026-08-17', to: '2026-08-24',
  });
  assert.deepEqual(formatBounds(reportRangeBounds('month', now, 1)), {
    from: '2026-08-01', to: '2026-09-01',
  });
});

test('today trend bounds include today and the five preceding dates', () => {
  const now = new Date(2026, 7, 17);
  assert.deepEqual(formatBounds(trendDateBounds('today', now, 1)), {
    from: '2026-08-12', to: '2026-08-17',
  });
});

test('week trend bounds stop at today instead of showing future dates', () => {
  const now = new Date(2026, 7, 19);
  assert.deepEqual(formatBounds(trendDateBounds('week', now, 1)), {
    from: '2026-08-17', to: '2026-08-19',
  });
});

test('dailySeries splits overnight entries across the local dates they touch', () => {
  const result = dailySeries([
    {
      startedAt: '2026-08-20T23:30:00+08:00',
      endedAt: '2026-08-21T01:30:00+08:00',
    },
  ], new Date(2026, 7, 20), new Date(2026, 7, 21), durationOfEntry);

  assert.deepEqual(result, [
    { date: '2026-08-20', seconds: 1800 },
    { date: '2026-08-21', seconds: 5400 },
  ]);
});

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

test('comparison covers the same elapsed time of the previous period', () => {
  const now = local(2026, 8, 19, 15, 30); // 週三
  const week = comparisonBounds('week', reportRangeBounds('week', now, 1), now);
  assert.deepEqual(week.current.from, local(2026, 8, 17));
  assert.deepEqual(week.current.to, now);
  assert.deepEqual(week.previous.from, local(2026, 8, 10));
  assert.deepEqual(week.previous.to, local(2026, 8, 12, 15, 30));

  const today = comparisonBounds('today', reportRangeBounds('today', now, 1), now);
  assert.deepEqual(today.previous.from, local(2026, 8, 18));
  assert.deepEqual(today.previous.to, local(2026, 8, 18, 15, 30));
});

test('month comparison clamps to a shorter previous month', () => {
  const now = local(2026, 3, 31, 10);
  const month = comparisonBounds('month', reportRangeBounds('month', now, 1), now);
  assert.deepEqual(month.previous.from, local(2026, 2, 1));
  assert.deepEqual(month.previous.to, local(2026, 3, 1));

  const mid = local(2026, 3, 15, 10);
  const midMonth = comparisonBounds('month', reportRangeBounds('month', mid, 1), mid);
  assert.deepEqual(midMonth.previous.to, local(2026, 2, 15, 10));
});

test('month comparison crosses the year boundary', () => {
  const now = local(2027, 1, 5, 9);
  const month = comparisonBounds('month', reportRangeBounds('month', now, 1), now);
  assert.deepEqual(month.previous.from, local(2026, 12, 1));
  assert.deepEqual(month.previous.to, local(2026, 12, 5, 9));
});

test('custom range compares with the preceding range of equal length', () => {
  const bounds = { from: local(2026, 8, 10), to: local(2026, 8, 13) };
  const custom = comparisonBounds('custom', bounds, local(2026, 8, 20));
  assert.deepEqual(custom.current, bounds);
  assert.deepEqual(custom.previous, { from: local(2026, 8, 7), to: local(2026, 8, 10) });
});

test('all-time range has no comparison', () => {
  assert.equal(comparisonBounds('all', { from: new Date(0), to: null }), null);
});

test('deltaPercent needs a positive baseline', () => {
  assert.equal(deltaPercent(12, 10), 20);
  assert.equal(deltaPercent(5, 10), -50);
  assert.equal(deltaPercent(0, 10), -100);
  assert.equal(deltaPercent(10, 10), 0);
  assert.equal(deltaPercent(10, 0), null);
});

test('shifting a range lands in the wanted period', () => {
  const now = new Date(2026, 2, 31, 15, 30); // 3/31 是週二
  const bounds = (range, offset) => formatBounds(reportRangeBounds(range, shiftRangeAnchor(range, now, offset), 1));
  assert.deepEqual(bounds('today', -1), { from: '2026-03-30', to: '2026-03-31' });
  assert.deepEqual(bounds('week', -1), { from: '2026-03-23', to: '2026-03-30' });
  // 2 月沒有 31 號，也不能跳過 2 月
  assert.deepEqual(bounds('month', -1), { from: '2026-02-01', to: '2026-03-01' });
  assert.deepEqual(bounds('month', -3), { from: '2025-12-01', to: '2026-01-01' });
  assert.equal(shiftRangeAnchor('all', now, -1), now);
});

test('a finished period compares in full with the one before it', () => {
  const now = new Date(2026, 7, 19, 15, 30);
  const month = comparisonBounds('month', reportRangeBounds('month', new Date(2026, 6, 1), 1), now);
  assert.deepEqual(month.current, { from: new Date(2026, 6, 1), to: new Date(2026, 7, 1) });
  assert.deepEqual(month.previous, { from: new Date(2026, 5, 1), to: new Date(2026, 6, 1) });
  const week = comparisonBounds('week', reportRangeBounds('week', new Date(2026, 7, 12), 1), now);
  assert.deepEqual(week.current, { from: new Date(2026, 7, 10), to: new Date(2026, 7, 17) });
  assert.deepEqual(week.previous, { from: new Date(2026, 7, 3), to: new Date(2026, 7, 10) });
});
