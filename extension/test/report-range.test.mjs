import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtDate } from '../src/lib/time.js';
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
