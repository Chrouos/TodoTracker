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
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    return { from, to };
  }

  throw new Error(`Unsupported trend range: ${range}`);
}
