import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarPointerChange } from '../src/lib/calendar.js';
const plan = { id: 'p', allDay: false, startedAt: new Date('2026-10-20T09:00:00').toISOString(), endedAt: new Date('2026-10-20T10:00:00').toISOString() };
test('calendar movement snaps to quarters and preserves local clock times across days', () => {
  const moved = calendarPointerChange(plan, { mode: 'move', targetDate: '2026-10-21', minuteDelta: 19 });
  assert.equal(new Date(moved.startedAt).getHours(), 9);
  assert.equal(new Date(moved.startedAt).getMinutes(), 15);
  assert.equal(new Date(moved.startedAt).getDate(), 21);
  assert.equal(new Date(moved.endedAt) - new Date(moved.startedAt), 3600000);
});
test('resizing preserves a minimum fifteen-minute interval', () => {
  const start = calendarPointerChange(plan, { mode: 'resize-start', minuteDelta: 100 });
  assert.equal(new Date(start.endedAt) - new Date(start.startedAt), 900000);
  const end = calendarPointerChange(plan, { mode: 'resize-end', minuteDelta: -100 });
  assert.equal(new Date(end.endedAt) - new Date(end.startedAt), 900000);
});
test('month movement keeps all-day duration and timed local hour', () => {
  const moved = calendarPointerChange({ id: 'all', allDay: true, startDate: '2026-10-30', endDate: '2026-11-02' }, { mode: 'move', targetDate: '2026-11-01' });
  assert.equal(moved.startDate, '2026-11-01');
  assert.equal(moved.endDate, '2026-11-04');
  assert.equal(new Date(calendarPointerChange(plan, { mode: 'move', targetDate: '2026-11-01' }).startedAt).getHours(), 9);
});

test('dragging a continuation or a middle day shifts the original plan by the grabbed-day delta', () => {
  const long = { id: 'trip', allDay: true, startDate: '2026-10-24', endDate: '2026-10-27' };
  const shifted = calendarPointerChange(long, { mode: 'move', sourceDate: '2026-10-26', targetDate: '2026-10-27' });
  assert.equal(shifted.startDate, '2026-10-25');
  assert.equal(shifted.endDate, '2026-10-28');
  const middle = calendarPointerChange(long, { mode: 'move', sourceDate: '2026-10-25', targetDate: '2026-10-26' });
  assert.equal(middle.startDate, '2026-10-25');
});
