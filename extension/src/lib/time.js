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
    if (!e.endedAt) continue;
    const start = new Date(e.startedAt);
    const end = new Date(e.endedAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    let cursor = start;
    let guard = 0;
    while (cursor < end && guard++ < 400) {
      const dayStart = startOfDay(cursor);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const clippedStart = new Date(Math.max(start.getTime(), dayStart.getTime()));
      const clippedEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()));
      const key = fmtDate(dayStart);
      if (bucket.has(key) && clippedEnd > clippedStart) {
        bucket.set(key, bucket.get(key) + durationOf({
          ...e,
          startedAt: clippedStart.toISOString(),
          endedAt: clippedEnd.toISOString(),
        }));
      }
      cursor = dayEnd;
    }
  }
  return [...bucket.entries()].map(([date, seconds]) => ({ date, seconds }));
}

export function dailyReviewData(entries, dates) {
  const byDate = new Map(dates.map((date) => [date, []]));
  for (const entry of entries) {
    if (!entry.endedAt || entry.deletedAt) continue;
    const date = fmtDate(entry.startedAt);
    if (byDate.has(date)) byDate.get(date).push(entry);
  }
  return [...byDate.entries()].map(([date, items]) => ({
    date,
    entries: items.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt)),
  }));
}

export function calendarReviewData(entries, dates, defaultFrom = 8 * 60, defaultTo = 18 * 60) {
  const byDate = new Map(dates.map((date) => [date, []]));
  for (const entry of entries) {
    if (!entry.endedAt || entry.deletedAt) continue;
    const date = fmtDate(entry.startedAt);
    if (!byDate.has(date)) continue;
    const started = new Date(entry.startedAt);
    const ended = new Date(entry.endedAt);
    const start = started.getHours() * 60 + started.getMinutes();
    const end = Math.max(start + 1, ended.getHours() * 60 + ended.getMinutes());
    byDate.get(date).push({ entry, id: entry.id, start, end });
  }

  let axisFrom = defaultFrom;
  let axisTo = defaultTo;
  for (const items of byDate.values()) {
    for (const item of items) {
      axisFrom = Math.min(axisFrom, Math.floor(item.start / 60) * 60);
      axisTo = Math.max(axisTo, Math.ceil(item.end / 60) * 60);
    }
  }

  const days = [...byDate.entries()].map(([date, items]) => {
    const laneEnds = [];
    const sorted = items.sort((a, b) => a.start - b.start || a.end - b.end);
    for (const item of sorted) {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = item.end;
      item.lane = lane;
    }
    const lanes = Math.max(1, laneEnds.length);
    return { date, entries: sorted.map((item) => ({ ...item, lanes })) };
  });
  return { axis: { from: axisFrom, to: axisTo }, days };
}

export function calendarEntryTooltip(title, entry, projectName) {
  const note = String(entry.notes || '')
    .replace(/[\n\r]+/g, ' ')
    .replace(/[`*_#[\]()>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return [title, `${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}`, projectName, note]
    .filter(Boolean)
    .join('\n');
}

/** 兩個 YYYY-MM-DD 之間相差幾天（b - a）。用 UTC 算避免日光節約時間誤差 */
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

/**
 * 時間軸資料：把每筆紀錄切成「當天的分鐘區間」。
 * 跨午夜的紀錄會被切成兩段，分別掛到兩天。
 * 重疊的區間會分配到不同 lane，畫的時候並排不互相蓋住。
 *
 * @returns {{days: {date:string, blocks:{s:number,e:number,lane:number,lanes:number,entry:object}[]}[], minMin:number, maxMin:number}}
 */
export function timelineData(entries, dates) {
  const byDay = new Map(dates.map((d) => [d, []]));

  for (const e of entries) {
    if (!e.endedAt) continue;
    const end = new Date(e.endedAt);
    let cursor = new Date(e.startedAt);
    let guard = 0;
    while (cursor < end && guard++ < 400) {
      const dayKey = fmtDate(cursor);
      const midnight = new Date(cursor);
      midnight.setHours(24, 0, 0, 0);
      const segEnd = end < midnight ? end : midnight;
      if (byDay.has(dayKey)) {
        const s = cursor.getHours() * 60 + cursor.getMinutes();
        const raw = segEnd.getTime() === midnight.getTime()
          ? 1440
          : segEnd.getHours() * 60 + segEnd.getMinutes();
        byDay.get(dayKey).push({ s, e: Math.max(raw, s + 1), entry: e });
      }
      cursor = midnight;
    }
  }

  let minMin = 1440;
  let maxMin = 0;
  const days = dates.map((date) => {
    const blocks = (byDay.get(date) || []).sort((a, b) => a.s - b.s || a.e - b.e);
    // lane 分配：跟前面還沒結束的區塊錯開
    const laneEnd = [];
    for (const b of blocks) {
      let lane = laneEnd.findIndex((t) => t <= b.s);
      if (lane === -1) { lane = laneEnd.length; laneEnd.push(0); }
      laneEnd[lane] = b.e;
      b.lane = lane;
      if (b.s < minMin) minMin = b.s;
      if (b.e > maxMin) maxMin = b.e;
    }
    const lanes = Math.max(1, laneEnd.length);
    for (const b of blocks) b.lanes = lanes;
    return { date, blocks };
  });

  if (maxMin === 0) { minMin = 9 * 60; maxMin = 18 * 60; } // 沒資料時給個預設視窗
  return { days, minMin, maxMin };
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 從 datetime-local input 值轉 ISO，反之亦然 */
export function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  return new Date(v).toISOString();
}
