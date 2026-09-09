/**
 * tasks.js — Todo 的衍生指標。
 *
 *   openedAt    開單時間戳：建立當下自動記，不可改
 *   dueDate     截止日（YYYY-MM-DD）：唯一可以手改的
 *   completedAt 結案時間戳：按下完成的當下自動記，重新打開就清掉
 *
 * 加上從時間紀錄累加的工時，就能看出「掛了兩週但其實只做了三小時」這種情況。
 */

import { daysBetween, durationOfEntry, fmtDate, fmtClock } from './time.js';
import { formatDisplayDate, formatDisplayTime, translate } from './i18n.js';

const TODO_PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

/** 同一專案／層級的 Todo：優先度、最近更新、截止日、手動順序。 */
export function compareTodoTasks(a, b) {
  const aPriority = TODO_PRIORITY_ORDER[a.priority] ?? TODO_PRIORITY_ORDER.normal;
  const bPriority = TODO_PRIORITY_ORDER[b.priority] ?? TODO_PRIORITY_ORDER.normal;
  return (aPriority - bPriority)
    || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))
    || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** 排出 Todo 樹並保留每一列的原始階層深度。 */
export function flattenTodoTree(tasks) {
  const children = new Map();
  const taskIds = new Set(tasks.map((task) => task.id));
  tasks.forEach((task) => {
    const parentId = task.parentId || null;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(task);
  });

  const rows = [];
  const visited = new Set();
  const visit = (task, depth) => {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    rows.push({ ...task, depth });
    for (const child of (children.get(task.id) || []).sort(compareTodoTasks)) {
      visit(child, depth + 1);
    }
  };

  tasks
    .filter((task) => !task.parentId || !taskIds.has(task.parentId))
    .sort(compareTodoTasks)
    .forEach((task) => visit(task, 0));

  // 循環關聯沒有真正的根；仍以穩定順序顯示，避免資料消失。
  tasks.filter((task) => !visited.has(task.id)).sort(compareTodoTasks)
    .forEach((task) => visit(task, 0));

  return rows;
}

export function entriesForTask(task, entries) {
  return entries
    .filter((entry) => entry.taskId === task.id && entry.endedAt && !entry.deletedAt)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function promoteTodoTasksWithEntries(tasks, entries) {
  const recordedTaskIds = new Set(
    entries.filter((entry) => entry.taskId && !entry.deletedAt).map((entry) => entry.taskId),
  );

  return tasks.map((task) => (
    task.status === 'todo' && recordedTaskIds.has(task.id)
      ? { ...task, status: 'doing' }
      : task
  ));
}

export function todoHealth(tasks, today = fmtDate(new Date().toISOString())) {
  const current = tasks.filter((task) => task.status !== 'archived');
  const total = current.length;
  const done = current.filter((task) => task.status === 'done').length;
  const active = current.filter((task) => task.status === 'doing').length;
  const overdue = current.filter((task) =>
    task.status !== 'done' && task.dueDate && task.dueDate < today).length;

  return {
    total,
    done,
    completionRate: total ? done / total : 0,
    active,
    overdue,
  };
}

export function taskMetrics(task, entries) {
  const worked = entries
    .filter((e) => e.taskId === task.id && e.endedAt && !e.deletedAt)
    .reduce((s, e) => s + durationOfEntry(e), 0);

  const done = task.status === 'done';
  const endMs = task.completedAt ? +new Date(task.completedAt) : Date.now();

  // 歷時：開單到結案；還沒結案就算到現在
  const leadMs = task.openedAt ? Math.max(0, endMs - +new Date(task.openedAt)) : null;

  // 截止差距用日期精度（截止日本身只到日）
  const endDate = task.completedAt ? fmtDate(task.completedAt) : fmtDate(new Date().toISOString());
  const dueDelta = task.dueDate ? daysBetween(endDate, task.dueDate) : null;

  return {
    worked,
    leadMs,
    dueDelta,
    isOverdue: dueDelta !== null && dueDelta < 0,
    // 還沒結案而且已經過期，是最需要注意的狀態
    isLate: !done && dueDelta !== null && dueDelta < 0,
  };
}

/** 歷時講成人話：不到一天顯示小時，超過就顯示天 */
export function leadLabel(leadMs, locale = 'zh-TW') {
  if (leadMs === null || leadMs === undefined) return '';
  const h = leadMs / 3600e3;
  if (h < 1) return translate(locale, 'todo.lead.minute', {
    minutes: Math.max(1, Math.round(leadMs / 60e3)),
  });
  if (h < 24) return translate(locale, 'todo.lead.hour', { hours: Math.round(h) });
  const d = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem
    ? translate(locale, 'todo.lead.dayHours', { days: d, hours: rem })
    : translate(locale, 'todo.lead.day', { days: d });
}

/** 把截止差距講成人話 */
export function dueLabel(m, done, locale = 'zh-TW') {
  if (m.dueDelta === null) return '';
  if (m.dueDelta === 0) return done
    ? translate(locale, 'todo.due.doneToday')
    : translate(locale, 'todo.due.today');
  if (m.dueDelta > 0) return done
    ? translate(locale, 'todo.due.early', { days: m.dueDelta })
    : translate(locale, 'todo.due.remaining', { days: m.dueDelta });
  return translate(locale, 'todo.due.overdue', { days: -m.dueDelta });
}

/** 時間戳顯示成 2026-07-30 09:12；沒值回 — */
export function stampLabel(iso, locale = 'zh-TW') {
  if (!iso) return '—';
  return translate(locale, 'todo.stamp', {
    date: formatDisplayDate(iso, locale),
    time: formatDisplayTime(iso, locale),
  });
}
