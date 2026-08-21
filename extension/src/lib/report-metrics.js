function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDayStart(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function nextDay(date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function validEntry(entry) {
  if (!entry?.endedAt || entry.deletedAt) return null;
  const start = new Date(entry.startedAt);
  const end = new Date(entry.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { start, end };
}

export function overlapSeconds(entry, fromDate, toDate = fromDate) {
  const valid = validEntry(entry);
  if (!valid) return 0;
  const from = localDayStart(fromDate);
  const to = nextDay(localDayStart(toDate));
  const start = Math.max(valid.start.getTime(), from.getTime());
  const end = Math.min(valid.end.getTime(), to.getTime());
  return end > start ? Math.round((end - start) / 1000) : 0;
}

export function buildReportQuality(entries, tasks, today) {
  let unclassifiedSeconds = 0;
  let missingNotesCount = 0;
  let unlinkedTaskSeconds = 0;

  for (const entry of entries) {
    const valid = validEntry(entry);
    if (!valid) continue;
    const seconds = Math.max(0, Math.round((valid.end - valid.start) / 1000));
    if (!entry.projectId) unclassifiedSeconds += seconds;
    if (!String(entry.notes || '').trim()) missingNotesCount += 1;
    if (entry.projectId && !entry.taskId) unlinkedTaskSeconds += seconds;
  }

  const overdueTodoCount = tasks.filter((task) =>
    task.status !== 'done' && task.status !== 'archived' && task.dueDate && task.dueDate < today,
  ).length;

  return {
    unclassifiedSeconds,
    missingNotesCount,
    unlinkedTaskSeconds,
    overdueTodoCount,
  };
}

export function buildProjectTaskMetrics(tasks, entries, today) {
  const byProject = new Map();
  const ensure = (projectId) => {
    if (!byProject.has(projectId)) byProject.set(projectId, {
      projectId,
      total: 0,
      done: 0,
      overdue: 0,
      workedSeconds: 0,
      leadTotalMs: 0,
      leadCount: 0,
    });
    return byProject.get(projectId);
  };

  for (const task of tasks) {
    if (task.status === 'archived') continue;
    const row = ensure(task.projectId || null);
    row.total += 1;
    if (task.status === 'done') row.done += 1;
    if (task.status !== 'done' && task.dueDate && task.dueDate < today) row.overdue += 1;
    if (task.status === 'done' && task.openedAt && task.completedAt) {
      const leadMs = new Date(task.completedAt) - new Date(task.openedAt);
      if (leadMs >= 0) {
        row.leadTotalMs += leadMs;
        row.leadCount += 1;
      }
    }
  }

  for (const entry of entries) {
    const valid = validEntry(entry);
    if (!valid || !entry.taskId) continue;
    const task = tasks.find((item) => item.id === entry.taskId);
    if (task) ensure(task.projectId || null).workedSeconds += Math.round((valid.end - valid.start) / 1000);
  }

  return [...byProject.values()]
    .map((row) => ({
      projectId: row.projectId,
      total: row.total,
      done: row.done,
      completionRate: row.total ? row.done / row.total : 0,
      overdue: row.overdue,
      workedSeconds: row.workedSeconds,
      averageLeadMs: row.leadCount ? Math.round(row.leadTotalMs / row.leadCount) : null,
    }))
    .sort((a, b) => b.workedSeconds - a.workedSeconds || b.total - a.total);
}

export function compareSeconds(currentSeconds, previousSeconds) {
  const deltaSeconds = currentSeconds - previousSeconds;
  return {
    deltaSeconds,
    percent: previousSeconds ? Math.round((deltaSeconds / previousSeconds) * 100) : null,
  };
}
