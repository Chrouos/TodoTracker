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

/** 連續每日序列（沒紀錄的日子補 0），折線圖才不會斷掉。durationOf 用來取秒數 */
export function dailySeries(entries, from, to, durationOf) {
  const bucket = new Map();
  for (const d = startOfDay(from); d <= to; d.setDate(d.getDate() + 1)) {
    bucket.set(fmtDate(d), 0);
  }
  for (const e of entries) {
    const k = fmtDate(e.startedAt);
    if (bucket.has(k)) bucket.set(k, bucket.get(k) + durationOf(e));
  }
  return [...bucket.entries()].map(([date, seconds]) => ({ date, seconds }));
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
