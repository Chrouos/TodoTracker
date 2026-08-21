import type { Entry, Project } from './types';
import { splitEntryByDay } from './report';

export function fmtHMS(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function fmtHM(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

const p2 = (n: number) => String(n).padStart(2, '0');

export function fmtClock(iso: string): string {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function fmtDate(iso: string | Date): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date = new Date(), weekStartsOn = 1): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() - weekStartsOn + 7) % 7));
  return x;
}

export function startOfMonth(d: Date = new Date()): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

/* ---------------- 統計 ---------------- */

export function durationSec(e: Entry): number {
  if (!e.endedAt) return 0;
  return Math.max(0, Math.round((+new Date(e.endedAt) - +new Date(e.startedAt)) / 1000));
}

/** 兩個 YYYY-MM-DD 相差幾天（b - a）。用 UTC 算避免日光節約時間誤差 */
export function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(b) - d(a)) / 864e5);
}

/* ---------------- 時間軸 ---------------- */

export type Block = { s: number; e: number; lane: number; lanes: number; entry: Entry };
export type TimelineDay = { date: string; blocks: Block[] };
export type Timeline = { days: TimelineDay[]; minMin: number; maxMin: number };

/**
 * 把每筆紀錄切成「當天的分鐘區間」。
 * 跨午夜的會切成兩段分掛兩天；重疊的分配到不同 lane，畫的時候並排。
 */
export function timelineData(entries: Entry[], dates: string[]): Timeline {
  const byDay = new Map<string, Block[]>(dates.map((d) => [d, []]));

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
      const list = byDay.get(dayKey);
      if (list) {
        const s = cursor.getHours() * 60 + cursor.getMinutes();
        const raw = segEnd.getTime() === midnight.getTime()
          ? 1440
          : segEnd.getHours() * 60 + segEnd.getMinutes();
        list.push({ s, e: Math.max(raw, s + 1), lane: 0, lanes: 1, entry: e });
      }
      cursor = midnight;
    }
  }

  let minMin = 1440;
  let maxMin = 0;
  const days = dates.map((date) => {
    const blocks = (byDay.get(date) ?? []).sort((a, b) => a.s - b.s || a.e - b.e);
    const laneEnd: number[] = [];
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

  if (maxMin === 0) return { days, minMin: 9 * 60, maxMin: 18 * 60 };
  return { days, minMin, maxMin };
}

export type ProjectGroup = {
  projectId: string | null;
  name: string;
  color: string;
  seconds: number;
};

/**
 * 產生連續的每日序列（沒有紀錄的日子補 0），折線圖才不會斷掉。
 * from / to 都含在內。
 */
export function dailySeries(
  entries: Entry[], from: Date, to: Date,
): { date: string; seconds: number }[] {
  const bucket = new Map<string, number>();
  for (let d = startOfDay(from); d <= to; d.setDate(d.getDate() + 1)) {
    bucket.set(fmtDate(d), 0);
  }
  for (const e of entries) {
    for (const part of splitEntryByDay(e)) {
      if (bucket.has(part.date)) bucket.set(part.date, bucket.get(part.date)! + part.seconds);
    }
  }
  return [...bucket.entries()].map(([date, seconds]) => ({ date, seconds }));
}

export function groupByProject(entries: Entry[], projects: Project[]): ProjectGroup[] {
  const map = new Map<string, { projectId: string | null; seconds: number }>();
  for (const e of entries) {
    const key = e.projectId ?? '__none__';
    if (!map.has(key)) map.set(key, { projectId: e.projectId, seconds: 0 });
    map.get(key)!.seconds += durationSec(e);
  }
  return [...map.values()]
    .map((g) => {
      const p = projects.find((x) => x.id === g.projectId);
      return { ...g, name: p ? p.name : '（未分類）', color: p ? p.color : '#9a9898' };
    })
    .sort((a, b) => b.seconds - a.seconds);
}
