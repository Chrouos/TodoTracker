import { daysBetween, durationSec, fmtDate, fmtClock } from './time';
import type { Entry, Task } from './types';

/**
 * Todo 的衍生指標。跟 extension/src/lib/tasks.js 是同一套邏輯。
 *
 *   openedAt    開單時間戳：建立當下自動記，不可改
 *   dueDate     截止日（YYYY-MM-DD）：唯一可以手改的
 *   completedAt 結案時間戳：按下完成的當下自動記，重新打開就清掉
 */

export type TaskMetrics = {
  worked: number;
  leadMs: number | null;
  dueDelta: number | null;
  isOverdue: boolean;
  isLate: boolean;
};

export function taskMetrics(task: Task, entries: Entry[]): TaskMetrics {
  const worked = entries
    .filter((e) => e.taskId === task.id && e.endedAt && !e.deletedAt)
    .reduce((s, e) => s + durationSec(e), 0);

  const done = task.status === 'done';
  const endMs = task.completedAt ? +new Date(task.completedAt) : Date.now();
  const leadMs = task.openedAt ? Math.max(0, endMs - +new Date(task.openedAt)) : null;

  // 截止差距用日期精度（截止日本身只到日）
  const endDate = task.completedAt ? fmtDate(task.completedAt) : fmtDate(new Date());
  const dueDelta = task.dueDate ? daysBetween(endDate, task.dueDate) : null;

  return {
    worked,
    leadMs,
    dueDelta,
    isOverdue: dueDelta !== null && dueDelta < 0,
    isLate: !done && dueDelta !== null && dueDelta < 0,
  };
}

/** 歷時講成人話：不到一天顯示小時，超過就顯示天 */
export function leadLabel(leadMs: number | null): string {
  if (leadMs === null) return '';
  const h = leadMs / 3600e3;
  if (h < 1) return `${Math.max(1, Math.round(leadMs / 60e3))} 分鐘`;
  if (h < 24) return `${Math.round(h)} 小時`;
  const d = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem ? `${d} 天 ${rem} 小時` : `${d} 天`;
}

export function dueLabel(m: TaskMetrics, done: boolean): string {
  if (m.dueDelta === null) return '';
  if (m.dueDelta === 0) return done ? '當天結案' : '今天到期';
  if (m.dueDelta > 0) return done ? `提前 ${m.dueDelta} 天` : `還有 ${m.dueDelta} 天`;
  return `逾期 ${-m.dueDelta} 天`;
}

/** 時間戳顯示成 2026-07-30 09:12；沒值回 — */
export function stampLabel(iso: string | null): string {
  return iso ? `${fmtDate(iso)} ${fmtClock(iso)}` : '—';
}
