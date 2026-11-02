import { startOfDay, startOfWeek } from './time.js';

export function reportRangeBounds(range, now = new Date(), weekStartsOn = 1) {
  const today = startOfDay(now);

  if (range === 'today') {
    const to = new Date(today);
    to.setDate(to.getDate() + 1);
    return { from: today, to };
  }

  if (range === 'week') {
    const from = startOfWeek(today, weekStartsOn);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }

  if (range === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    return { from, to };
  }

  if (range === 'all') return { from: new Date(0), to: null };

  throw new Error(`Unsupported report range: ${range}`);
}

export function trendDateBounds(range, now = new Date(), weekStartsOn = 1) {
  const today = startOfDay(now);

  if (range === 'today') {
    const from = new Date(today);
    from.setDate(from.getDate() - 5);
    return { from, to: today };
  }

  if (range === 'week') {
    const from = startOfWeek(today, weekStartsOn);
    return { from, to: today };
  }

  throw new Error(`Unsupported trend range: ${range}`);
}

const shiftDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/**
 * KPI 比較區間。今天／本週／本月只比「同樣經過的時間」，
 * 否則週一早上跟上週整週比，永遠是大幅下降。「全部」沒有上一期。
 */
export function comparisonBounds(range, bounds, now = new Date()) {
  const { from, to } = bounds;
  if (range === 'all' || !to) return null;
  if (range === 'custom') {
    const days = Math.round((to - from) / 86400000);
    return { current: { from, to }, previous: { from: shiftDays(from, -days), to: from } };
  }
  const cutoff = now < to ? now : to;
  if (range === 'month') {
    const previousFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const elapsed = new Date(
      from.getFullYear(), from.getMonth() - 1, cutoff.getDate(),
      cutoff.getHours(), cutoff.getMinutes(), cutoff.getSeconds(),
    );
    // 3/31 對應的上個月沒有 31 號時，就算到上個月結束
    const previousTo = elapsed < from && elapsed.getMonth() === previousFrom.getMonth() ? elapsed : from;
    return { current: { from, to: cutoff }, previous: { from: previousFrom, to: previousTo } };
  }
  const days = range === 'today' ? 1 : 7;
  return { current: { from, to: cutoff }, previous: { from: shiftDays(from, -days), to: shiftDays(cutoff, -days) } };
}

/** 與上一期的變化百分比；上一期是 0 時沒有比較基準，回傳 null */
export function deltaPercent(current, previous) {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}
