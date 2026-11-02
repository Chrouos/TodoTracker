import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeRange,
  clipEntryToRange,
  currentWeekDateRange,
  dailyReviewData,
  runningSecondsSince,
  durationInRange,
  entryOverlapsRange,
  localDateRange,
  rangeControlState,
} from './time.js';

test('range helpers include and clip overnight work by the selected local window', () => {
  const overnight = {
    startedAt: '2026-08-10T23:30:00+08:00',
    endedAt: '2026-08-11T01:30:00+08:00',
  };
  const dayAfter = new Date(2026, 7, 11);
  const nextDay = new Date(2026, 7, 12);

  assert.equal(entryOverlapsRange(overnight, dayAfter, nextDay), true);
  assert.equal(durationInRange(overnight, dayAfter, nextDay), 90 * 60);
  assert.equal(durationInRange(overnight, new Date(2026, 7, 10), dayAfter), 30 * 60);
  const clipped = clipEntryToRange(overnight, dayAfter, nextDay);
  assert.equal(clipped.startedAt, dayAfter.toISOString());
  assert.equal(clipped.endedAt, new Date(2026, 7, 11, 1, 30).toISOString());
});

test('dailyReviewData keeps empty dates and sorts work by start time', () => {
  const result = dailyReviewData([
    { id: 'late', startedAt: '2026-08-11T13:00:00+08:00', endedAt: '2026-08-11T14:00:00+08:00' },
    { id: 'deleted', startedAt: '2026-08-10T09:00:00+08:00', endedAt: '2026-08-10T10:00:00+08:00', deletedAt: '2026-08-10T10:01:00+08:00' },
    { id: 'early', startedAt: '2026-08-11T09:00:00+08:00', endedAt: '2026-08-11T10:00:00+08:00' },
    { id: 'open', startedAt: '2026-08-12T09:00:00+08:00' },
  ], ['2026-08-10', '2026-08-11', '2026-08-12']);

  assert.deepEqual(result.map((group) => group.date), ['2026-08-10', '2026-08-11', '2026-08-12']);
  assert.deepEqual(result[0].entries, []);
  assert.deepEqual(result[1].entries.map((entry) => entry.id), ['early', 'late']);
  assert.deepEqual(result[2].entries, []);
});

test('dailyReviewData splits overnight work into each local calendar day', () => {
  const start = new Date(2026, 7, 10, 23, 30);
  const midnight = new Date(2026, 7, 11);
  const end = new Date(2026, 7, 11, 1, 30);
  const result = dailyReviewData([{
    id: 'overnight',
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
  }], ['2026-08-10', '2026-08-11']);

  assert.deepEqual(result.map((group) => group.entries.map((entry) => ({
    id: entry.id,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
  }))), [
    [{ id: 'overnight', startedAt: start.toISOString(), endedAt: midnight.toISOString() }],
    [{ id: 'overnight', startedAt: midnight.toISOString(), endedAt: end.toISOString() }],
  ]);
});

test('runningSecondsSince only counts time after the boundary', () => {
  const now = new Date(2026, 7, 11, 10, 0);
  const today = new Date(2026, 7, 11);
  assert.equal(runningSecondsSince({ startedAt: new Date(2026, 7, 11, 9, 0).toISOString() }, today, now), 3600);
  assert.equal(runningSecondsSince({ startedAt: new Date(2026, 7, 10, 23, 0).toISOString() }, today, now), 36000);
  assert.equal(runningSecondsSince(null, today, now), 0);
  assert.equal(runningSecondsSince({ startedAt: new Date(2026, 7, 11, 11, 0).toISOString() }, today, now), 0);
});

test('rangeControlState switches between quick ranges and custom controls', () => {
  assert.deepEqual(rangeControlState(false), { quick: true, custom: false, back: false });
  assert.deepEqual(rangeControlState(true), { quick: false, custom: true, back: true });
});

test('activeRange highlights custom while custom controls are open', () => {
  assert.equal(activeRange('all', true), 'custom');
  assert.equal(activeRange('month', true), 'custom');
  assert.equal(activeRange('week', false), 'week');
});

test('currentWeekDateRange defaults to Monday through Sunday', () => {
  assert.deepEqual(currentWeekDateRange(new Date(2026, 7, 12)), {
    from: '2026-08-10',
    to: '2026-08-16',
  });
});

test('localDateRange includes both local calendar dates', () => {
  const result = localDateRange('2026-08-10', '2026-08-12');
  assert.equal(result.from.getHours(), 0);
  assert.equal(result.from.getDate(), 10);
  assert.equal(result.to.getDate(), 13);
});

test('localDateRange rejects incomplete and reversed ranges', () => {
  assert.equal(localDateRange('', '2026-08-12'), null);
  assert.equal(localDateRange('2026-08-13', '2026-08-12'), null);
});
