function localDayStart(date) {
  return new Date(`${date}T00:00:00`);
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function clampStart(left, right) {
  return left > right ? left : right;
}

function clampEnd(left, right) {
  return left < right ? left : right;
}

function overlapSeconds(start, end, windowStart, windowEnd) {
  const clippedStart = clampStart(start, windowStart);
  const clippedEnd = clampEnd(end, windowEnd);
  if (clippedEnd <= clippedStart) return 0;
  return Math.max(0, Math.round((clippedEnd - clippedStart) / 1000));
}

function entryDetail(entry, windowStart, windowEnd, durationSec) {
  const startedAt = new Date(entry.startedAt);
  const endedAt = new Date(entry.endedAt);
  if (!isValidDate(startedAt) || !isValidDate(endedAt) || endedAt <= startedAt) return null;
  const clippedStart = clampStart(startedAt, windowStart);
  const clippedEnd = clampEnd(endedAt, windowEnd);
  const seconds = durationSec
    ? Math.max(0, Number(durationSec({
      startedAt: clippedStart.toISOString(), endedAt: clippedEnd.toISOString(),
    })) || 0)
    : overlapSeconds(startedAt, endedAt, windowStart, windowEnd);
  if (!seconds) return null;
  return {
    id: entry.id,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    seconds,
    notes: entry.notes || '',
    description: entry.description || '',
  };
}

export function buildTodoTrackerData({
  tasks = [],
  entries = [],
  dates = [],
  now = new Date(),
  durationSec = null,
}) {
  const safeDates = [...dates];
  if (!safeDates.length) return { dates: safeDates, windowStart: null, windowEnd: null, items: [] };

  const windowStart = localDayStart(safeDates[0]);
  const windowEnd = new Date(localDayStart(safeDates[safeDates.length - 1]).getTime() + 864e5);
  const nowDate = new Date(now);
  const items = tasks
    .filter((task) => task.status !== 'archived')
    .map((task) => {
      const openedAt = new Date(task.openedAt);
      const endedAt = task.completedAt ? new Date(task.completedAt) : nowDate;
      if (!isValidDate(openedAt) || !isValidDate(endedAt) || endedAt <= openedAt) return null;
      if (endedAt <= windowStart || openedAt >= windowEnd) return null;

      const itemEntries = entries
        .filter((entry) => entry.taskId === task.id && entry.endedAt && !entry.deletedAt)
        .map((entry) => entryDetail(entry, windowStart, windowEnd, durationSec))
        .filter(Boolean);

      return {
        id: task.id,
        title: task.title || '未命名 Todo',
        projectId: task.projectId || null,
        status: task.status || 'todo',
        notes: task.notes || '',
        openedAt: task.openedAt,
        endedAt: task.completedAt || null,
        visibleStart: clampStart(openedAt, windowStart),
        visibleEnd: clampEnd(endedAt, windowEnd),
        lifecycleSeconds: Math.max(0, Math.round((endedAt - openedAt) / 1000)),
        trackedSeconds: itemEntries.reduce((sum, entry) => sum + entry.seconds, 0),
        entries: itemEntries,
        openedAtMs: openedAt.getTime(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.openedAtMs - right.openedAtMs || left.title.localeCompare(right.title))
    .map(({ openedAtMs, ...item }) => item);

  return { dates: safeDates, windowStart, windowEnd, items };
}
