import { startOfDay, startOfWeek } from './time.js';

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
