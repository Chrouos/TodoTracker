import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySeries, durationOfEntry, fmtDate } from '../src/lib/time.js';
import { reportRangeBounds, trendDateBounds } from '../src/lib/report-range.js';

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
