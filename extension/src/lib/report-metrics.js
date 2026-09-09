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
  const unclassifiedEntryIds = [];
  const missingNotesEntryIds = [];
  const unlinkedTaskEntryIds = [];

  for (const entry of entries) {
    const valid = validEntry(entry);
    if (!valid) continue;
    const seconds = Math.max(0, Math.round((valid.end - valid.start) / 1000));
    if (!entry.projectId) {
      unclassifiedSeconds += seconds;
      unclassifiedEntryIds.push(entry.id);
    }
    if (!String(entry.notes || '').trim()) {
      missingNotesCount += 1;
      missingNotesEntryIds.push(entry.id);
    }
    if (entry.projectId && !entry.taskId) {
      unlinkedTaskSeconds += seconds;
      unlinkedTaskEntryIds.push(entry.id);
    }
  }

  const overdueTodoCount = tasks.filter((task) =>
    task.status !== 'done' && task.status !== 'archived' && task.dueDate && task.dueDate < today,
  ).length;
  const overdueTaskIds = tasks
    .filter((task) => task.status !== 'done' && task.status !== 'archived' && task.dueDate && task.dueDate < today)
    .map((task) => task.id);

  return {
    unclassifiedSeconds,
    missingNotesCount,
    unlinkedTaskSeconds,
    overdueTodoCount,
    overdueTaskIds,
    unclassifiedEntryIds,
    missingNotesEntryIds,
    unlinkedTaskEntryIds,
  };
}

export function buildReportActionItems(quality) {
  const items = [];
  if (quality.overdueTodoCount > 0) {
    items.push({ kind: 'overdue', tone: 'danger', label: '逾期 Todo', value: quality.overdueTodoCount });
  }
  if (quality.unlinkedTaskSeconds > 0) {
    items.push({ kind: 'unlinked', tone: 'warning', label: '未綁定 Todo', value: quality.unlinkedTaskSeconds });
  }
  if (quality.unclassifiedSeconds > 0) {
    items.push({ kind: 'unclassified', tone: 'warning', label: '未分類工時', value: quality.unclassifiedSeconds });
  }
  if (quality.missingNotesCount > 0) {
    items.push({ kind: 'missing-notes', tone: 'muted', label: '未填寫工作備註', value: quality.missingNotesCount });
  }
  return items.length ? items : [{ kind: 'clear', tone: 'success', label: '目前沒有待處理項目', value: 0 }];
}

export function buildWorkspaceTodoProgress(metrics) {
  return metrics.reduce((summary, metric) => ({
    done: summary.done + Math.max(0, Number(metric.done) || 0),
    total: summary.total + Math.max(0, Number(metric.total) || 0),
  }), { done: 0, total: 0 });
}

export function buildProjectHealthRows(metrics, limit = 8) {
  const weekMs = 7 * 86400000;
  return metrics
    .map((metric) => {
      const remaining = Math.max(0, metric.total - metric.done);
      let status = '進行中';
      let tone = 'muted';
      let riskScore = 100;
      if (metric.overdue > 0) {
        status = '逾期';
        tone = 'danger';
        riskScore = 4000 + metric.overdue;
      } else if (metric.total > 1 && metric.completionRate < 0.5) {
        status = '進度偏低';
        tone = 'warning';
        riskScore = 3000 + Math.round((1 - metric.completionRate) * 100);
      } else if (metric.averageLeadMs !== null && metric.averageLeadMs >= weekMs) {
        status = '週期偏長';
        tone = 'warning';
        riskScore = 2000 + Math.round(metric.averageLeadMs / weekMs);
      } else if (metric.total > 0 && metric.done === metric.total) {
        status = '已完成';
        tone = 'success';
        riskScore = 0;
      }
      return { ...metric, remaining, status, tone, riskScore };
    })
    .sort((a, b) => b.riskScore - a.riskScore || b.workedSeconds - a.workedSeconds || b.total - a.total)
    .slice(0, limit);
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
    if (!valid) continue;
    const task = entry.taskId ? tasks.find((item) => item.id === entry.taskId) : null;
    const projectId = task?.projectId || entry.projectId || null;
    if (task || entry.projectId) ensure(projectId).workedSeconds += Math.round((valid.end - valid.start) / 1000);
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

function chartRows(metrics, valueKey, sortDirection = 'desc', limit = 8) {
  const rows = metrics
    .filter((metric) => Number.isFinite(metric[valueKey]) && metric[valueKey] > 0)
    .sort((a, b) => sortDirection === 'asc'
      ? a[valueKey] - b[valueKey]
      : b[valueKey] - a[valueKey])
    .slice(0, limit);
  const max = rows.reduce((highest, row) => Math.max(highest, row[valueKey]), 0);
  return rows.map((row) => ({
    projectId: row.projectId,
    value: row[valueKey],
    percentage: max ? Math.round((row[valueKey] / max) * 100) : 0,
  }));
}

export function buildProjectMetricChartData(metrics, limit = 8) {
  const visible = metrics.filter((metric) => Number(metric.total) > 0);
  const completion = visible
    .map((metric) => ({
      projectId: metric.projectId,
      value: Math.min(1, Math.max(0, Number(metric.completionRate) || 0)),
    }))
    .sort((a, b) => a.value - b.value)
    .slice(0, limit)
    .map((row) => ({ ...row, percentage: Math.round(row.value * 100) }));

  return {
    completion,
    worked: chartRows(visible, 'workedSeconds', 'desc', limit),
    lead: chartRows(visible, 'averageLeadMs', 'desc', limit),
  };
}

export function compareSeconds(currentSeconds, previousSeconds) {
  const deltaSeconds = currentSeconds - previousSeconds;
  return {
    deltaSeconds,
    percent: previousSeconds ? Math.round((deltaSeconds / previousSeconds) * 100) : null,
  };
}
