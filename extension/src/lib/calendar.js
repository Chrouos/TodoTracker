import { fmtDate, startOfWeek, daysBetween } from './time.js';

export class CalendarValidationError extends Error {
  constructor(code, field) {
    super(`calendar.error.${code}`);
    this.name = 'CalendarValidationError';
    this.code = code;
    this.field = field;
  }
}

export function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new CalendarValidationError('date', 'date');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (fmtDate(date) !== value) throw new CalendarValidationError('date', 'date');
  return date;
}

export function addCalendarDays(value, count) {
  const date = calendarDate(value);
  date.setDate(date.getDate() + count);
  return fmtDate(date);
}

export function normalizeCalendarPlan(input, { previous = null, id, now }) {
  if (!input || typeof input.title !== 'string' || !input.title.trim()) throw new CalendarValidationError('title', 'title');
  if (typeof input.allDay !== 'boolean') throw new CalendarValidationError('date', 'allDay');
  const base = {
    id, title: input.title.trim(), projectId: input.projectId || null,
    taskId: input.taskId || null, notes: typeof input.notes === 'string' ? input.notes : '',
    createdAt: previous?.createdAt || now, updatedAt: now,
  };
  if (input.allDay) {
    calendarDate(input.startDate);
    calendarDate(input.endDate);
    if (input.endDate <= input.startDate) throw new CalendarValidationError('end', 'endDate');
    return { ...base, allDay: true, startDate: input.startDate, endDate: input.endDate };
  }
  const iso = (value, field) => {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new CalendarValidationError('date', field);
    calendarDate(value.slice(0, 10));
    const date = new Date(value);
    if (!Number.isFinite(+date)) throw new CalendarValidationError('date', field);
    return date.toISOString();
  };
  const startedAt = iso(input.startedAt, 'startedAt');
  const endedAt = iso(input.endedAt, 'endedAt');
  if (endedAt <= startedAt) throw new CalendarValidationError('end', 'endedAt');
  return { ...base, allDay: false, startedAt, endedAt };
}

export function calendarRange(view, date, weekStartsOn = 1) {
  let from = calendarDate(date);
  let to;
  if (view === 'month') {
    from.setDate(1);
    const next = new Date(from);
    next.setMonth(next.getMonth() + 1);
    from = startOfWeek(from, weekStartsOn);
    to = startOfWeek(next, weekStartsOn);
    if (+to !== +next) to.setDate(to.getDate() + 7);
  } else {
    if (view === 'week') from = startOfWeek(from, weekStartsOn);
    to = new Date(from);
    to.setDate(to.getDate() + (view === 'day' ? 1 : 7));
  }
  const dates = [];
  for (const cursor = new Date(from); cursor < to; cursor.setDate(cursor.getDate() + 1)) dates.push(fmtDate(cursor));
  return { from, to, dates };
}

export function navigateCalendarDate(view, date, direction) {
  const next = calendarDate(date);
  if (view === 'month') {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + direction);
    const end = new Date(next);
    end.setMonth(end.getMonth() + 1, 0);
    next.setDate(Math.min(day, end.getDate()));
  } else next.setDate(next.getDate() + direction * (view === 'day' ? 1 : 7));
  return fmtDate(next);
}

function assignLanes(items) {
  const timed = items.filter(item => !item.item.allDay).sort((a, b) => a.from - b.from || a.to - b.to || String(a.id).localeCompare(String(b.id)));
  let group = [];
  let groupEnd = -Infinity;
  const finish = () => {
    const ends = [];
    for (const item of group) {
      let lane = ends.findIndex(end => end <= item.from);
      if (lane < 0) lane = ends.length;
      ends[lane] = item.to;
      item.lane = lane;
    }
    for (const item of group) {
      item.lanes = Math.max(1, ends.length);
      item.conflict = item.kind === 'plan' && group.length > 1;
    }
  };
  for (const item of timed) {
    if (item.from >= groupEnd) { finish(); group = []; groupEnd = -Infinity; }
    group.push(item);
    groupEnd = Math.max(groupEnd, item.to);
  }
  finish();
}

export function buildCalendarModel(snapshot, {
  view, date, weekStartsOn = 1, projectId = 'all', showPlans = true,
  showActual = true, showDue = true, now = new Date(),
}) {
  const range = calendarRange(view, date, weekStartsOn);
  const days = range.dates.map(day => ({ date: day, plans: [], actual: [], due: [], plannedSeconds: 0, actualSeconds: 0, allDayCount: 0 }));
  const include = item => projectId === 'all' || (projectId === 'none' ? !item.projectId : item.projectId === projectId);
  const addTimed = (item, kind) => {
    const start = +new Date(item.startedAt), end = +new Date(item.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || item.deletedAt || !include(item)) return;
    for (const day of days) {
      const a = +calendarDate(day.date), b = +calendarDate(addCalendarDays(day.date, 1));
      const from = Math.max(start, a), to = Math.min(end, b);
      if (from >= to) continue;
      const s = new Date(from), e = new Date(to);
      const startMinute = s.getHours() * 60 + s.getMinutes() + s.getSeconds() / 60;
      const rawEnd = to === b ? 1440 : e.getHours() * 60 + e.getMinutes() + e.getSeconds() / 60;
      const segment = {
        id: item.id, kind, date: day.date, from, to, startMinute,
        endMinute: Math.min(1440, Math.max(startMinute + 1, rawEnd)),
        seconds: Math.round((to - from) / 1000), lane: 0, lanes: 1, conflict: false,
        continuesBefore: start < a, continuesAfter: end > b, item,
      };
      day[kind === 'plan' ? 'plans' : 'actual'].push(segment);
      day[kind === 'plan' ? 'plannedSeconds' : 'actualSeconds'] += segment.seconds;
    }
  };
  if (showPlans) for (const item of snapshot.calendarPlans || []) {
    if (!include(item)) continue;
    if (!item.allDay) { addTimed(item, 'plan'); continue; }
    for (const day of days) if (item.startDate <= day.date && day.date < item.endDate) {
      day.plans.push({ id: item.id, kind: 'plan', date: day.date, item, lane: 0, lanes: 1, conflict: false, continuesBefore: item.startDate < day.date, continuesAfter: item.endDate > addCalendarDays(day.date, 1) });
      day.allDayCount++;
    }
  }
  if (showActual) {
    const entries = (snapshot.entries || []).filter(entry => !entry.deletedAt);
    for (const entry of entries) addTimed(entry, 'actual');
    const timer = snapshot.timer;
    if (timer && !entries.some(entry => entry.id === timer.entryId)) addTimed({ ...timer, id: timer.entryId, endedAt: new Date(now).toISOString(), running: true }, 'actual');
  }
  if (showDue) for (const item of snapshot.tasks || []) {
    if (!include(item) || ['done', 'archived'].includes(item.status)) continue;
    const day = days.find(d => d.date === item.dueDate);
    if (day) day.due.push({ id: item.id, kind: 'due', date: day.date, item });
  }
  for (const day of days) { assignLanes(day.plans); assignLanes(day.actual); }
  const monthWeeks = [];
  if (view === 'month') for (let offset = 0; offset < days.length; offset += 7) {
    const week = days.slice(offset, offset + 7), bars = [], sources = new Map();
    week.forEach((day, column) => {
      for (const segment of [...day.plans, ...day.actual, ...day.due]) {
        const key = `${segment.kind}:${segment.id}`;
        const found = sources.get(key);
        if (found) { found.span = column - found.startColumn + 1; found.continuesAfter = segment.continuesAfter; }
        else sources.set(key, { ...segment, startColumn: column, span: 1 });
      }
    });
    const rows = [];
    for (const bar of [...sources.values()].sort((a, b) => a.startColumn - b.startColumn || b.span - a.span || String(a.id).localeCompare(String(b.id)))) {
      let row = rows.findIndex(end => end <= bar.startColumn);
      if (row < 0) row = rows.length;
      rows[row] = bar.startColumn + bar.span;
      bars.push({ ...bar, row });
    }
    monthWeeks.push({ date: week[0].date, bars });
  }
  return { range, days, monthWeeks };
}

const TIMED_TITLE_HEIGHT = 20;
const TIMED_MIN_HEIGHT = 20;

/**
 * 週／日檢視的定位。重疊事件是錯開疊放，開始時間太接近時上層會蓋住下層標題，
 * 所以把上層往下推到標題之後；底部仍對齊真實結束時間。
 */
export function layoutTimedSegments(segments, hourHeight = 64) {
  const placed = [];
  return [...segments]
    .sort((a, b) => a.startMinute - b.startMinute || a.lane - b.lane)
    .map((segment) => {
      const exactTop = segment.startMinute / 60 * hourHeight;
      const bottom = Math.max(exactTop + TIMED_MIN_HEIGHT, segment.endMinute / 60 * hourHeight);
      let top = exactTop;
      for (const other of placed) {
        if (other.segment.lane < segment.lane && segment.startMinute < other.segment.endMinute) {
          top = Math.max(top, other.top + TIMED_TITLE_HEIGHT);
        }
      }
      const layout = { segment, top, height: Math.max(TIMED_MIN_HEIGHT, bottom - top) };
      placed.push(layout);
      return layout;
    });
}

export function calendarPointerChange(plan, { mode, sourceDate, targetDate, minuteDelta = 0 }) {
  if (mode === 'move' && sourceDate) {
    const originalDate = plan.allDay ? plan.startDate : fmtDate(plan.startedAt);
    targetDate = addCalendarDays(originalDate, daysBetween(sourceDate, targetDate));
  }
  if (plan.allDay) return { ...plan, startDate: targetDate, endDate: addCalendarDays(targetDate, daysBetween(plan.startDate, plan.endDate)) };
  const start = new Date(plan.startedAt), end = new Date(plan.endedAt);
  const delta = Math.round(minuteDelta / 15) * 15;
  if (mode === 'move') {
    const diff = daysBetween(fmtDate(start), targetDate || fmtDate(start));
    start.setDate(start.getDate() + diff);
    end.setDate(end.getDate() + diff);
    start.setMinutes(start.getMinutes() + delta);
    end.setMinutes(end.getMinutes() + delta);
  } else if (mode === 'resize-start') start.setTime(Math.min(+end - 15 * 60000, +start + delta * 60000));
  else end.setTime(Math.max(+start + 15 * 60000, +end + delta * 60000));
  return { ...plan, startedAt: start.toISOString(), endedAt: end.toISOString() };
}

