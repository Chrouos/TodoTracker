import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { calendarRange, navigateCalendarDate, normalizeCalendarPlan, buildCalendarModel, layoutTimedSegments } from './calendar.js';

const at = (date, time) => new Date(`${date}T${time}:00`).toISOString();
const plan = (id, start, end, extra = {}) => ({ id, title: id, allDay: false, startedAt: at('2026-10-20', start), endedAt: at('2026-10-20', end), projectId: null, taskId: null, ...extra });
const model = (snapshot, options = {}) => buildCalendarModel(snapshot, { view: 'day', date: '2026-10-20', now: new Date(at('2026-10-20', '12:00')), ...options });

test('calendar ranges and navigation follow local calendar boundaries', () => {
  assert.equal(calendarRange('month', '2021-02-14', 1).dates.length, 28);
  assert.equal(calendarRange('month', '2026-10-20', 1).dates.length, 35);
  assert.deepEqual(calendarRange('week', '2026-10-20', 1).dates, ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(calendarRange('week', '2026-10-20', 0).dates[0], '2026-10-18');
  assert.equal(calendarRange('agenda', '2026-12-29').dates.at(-1), '2027-01-04');
  assert.equal(navigateCalendarDate('month', '2026-01-31', 1), '2026-02-28');
  assert.equal(navigateCalendarDate('day', '2024-02-28', 1), '2024-02-29');
  assert.equal(navigateCalendarDate('week', '2026-12-29', 1), '2027-01-05');
});

test('normalization rejects invalid input and removes opposite kind fields', () => {
  const options = { id: 'p', now: '2026-10-20T00:00:00.000Z' };
  const timed = normalizeCalendarPlan({ ...plan('p', '09:00', '11:00'), title: ' Work ', startDate: '2026-10-20' }, options);
  assert.equal(timed.title, 'Work');
  assert.equal('startDate' in timed, false);
  assert.equal(normalizeCalendarPlan({ ...timed, allDay: true, startDate: '2026-10-20', endDate: '2026-10-21' }, options).startedAt, undefined);
  for (const input of [
    { ...timed, title: ' ' }, { ...timed, endedAt: timed.startedAt },
    { ...timed, startedAt: 'no' }, { ...timed, allDay: true, startDate: '2026-02-30', endDate: '2026-03-02' },
  ]) assert.throws(() => normalizeCalendarPlan(input, options), { name: 'CalendarValidationError' });
  assert.equal(normalizeCalendarPlan(timed, { ...options, previous: { createdAt: 'old' } }).createdAt, 'old');
});

test('midnight is exclusive and cross-day work is clipped to each visible day', () => {
  const cross = plan('night', '23:00', '23:30', { endedAt: at('2026-10-21', '00:00') });
  const m = model({ calendarPlans: [cross] }, { view: 'week' });
  assert.equal(m.days.find(d => d.date === '2026-10-20').plannedSeconds, 3600);
  assert.equal(m.days.find(d => d.date === '2026-10-21').plans.length, 0);
  const actual = { ...cross, startedAt: at('2026-10-19', '23:00'), endedAt: at('2026-10-20', '01:00') };
  assert.equal(model({ entries: [actual] }).days[0].actualSeconds, 3600);
});

test('all-day spans have dates but no planned work seconds', () => {
  const m = model({ calendarPlans: [{ id: 'all', title: 'Trip', allDay: true, startDate: '2026-10-20', endDate: '2026-10-22' }] }, { view: 'week' });
  assert.deepEqual(m.days.map(d => d.allDayCount), [0, 1, 1, 0, 0, 0, 0]);
  assert.equal(m.days.reduce((n, d) => n + d.plannedSeconds, 0), 0);
});

test('overlap lanes separate collisions but not adjacent work', () => {
  const day = model({ calendarPlans: [plan('a', '09:00', '10:00'), plan('b', '09:30', '10:30'), plan('c', '10:30', '11:00')] }).days[0];
  assert.equal(day.plans.find(p => p.id === 'a').conflict, true);
  assert.notEqual(day.plans[0].lane, day.plans[1].lane);
  assert.equal(day.plans.find(p => p.id === 'c').conflict, false);
  assert.equal(day.plannedSeconds, 9000);
});

test('running timers are counted once and filters do not mutate snapshots', () => {
  const entry = { ...plan('running', '09:00', '10:00'), projectId: 'p' };
  const snap = { entries: [entry], timer: { ...entry, entryId: 'running', startedAt: at('2026-10-20', '09:00') }, calendarPlans: [plan('solo', '08:00', '09:00')], tasks: [{ id: 'due', title: 'Deadline', dueDate: '2026-10-20', status: 'todo' }, { id: 'done', dueDate: '2026-10-20', status: 'done' }] };
  const before = JSON.stringify(snap);
  assert.equal(model(snap).days[0].actualSeconds, 3600);
  assert.equal(model(snap).days[0].due.length, 1);
  assert.equal(model(snap, { projectId: 'none' }).days[0].actual.length, 0);
  assert.equal(model(snap, { showPlans: false }).days[0].plans.length, 0);
  assert.equal(JSON.stringify(snap), before);
  assert.equal(model({ timer: snap.timer }).days[0].actualSeconds, 10800);
});

test('month bars split at week boundaries and retain the same source id', () => {
  const m = model({ calendarPlans: [{ id: 'trip', title: 'Trip', allDay: true, startDate: '2026-10-24', endDate: '2026-10-28' }] }, { view: 'month' });
  const bars = m.monthWeeks.flatMap(w => w.bars).filter(b => b.id === 'trip');
  assert.deepEqual(bars.map(b => [b.startColumn, b.span]), [[5, 2], [0, 2]]);
  assert.equal(bars[0].continuesAfter, true);
  assert.equal(bars[1].continuesBefore, true);
});

test('DST days sum elapsed seconds rather than assuming 24 hours', () => {
  const url = new URL('./calendar.js', import.meta.url).href;
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import {buildCalendarModel} from ${JSON.stringify(url)};
    const values = ['2026-03-08','2026-11-01'].map(date => {
      const a = new Date(date+'T00:00:00'), b = new Date(a); b.setDate(b.getDate()+1);
      return buildCalendarModel({entries:[{id:'e',startedAt:a.toISOString(),endedAt:b.toISOString()}]}, {view:'day',date}).days[0].actualSeconds;
    }); console.log(JSON.stringify(values));
  `], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(result), [82800, 90000]);
});

test('layoutTimedSegments keeps the lower title visible but the true end time', () => {
  const lower = { id: 'a', lane: 0, startMinute: 570, endMinute: 630 };
  const upper = { id: 'b', lane: 1, startMinute: 575, endMinute: 615 };
  const [first, second] = layoutTimedSegments([upper, lower]);
  assert.equal(first.segment.id, 'a');
  assert.equal(first.top, 608);
  assert.equal(second.top, 628);
  assert.equal(second.top + second.height, 656);
});

test('layoutTimedSegments leaves far-apart overlaps at their real time', () => {
  const [, later] = layoutTimedSegments([
    { id: 'a', lane: 0, startMinute: 540, endMinute: 720 },
    { id: 'b', lane: 1, startMinute: 600, endMinute: 660 },
  ]);
  assert.equal(later.top, 640);
  assert.equal(later.height, 64);
});

test('layoutTimedSegments does not push events that only touch', () => {
  const [, next] = layoutTimedSegments([
    { id: 'a', lane: 0, startMinute: 540, endMinute: 600 },
    { id: 'b', lane: 0, startMinute: 600, endMinute: 660 },
  ]);
  assert.equal(next.top, 640);
});
