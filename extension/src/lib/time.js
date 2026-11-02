/** time.js — 時間格式化與區間計算。全部用本機時區。 */

export function fmtHMS(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function fmtHM(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** badge 只有 4 個字元，所以 <1h 顯示 45m、>=1h 顯示 2.5h */
export function fmtBadge(sec) {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = m / 60;
  return h < 10 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`;
}

export function fmtClock(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d = new Date(), weekStartsOn = 1) {
  const x = startOfDay(d);
  const diff = (x.getDay() - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export function startOfMonth(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function localDateRange(fromDate, toDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(toDate || '')) {
    return null;
  }
  const [fromYear, fromMonth, fromDay] = fromDate.split('-').map(Number);
  const [toYear, toMonth, toDay] = toDate.split('-').map(Number);
  const from = new Date(fromYear, fromMonth - 1, fromDay);
  const to = new Date(toYear, toMonth - 1, toDay);
  if (from.getFullYear() !== fromYear || from.getMonth() !== fromMonth - 1 || from.getDate() !== fromDay
    || to.getFullYear() !== toYear || to.getMonth() !== toMonth - 1 || to.getDate() !== toDay
    || from > to) {
    return null;
  }
  to.setDate(to.getDate() + 1);
  return { from, to };
}

function entryBounds(entry) {
  if (!entry?.endedAt) return null;
  const start = new Date(entry.startedAt);
  const end = new Date(entry.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { start, end };
}

/** 判斷工作紀錄是否與 [from, to) 的本機時間區間重疊。 */
export function entryOverlapsRange(entry, from, to = null) {
  const bounds = entryBounds(entry);
  if (!bounds) return false;
  const rangeStart = new Date(from);
  const rangeEnd = to ? new Date(to) : null;
  if (Number.isNaN(rangeStart.getTime()) || (rangeEnd && Number.isNaN(rangeEnd.getTime()))) return false;
  return bounds.end > rangeStart && (!rangeEnd || bounds.start < rangeEnd);
}

/** 取得工作紀錄在 [from, to) 本機時間區間內實際重疊的秒數。 */
export function durationInRange(entry, from, to = null) {
  const bounds = entryBounds(entry);
  if (!bounds) return 0;
  const rangeStart = new Date(from);
  const rangeEnd = to ? new Date(to) : null;
  if (Number.isNaN(rangeStart.getTime()) || (rangeEnd && Number.isNaN(rangeEnd.getTime()))) return 0;
  const clippedStart = Math.max(bounds.start.getTime(), rangeStart.getTime());
  const clippedEnd = rangeEnd
    ? Math.min(bounds.end.getTime(), rangeEnd.getTime())
    : bounds.end.getTime();
  return clippedEnd > clippedStart ? Math.round((clippedEnd - clippedStart) / 1000) : 0;
}

/** 產生只涵蓋指定區間的工作紀錄副本，供報表顯示與統計使用。 */
export function clipEntryToRange(entry, from, to = null) {
  const bounds = entryBounds(entry);
  if (!bounds || !entryOverlapsRange(entry, from, to)) return null;
  const rangeStart = new Date(from);
  const rangeEnd = to ? new Date(to) : null;
  const clippedStart = new Date(Math.max(bounds.start.getTime(), rangeStart.getTime()));
  const clippedEnd = new Date(rangeEnd
    ? Math.min(bounds.end.getTime(), rangeEnd.getTime())
    : bounds.end.getTime());
  return {
    ...entry,
    startedAt: clippedStart.toISOString(),
    endedAt: clippedEnd.toISOString(),
    seconds: Math.round((clippedEnd - clippedStart) / 1000),
  };
}

/** 把工作紀錄切成各本機日的片段，讓跨午夜紀錄能同時出現在兩天。 */
export function splitEntryByDay(entry) {
  const bounds = entryBounds(entry);
  if (!bounds) return [];
  const parts = [];
  let cursor = new Date(bounds.start);
  let guard = 0;
  while (cursor < bounds.end && guard++ < 400) {
    const dayStart = startOfDay(cursor);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const clippedStart = new Date(Math.max(bounds.start.getTime(), dayStart.getTime()));
    const clippedEnd = new Date(Math.min(bounds.end.getTime(), dayEnd.getTime()));
    if (clippedEnd > clippedStart) {
      parts.push({
        ...entry,
        startedAt: clippedStart.toISOString(),
        endedAt: clippedEnd.toISOString(),
        seconds: Math.round((clippedEnd - clippedStart) / 1000),
      });
    }
    cursor = dayEnd;
  }
  return parts;
}

export function activeRange(range, customOpen) {
  return customOpen ? 'custom' : range;
}

export function rangeControlState(customOpen) {
  return { quick: !customOpen, custom: customOpen, back: customOpen };
}

export function currentWeekDateRange(d = new Date()) {
  const from = startOfWeek(d, 1);
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from: fmtDate(from), to: fmtDate(to) };
}

/** 連續每日序列（沒紀錄的日子補 0），折線圖才不會斷掉。durationOf 用來取秒數 */
export function dailySeries(entries, from, to, durationOf) {
  const bucket = new Map();
  for (const d = startOfDay(from); d <= to; d.setDate(d.getDate() + 1)) {
    bucket.set(fmtDate(d), 0);
  }
  for (const e of entries) {
    for (const part of splitEntryByDay(e)) {
      const key = fmtDate(part.startedAt);
      if (bucket.has(key)) bucket.set(key, bucket.get(key) + durationOf(part));
    }
  }
  return [...bucket.entries()].map(([date, seconds]) => ({ date, seconds }));
}

export function dailyReviewData(entries, dates) {
  const byDate = new Map(dates.map((date) => [date, []]));
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    for (const part of splitEntryByDay(entry)) {
      const date = fmtDate(part.startedAt);
      if (byDate.has(date)) byDate.get(date).push(part);
    }
  }
  return [...byDate.entries()].map(([date, items]) => ({
    date,
    entries: items.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt)),
  }));
}

export function daysBetween(a, b) {
  if (!a || !b) return null;
  const d = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(b) - d(a)) / 864e5);
}

/** 一筆紀錄的長度（秒）。db.js 也有一份，這裡避免循環相依 */
export function durationOfEntry(e) {
  if (!e.endedAt) return 0;
  return Math.max(0, Math.round((new Date(e.endedAt) - new Date(e.startedAt)) / 1000));
}

/** 計時中那一段從 from 之後累積的秒數；紀錄要停止後才會存進 entries */
export function runningSecondsSince(timer, from, now = new Date()) {
  if (!timer?.startedAt) return 0;
  const start = Math.max(new Date(timer.startedAt).getTime(), new Date(from).getTime());
  return Math.max(0, (new Date(now).getTime() - start) / 1000);
}

export function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  return new Date(v).toISOString();
}
