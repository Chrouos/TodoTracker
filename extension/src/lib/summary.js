/**
 * summary.js — 把時間紀錄與工作紀錄整理成 Markdown。
 * 給「一鍵複製今日總結」用，貼到日報、Obsidian、Slack 都行。
 */

import { fmtDate, durationOfEntry } from './time.js';
import { pathOf } from './tree.js';
import { taskMetrics, leadLabel } from './tasks.js';
import { formatDisplayTime, formatDuration, translate } from './i18n.js';

/**
 * @param {object} o
 * @param {string[]} o.dates      要輸出的日期（YYYY-MM-DD），由舊到新
 * @param {Array} o.entries
 * @param {Array} o.projects
 * @param {Array} o.tasks
 * @param {boolean} [o.includeTodos] 是否附上當天完成的 todo
 */
export function buildSummary({ dates, entries, projects, tasks = [], includeTodos = true, locale = 'zh-TW' }) {
  const done = entries.filter((e) => e.endedAt && !e.deletedAt);
  const out = [];

  for (const date of dates) {
    const rows = done
      .filter((e) => fmtDate(e.startedAt) === date)
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));

    const finishedTodos = includeTodos
      ? tasks.filter((t) => t.status === 'done' && t.updatedAt && fmtDate(t.updatedAt) === date)
      : [];

    if (!rows.length && !finishedTodos.length) continue;

    const total = rows.reduce((s, e) => s + durationOfEntry(e), 0);
    out.push(`## ${translate(locale, 'summary.workSummary', { date })}`);
    out.push('');
    out.push(translate(locale, 'summary.totalTime', {
      duration: formatDuration(total, locale), count: rows.length,
    }));
    out.push('');

    // 依專案分組，時數多的在前
    const groups = new Map();
    for (const e of rows) {
      const key = e.projectId || '__none__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const ordered = [...groups.entries()]
      .map(([key, list]) => ({
        key,
        list,
        seconds: list.reduce((s, e) => s + durationOfEntry(e), 0),
        name: key === '__none__'
          ? translate(locale, 'project.uncategorized')
          : pathOf(projects, key).join(' / ') || translate(locale, 'project.uncategorized'),
      }))
      .sort((a, b) => b.seconds - a.seconds);

    for (const g of ordered) {
      out.push(`### ${g.name} — ${formatDuration(g.seconds, locale)}`);
      out.push('');
      for (const e of g.list) {
        const task = tasks.find((t) => t.id === e.taskId);
        const title = e.description || task?.title || '（無描述）';
        out.push(`- **${formatDisplayTime(e.startedAt, locale)}–${formatDisplayTime(e.endedAt, locale)}** ${title} · ${formatDuration(durationOfEntry(e), locale)}`);
        // 工作紀錄逐行變成子項目，保留原本的時間戳排列
        for (const line of String(e.notes || '').split('\n')) {
          const t = line.trim();
          if (t) out.push(`  - ${t}`);
        }
      }
      out.push('');
    }

    if (finishedTodos.length) {
      out.push(`### ${translate(locale, 'summary.completedTodos')}`);
      out.push('');
      for (const t of finishedTodos) {
        const p = t.projectId ? pathOf(projects, t.projectId).join(' / ') : null;
        const m = taskMetrics(t, entries);
        const bits = [];
        if (t.openedAt) bits.push(translate(locale, 'summary.opened', { date: fmtDate(t.openedAt) }));
        if (t.dueDate) bits.push(translate(locale, 'summary.due', { date: t.dueDate }));
        if (m.leadMs !== null) bits.push(translate(locale, 'summary.lead', { duration: leadLabel(m.leadMs, locale) }));
        if (m.worked) bits.push(translate(locale, 'summary.worked', { duration: formatDuration(m.worked, locale) }));
        out.push(`- [x] ${t.title}${p ? ` _(${p})_` : ''}${bits.length ? ` — ${bits.join(' · ')}` : ''}`);
      }
      out.push('');
    }
  }

  return out.length ? out.join('\n').trimEnd() + '\n' : '';
}

/** 寫進剪貼簿，回傳成功與否 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 沒有剪貼簿權限時退回 textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
