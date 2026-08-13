import test from 'node:test';
import assert from 'node:assert/strict';
import { activeRange, calendarEntryTooltip, calendarReviewData, currentWeekDateRange, dailyReviewData, localDateRange, rangeControlState } from './time.js';

test('calendarEntryTooltip includes readable work context', () => {
  const tooltip = calendarEntryTooltip('API 問題', {
    startedAt: '2026-08-10T09:00:00+08:00',
    endedAt: '2026-08-10T10:30:00+08:00',
    notes: '**回覆** c01\n第二行',
  }, '客服內部應用');

  assert.equal(tooltip, 'API 問題\n09:00–10:30\n客服內部應用\n回覆 c01 第二行');
});

test('calendarReviewData maps work to a shared time axis', () => {
  const result = calendarReviewData([
    { id: 'late', startedAt: '2026-08-10T13:30:00+08:00', endedAt: '2026-08-10T15:00:00+08:00' },
    { id: 'early', startedAt: '2026-08-10T09:00:00+08:00', endedAt: '2026-08-10T10:30:00+08:00' },
    { id: 'next', startedAt: '2026-08-11T10:00:00+08:00', endedAt: '2026-08-11T11:00:00+08:00' },
  ], ['2026-08-10', '2026-08-11']);

  assert.deepEqual(result.axis, { from: 8 * 60, to: 18 * 60 });
  assert.deepEqual(result.days[0].entries.map(({ id, start, end }) => ({ id, start, end })), [
    { id: 'early', start: 540, end: 630 },
    { id: 'late', start: 810, end: 900 },
  ]);
  assert.deepEqual(result.days[1].entries[0].start, 600);
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
