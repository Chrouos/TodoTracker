function localDayStart(date) {
  return new Date(`${date}T00:00:00`);
}

function dateKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function datesBetween(start, end) {
  const first = localDayStart(dateKey(start));
  const last = localDayStart(dateKey(end));
  const dates = [];
  for (let cursor = first; cursor <= last; cursor = new Date(cursor.getTime() + 864e5)) {
    dates.push(dateKey(cursor));
  }
  return dates;
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

const MIN_TRACKER_SECONDS = 30;

function rawEntrySeconds(entry, durationSec) {
  const startedAt = new Date(entry.startedAt);
  const endedAt = new Date(entry.endedAt);
  if (!isValidDate(startedAt) || !isValidDate(endedAt) || endedAt <= startedAt) return 0;
  if (durationSec) return Math.max(0, Number(durationSec(entry)) || 0);
  return Math.max(0, Math.round((endedAt - startedAt) / 1000));
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
    visibleStart: clippedStart,
    visibleEnd: clippedEnd,
    seconds,
    notes: entry.notes || '',
    description: entry.description || '',
  };
}

function deriveDates(tasks, entries, now, durationSec) {
  const validEntries = entries.filter((entry) => entry.taskId && entry.endedAt && !entry.deletedAt
    && rawEntrySeconds(entry, durationSec) >= MIN_TRACKER_SECONDS);
  let first = null;
  let last = null;
  for (const task of tasks) {
    if (task.status === 'archived') continue;
    const taskEntries = validEntries.filter((entry) => entry.taskId === task.id);
    if (!taskEntries.length) continue;
    const firstEntryStart = taskEntries
      .map((entry) => new Date(entry.startedAt))
      .filter(isValidDate)
      .sort((left, right) => left - right)[0];
    const openedAt = new Date(task.openedAt || firstEntryStart);
    const endedAt = task.completedAt ? new Date(task.completedAt) : new Date(now);
    if (!isValidDate(openedAt) || !isValidDate(endedAt)) continue;
    if (!first || openedAt < first) first = openedAt;
    if (!last || endedAt > last) last = endedAt;
  }
  return first && last ? datesBetween(first, last) : [];
}

function calendarDays(start, end) {
  return Math.floor((localDayStart(dateKey(end)) - localDayStart(dateKey(start))) / 864e5) + 1;
}

function workedDateKeys(entries) {
  const dates = new Set();
  for (const entry of entries) {
    const start = new Date(entry.startedAt);
    const end = new Date(entry.endedAt);
    if (!isValidDate(start) || !isValidDate(end) || end <= start) continue;
    for (let cursor = localDayStart(dateKey(start)); cursor < end; cursor = new Date(cursor.getTime() + 864e5)) {
      dates.add(dateKey(cursor));
    }
  }
  return dates;
}

function layoutWorkSegments(entries) {
  const laneEnds = [];
  const segments = [...entries]
    .sort((left, right) => left.visibleStart - right.visibleStart || left.visibleEnd - right.visibleEnd)
    .map((entry) => {
      const lane = laneEnds.findIndex((end) => end <= entry.visibleStart);
      const resolvedLane = lane === -1 ? laneEnds.length : lane;
      laneEnds[resolvedLane] = entry.visibleEnd;
      return { ...entry, lane: resolvedLane };
    });
  return segments.map((segment) => ({ ...segment, laneCount: laneEnds.length }));
}

export function buildTodoTrackerData({
  tasks = [],
  entries = [],
  dates = null,
  now = new Date(),
  durationSec = null,
}) {
  const nowDate = new Date(now);
  const safeDates = dates?.length ? [...dates] : deriveDates(tasks, entries, nowDate, durationSec);
  if (!safeDates.length) return { dates: safeDates, windowStart: null, windowEnd: null, items: [] };

  const windowStart = localDayStart(safeDates[0]);
  const windowEnd = new Date(localDayStart(safeDates[safeDates.length - 1]).getTime() + 864e5);
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
        .filter((entry) => entry && entry.seconds >= MIN_TRACKER_SECONDS);
      if (!itemEntries.length) return null;
      const workSegments = layoutWorkSegments(itemEntries);

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
        lifecycleDays: calendarDays(openedAt, endedAt),
        workedDays: workedDateKeys(itemEntries).size,
        workedDates: [...workedDateKeys(itemEntries)].sort(),
        trackedSeconds: itemEntries.reduce((sum, entry) => sum + entry.seconds, 0),
        entries: itemEntries,
        workSegments,
        laneCount: workSegments[0].laneCount,
        openedAtMs: openedAt.getTime(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.lifecycleSeconds - left.lifecycleSeconds
      || left.openedAtMs - right.openedAtMs
      || left.title.localeCompare(right.title))
    .map(({ openedAtMs, ...item }) => item);

  return { dates: safeDates, windowStart, windowEnd, items };
}
