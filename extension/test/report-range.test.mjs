import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySeries, durationOfEntry, fmtDate } from '../src/lib/time.js';
import { trendDateBounds } from '../src/lib/report-range.js';

const formatBounds = ({ from, to }) => ({ from: fmtDate(from), to: fmtDate(to) });

test('today trend bounds include today and the five preceding dates', () => {
  const now = new Date(2026, 7, 17);
  assert.deepEqual(formatBounds(trendDateBounds('today', now, 1)), {
    from: '2026-08-12', to: '2026-08-17',
  });
});

test('week trend bounds cover Monday through Sunday', () => {
  const now = new Date(2026, 7, 17);
  assert.deepEqual(formatBounds(trendDateBounds('week', now, 1)), {
    from: '2026-08-17', to: '2026-08-23',
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
