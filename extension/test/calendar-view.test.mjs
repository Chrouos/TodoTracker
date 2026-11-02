import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCalendarModel } from '../src/lib/calendar.js';
import { calendarViewMarkup } from '../src/options/calendar-view.js';

const date = '2026-10-20';
const snap = { calendarPlans: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, title: i ? `Work ${i}` : '<img src=x onerror=alert(1)>', allDay: true, startDate: date, endDate: '2026-10-21' })) };
test('calendar month escapes user content and exposes overflow and date actions', () => {
  const markup = calendarViewMarkup(buildCalendarModel(snap, { view: 'month', date }), { view: 'month', selectedDate: date, locale: 'en' });
  assert.equal(markup.includes('<img src=x'), false);
  assert.ok(markup.includes('&lt;img'));
  assert.ok(markup.includes('data-cal-day="2026-10-20"'));
  assert.ok(markup.includes('2 more'));
  assert.equal((markup.match(/data-cal-plan="p[0-4]"/g) || []).length, 3);
});
test('week and agenda distinguish planned time from tracked work and deadlines', () => {
  const snapshot = { ...snap, entries: [{ id: 'e', description: 'Actual work', startedAt: new Date('2026-10-20T09:30:00').toISOString(), endedAt: new Date('2026-10-20T10:30:00').toISOString() }], tasks: [{ id: 't', title: 'Due task', status: 'todo', dueDate: date }] };
  for (const view of ['week', 'day', 'agenda']) {
    const markup = calendarViewMarkup(buildCalendarModel(snapshot, { view, date }), { view, selectedDate: date, locale: 'en' });
    assert.ok(markup.includes('Actual work'));
    assert.ok(markup.includes('data-cal-entry="e"'));
    assert.ok(markup.includes('data-cal-task="t"'));
    assert.ok(markup.includes('Planned'));
    assert.ok(markup.includes('Actual'));
  }
});
