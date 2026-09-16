import { fmtDate, splitEntryByDay } from './time.js';

const UNCLASSIFIED = {
  id: null,
  name: '未分類',
  color: '#9a9898',
};

function projectMap(projects) {
  return new Map(projects.map((project) => [project.id, project]));
}

function rootIdFor(projectId, projectsById) {
  let current = projectsById.get(projectId);
  const seen = new Set();
  while (current?.parentId && projectsById.has(current.parentId) && !seen.has(current.id)) {
    seen.add(current.id);
    current = projectsById.get(current.parentId);
  }
  return current?.id || projectId;
}

function bucketIdFor(projectId, projectsById) {
  if (!projectId) return null;
  return rootIdFor(projectId, projectsById);
}

function bucketDefinitions(projects, projectsById) {
  const roots = projects.filter((project) => !project.parentId || !projectsById.has(project.parentId));
  return [...roots, UNCLASSIFIED];
}

function emptyValues(dates) {
  return dates.map(() => 0);
}

export function buildProjectTrendData({
  entries,
  projects,
  dates,
  durationSec,
  limit = 8,
}) {
  const safeDates = [...dates];
  const projectsById = projectMap(projects);
  const definitions = bucketDefinitions(projects, projectsById);
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const valuesById = new Map(definitions.map((definition) => [definition.id, emptyValues(safeDates)]));
  const detailsByDate = safeDates.map(() => []);
  const dateIndex = new Map(safeDates.map((date, index) => [date, index]));

  for (const entry of entries) {
    const parts = splitEntryByDay(entry);
    const segments = parts.length ? parts : [{ ...entry, seconds: durationSec(entry) }];
    for (const segment of segments) {
      const date = fmtDate(segment.startedAt);
      const index = dateIndex.get(date);
      if (index === undefined) continue;
      const bucketId = bucketIdFor(segment.projectId, projectsById);
      if (!byId.has(bucketId)) continue;
      const seconds = Math.max(0, Number(segment.seconds ?? durationSec(segment)) || 0);
      valuesById.get(bucketId)[index] += seconds;
    }
  }

  const rawSeries = definitions
    .map((definition) => ({
      ...definition,
      values: valuesById.get(definition.id),
      total: valuesById.get(definition.id).reduce((sum, value) => sum + value, 0),
    }))
    .filter((series) => series.total > 0);

  const ranked = [...rawSeries].sort((a, b) => b.total - a.total);
  const visible = ranked.length > limit
    ? [...ranked.slice(0, Math.max(1, limit - 1)), {
        id: 'other', name: '其他', color: '#c5c0bb',
        values: emptyValues(safeDates), total: 0,
      }]
    : ranked;
  const visibleIds = new Set(visible.map((series) => series.id));
  const other = visible.find((series) => series.id === 'other');

  for (const series of ranked) {
    if (visibleIds.has(series.id)) continue;
    series.values.forEach((value, index) => { other.values[index] += value; });
    other.total += series.total;
  }

  const dailyTotals = safeDates.map((_, index) =>
    rawSeries.reduce((sum, series) => sum + series.values[index], 0));
  const maxCellSeconds = visible.reduce(
    (max, series) => Math.max(max, ...series.values), 0,
  );

  for (const [index, date] of safeDates.entries()) {
    detailsByDate[index] = ranked
      .filter((series) => series.values[index] > 0)
      .map((series) => ({ id: series.id, name: series.name, seconds: series.values[index] }));
  }

  return {
    dates: safeDates,
    series: visible,
    dailyTotals,
    detailsByDate,
    maxCellSeconds,
  };
}

function descendantIds(projectId, projects) {
  const ids = new Set([projectId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const project of projects) {
      if (project.parentId && ids.has(project.parentId) && !ids.has(project.id)) {
        ids.add(project.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function buildProjectDetailData({
  entries,
  projects,
  tasks,
  projectId,
  dates,
  durationSec,
  limit = 60,
}) {
  const safeDates = [...dates];
  const dateSet = new Set(safeDates);
  const projectIds = descendantIds(projectId, projects);
  const projectsById = projectMap(projects);
  const scopedTasks = tasks.filter((task) => task.projectId && projectIds.has(task.projectId));
  const taskIds = new Set(scopedTasks.map((task) => task.id));
  const taskProjectById = new Map(scopedTasks.map((task) => [task.id, task.projectId]));
  const relevant = entries
    .flatMap((entry) => {
      const parts = splitEntryByDay(entry);
      return parts.length ? parts : [{ ...entry, seconds: durationSec(entry) }];
    })
    .filter((entry) => !entry.deletedAt && dateSet.has(fmtDate(entry.startedAt)))
    .filter((entry) => (entry.projectId && projectIds.has(entry.projectId))
      || (entry.taskId && taskIds.has(entry.taskId)))
    .map((entry) => ({
      ...entry,
      detailProjectId: projectIds.has(entry.projectId)
        ? entry.projectId
        : taskProjectById.get(entry.taskId) || null,
      seconds: Math.max(0, Number(entry.seconds ?? durationSec(entry)) || 0),
    }))
    .filter((entry) => entry.detailProjectId)
    .filter((entry) => entry.seconds > 0)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const projectTotals = new Map();
  for (const entry of relevant) {
    projectTotals.set(entry.detailProjectId, (projectTotals.get(entry.detailProjectId) || 0) + entry.seconds);
  }
  const projectSeries = [...projectTotals.entries()]
    .map(([id, seconds]) => {
      const project = projectsById.get(id);
      return project ? { id, name: project.name, color: project.color, seconds } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.seconds - a.seconds);
  const dailyTotals = safeDates.map((date) => relevant
    .filter((entry) => fmtDate(entry.startedAt) === date)
    .reduce((sum, entry) => sum + entry.seconds, 0));

  return {
    projectId,
    projectIds: [...projectIds],
    entries: relevant.slice(0, limit),
    totalEntries: relevant.length,
    totalSeconds: relevant.reduce((sum, entry) => sum + entry.seconds, 0),
    projectSeries,
    dailyTotals,
    tasksTotal: scopedTasks.length,
    tasksDone: scopedTasks.filter((task) => task.status === 'done').length,
  };
}
