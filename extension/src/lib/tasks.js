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

export function entriesForTask(task, entries) {
  return entries
    .filter((entry) => entry.taskId === task.id && entry.endedAt && !entry.deletedAt)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
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
export function leadLabel(leadMs) {
  if (leadMs === null || leadMs === undefined) return '';
  const h = leadMs / 3600e3;
  if (h < 1) return `${Math.max(1, Math.round(leadMs / 60e3))} 分鐘`;
  if (h < 24) return `${Math.round(h)} 小時`;
  const d = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem ? `${d} 天 ${rem} 小時` : `${d} 天`;
}

/** 把截止差距講成人話 */
export function dueLabel(m, done) {
  if (m.dueDelta === null) return '';
  if (m.dueDelta === 0) return done ? '當天結案' : '今天到期';
  if (m.dueDelta > 0) return done ? `提前 ${m.dueDelta} 天` : `還有 ${m.dueDelta} 天`;
  return `逾期 ${-m.dueDelta} 天`;
}

/** 時間戳顯示成 2026-07-30 09:12；沒值回 — */
export function stampLabel(iso) {
  if (!iso) return '—';
  return `${fmtDate(iso)} ${fmtClock(iso)}`;
}
