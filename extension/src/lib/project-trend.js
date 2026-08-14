import { fmtDate, fmtHM } from './time.js';

const UNCLASSIFIED = {
  id: null,
  name: '未分類',
  color: '#9a9898',
};

const byName = (a, b) => a.name.localeCompare(b.name);

function projectMap(projects) {
  return new Map(projects.map((project) => [project.id, project]));
}

function childrenMap(projects) {
  const map = new Map();
  for (const project of projects) {
    const parentId = project.parentId || null;
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId).push(project);
  }
  for (const children of map.values()) children.sort(byName);
  return map;
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

function bucketIdFor(projectId, focusId, projectsById) {
  if (!projectId) return null;
  if (!focusId) return rootIdFor(projectId, projectsById);
  if (projectId === focusId) return `direct:${focusId}`;

  let current = projectsById.get(projectId);
  const seen = new Set();
  while (current?.parentId && !seen.has(current.id)) {
    if (current.parentId === focusId) return current.id;
    seen.add(current.id);
    current = projectsById.get(current.parentId);
  }
  return null;
}

function bucketDefinitions(projects, focusId, projectsById, children) {
  const roots = projects.filter((project) => !project.parentId || !projectsById.has(project.parentId));
  if (!focusId) return [...roots, UNCLASSIFIED];

  const focus = projectsById.get(focusId);
  if (!focus) return [UNCLASSIFIED];
  const direct = (children.get(focusId) || []).map((project) => ({
    id: project.id,
    name: project.name,
    color: project.color || '#9a9898',
  }));
  const own = projects.some((project) => project.id === focusId);
  if (own) direct.push({
    id: `direct:${focusId}`,
    name: `${focus.name}（直接）`,
    color: focus.color || '#9a9898',
  });
  return direct;
}

function emptyValues(dates) {
  return dates.map(() => 0);
}

export function formatTrendSeconds(seconds) {
  return fmtHM(seconds);
}

export function buildProjectTrendData({
  entries,
  projects,
  dates,
  durationSec,
  focusId = null,
  limit = 8,
}) {
  const safeDates = [...dates];
  const projectsById = projectMap(projects);
  const children = childrenMap(projects);
  const definitions = bucketDefinitions(projects, focusId, projectsById, children);
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const valuesById = new Map(definitions.map((definition) => [definition.id, emptyValues(safeDates)]));
  const detailsByDate = safeDates.map(() => []);
  const dateIndex = new Map(safeDates.map((date, index) => [date, index]));

  for (const entry of entries) {
    const date = fmtDate(entry.startedAt);
    const index = dateIndex.get(date);
    if (index === undefined) continue;
    const bucketId = bucketIdFor(entry.projectId, focusId, projectsById);
    if (!byId.has(bucketId)) continue;
    const seconds = Math.max(0, Number(durationSec(entry)) || 0);
    valuesById.get(bucketId)[index] += seconds;
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
    focusId,
  };
}
