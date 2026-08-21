import type { Entry, Task } from './types';

type DateLike = Date | string;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDayStart(value: DateLike): Date {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function validEntry(entry: Pick<Entry, 'startedAt' | 'endedAt' | 'deletedAt'>): { start: Date; end: Date } | null {
  if (!entry.endedAt || entry.deletedAt) return null;
  const start = new Date(entry.startedAt);
  const end = new Date(entry.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { start, end };
}

export type ReportFilters = {
  projectId?: string;
  taskId?: string;
  tagId?: string;
  query?: string;
};

export function filterReportEntries(entries: Entry[], filters: ReportFilters = {}): Entry[] {
  const query = filters.query?.trim().toLowerCase() || '';
  return entries.filter((entry) => {
    if (!validEntry(entry)) return false;
    if (filters.projectId && entry.projectId !== filters.projectId) return false;
    if (filters.taskId && entry.taskId !== filters.taskId) return false;
    if (filters.tagId && !entry.tagIds.includes(filters.tagId)) return false;
    if (query && !`${entry.description} ${entry.notes || ''}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function splitEntryByDay(entry: Pick<Entry, 'startedAt' | 'endedAt'>): { date: string; seconds: number }[] {
  if (!entry.endedAt) return [];
  const start = new Date(entry.startedAt);
  const end = new Date(entry.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  const parts: { date: string; seconds: number }[] = [];
  let cursor = start;
  while (cursor < end) {
    const dayStart = localDayStart(cursor);
    const dayEnd = nextDay(dayStart);
    const clippedStart = Math.max(start.getTime(), dayStart.getTime());
    const clippedEnd = Math.min(end.getTime(), dayEnd.getTime());
    if (clippedEnd > clippedStart) {
      parts.push({ date: dateKey(dayStart), seconds: Math.round((clippedEnd - clippedStart) / 1000) });
    }
    cursor = dayEnd;
  }
  return parts;
}

export function overlapSeconds(entry: Pick<Entry, 'startedAt' | 'endedAt'>, fromDate: DateLike, toDate: DateLike = fromDate): number {
  return splitEntryByDay(entry)
    .filter((part) => part.date >= dateKey(localDayStart(fromDate)) && part.date <= dateKey(localDayStart(toDate)))
    .reduce((sum, part) => sum + part.seconds, 0);
}

export function compareSeconds(currentSeconds: number, previousSeconds: number) {
  const deltaSeconds = currentSeconds - previousSeconds;
  return {
    deltaSeconds,
    percent: previousSeconds ? Math.round((deltaSeconds / previousSeconds) * 100) : null,
  };
}

export function buildReportQuality(entries: Entry[], tasks: Task[], today: string) {
  let unclassifiedSeconds = 0;
  let missingNotesCount = 0;
  let unlinkedTaskSeconds = 0;

  for (const entry of entries) {
    const valid = validEntry(entry);
    if (!valid) continue;
    const seconds = Math.max(0, Math.round((valid.end.getTime() - valid.start.getTime()) / 1000));
    if (!entry.projectId) unclassifiedSeconds += seconds;
    if (!String(entry.notes || '').trim()) missingNotesCount += 1;
    if (entry.projectId && !entry.taskId) unlinkedTaskSeconds += seconds;
  }

  return {
    unclassifiedSeconds,
    missingNotesCount,
    unlinkedTaskSeconds,
    overdueTodoCount: tasks.filter((task) =>
      task.status !== 'done' && task.status !== 'archived' && Boolean(task.dueDate && task.dueDate < today),
    ).length,
  };
}

export function buildProjectTaskMetrics(tasks: Task[], entries: Entry[], today: string) {
  type Accumulator = {
    projectId: string | null;
    total: number;
    done: number;
    overdue: number;
    workedSeconds: number;
    leadTotalMs: number;
    leadCount: number;
  };
  const byProject = new Map<string | null, Accumulator>();
  const ensure = (projectId: string | null): Accumulator => {
    if (!byProject.has(projectId)) {
      byProject.set(projectId, {
        projectId, total: 0, done: 0, overdue: 0,
        workedSeconds: 0, leadTotalMs: 0, leadCount: 0,
      });
    }
    return byProject.get(projectId)!;
  };

  for (const task of tasks) {
    if (task.status === 'archived') continue;
    const row = ensure(task.projectId ?? null);
    row.total += 1;
    if (task.status === 'done') row.done += 1;
    if (task.status !== 'done' && task.dueDate && task.dueDate < today) row.overdue += 1;
    if (task.status === 'done' && task.openedAt && task.completedAt) {
      const leadMs = new Date(task.completedAt).getTime() - new Date(task.openedAt).getTime();
      if (leadMs >= 0) {
        row.leadTotalMs += leadMs;
        row.leadCount += 1;
      }
    }
  }

  for (const entry of entries) {
    const valid = validEntry(entry);
    if (!valid || !entry.taskId) continue;
    const task = tasks.find((candidate) => candidate.id === entry.taskId);
    if (task) ensure(task.projectId ?? null).workedSeconds += Math.round((valid.end.getTime() - valid.start.getTime()) / 1000);
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
