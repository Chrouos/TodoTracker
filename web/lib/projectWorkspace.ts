import { descendantIds } from './tree';
import { durationSec, fmtDate } from './time';
import type { Entry, Project, Task } from './types';

export type ProjectWorkspaceData = {
  project: Project;
  projectIds: Set<string>;
  tasks: Task[];
  entries: Entry[];
  stats: { totalSeconds: number; taskCount: number; doneCount: number; overdueCount: number };
  daily: { date: string; seconds: number }[];
  byTask: Map<string, number>;
  cycle: { openedAt: string | null; dueDate: string | null; completedAt: string | null; lastActivityAt: string | null };
};

export type PaginatedItems<T> = {
  items: T[];
  page: number;
  pageCount: number;
};

export function paginateItems<T>(items: ReadonlyArray<T>, requestedPage: number, pageSize: number): PaginatedItems<T> {
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1;
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Number.isFinite(requestedPage)
    ? Math.min(pageCount, Math.max(1, Math.floor(requestedPage)))
    : 1;
  const start = (page - 1) * safePageSize;
  return { items: items.slice(start, start + safePageSize), page, pageCount };
}

export function buildProjectWorkspace(projectId: string, projects: Project[], tasks: Task[], entries: Entry[]): ProjectWorkspaceData | null {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return null;
  const projectIds = new Set([projectId, ...descendantIds(projects, projectId)]);
  const scopedTasks = tasks.filter((task) => task.projectId !== null && projectIds.has(task.projectId));
  const taskIds = new Set(scopedTasks.map((task) => task.id));
  const scopedEntries = entries.filter((entry) => !entry.deletedAt && (
    (entry.projectId !== null && projectIds.has(entry.projectId)) ||
    (entry.taskId !== null && taskIds.has(entry.taskId))
  ));
  const ended = scopedEntries.filter((entry) => entry.endedAt);
  const byTask = new Map<string, number>();
  const daily = new Map<string, number>();
  for (const entry of ended) {
    const seconds = durationSec(entry);
    if (entry.taskId) byTask.set(entry.taskId, (byTask.get(entry.taskId) ?? 0) + seconds);
    const date = fmtDate(entry.startedAt);
    daily.set(date, (daily.get(date) ?? 0) + seconds);
  }
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = scopedTasks.filter((task) => task.status !== 'done' && task.dueDate !== null && task.dueDate < today).length;
  const timestamps = [
    ...scopedTasks.flatMap((task) => [task.openedAt, task.completedAt, task.dueDate ? `${task.dueDate}T23:59:59.999Z` : null]),
    ...scopedEntries.flatMap((entry) => [entry.startedAt, entry.endedAt]),
  ].filter((value): value is string => Boolean(value)).sort();
  return {
    project,
    projectIds,
    tasks: scopedTasks,
    entries: scopedEntries,
    stats: { totalSeconds: ended.reduce((sum, entry) => sum + durationSec(entry), 0), taskCount: scopedTasks.length, doneCount: scopedTasks.filter((task) => task.status === 'done').length, overdueCount },
    daily: [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, seconds]) => ({ date, seconds })),
    byTask,
    cycle: { openedAt: timestamps[0] ?? null, dueDate: scopedTasks.map((task) => task.dueDate).filter(Boolean).sort().at(-1) ?? null, completedAt: scopedTasks.every((task) => task.status === 'done') && scopedTasks.length ? timestamps.at(-1) ?? null : null, lastActivityAt: timestamps.at(-1) ?? null },
  };
}
