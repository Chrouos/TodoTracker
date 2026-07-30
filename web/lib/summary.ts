import { fmtHM, fmtClock, fmtDate, durationSec } from './time';
import { pathOf } from './tree';
import { taskMetrics, leadLabel } from './tasks';
import type { Entry, Project, Task } from './types';

/**
 * 把時間紀錄與工作紀錄整理成 Markdown。
 * 跟 extension/src/lib/summary.js 是同一套邏輯與格式。
 */
export function buildSummary({
  dates, entries, projects, tasks = [], includeTodos = true,
}: {
  dates: string[];
  entries: Entry[];
  projects: Project[];
  tasks?: Task[];
  includeTodos?: boolean;
}): string {
  const done = entries.filter((e) => e.endedAt && !e.deletedAt);
  const out: string[] = [];

  for (const date of dates) {
    const rows = done
      .filter((e) => fmtDate(e.startedAt) === date)
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));

    const finishedTodos = includeTodos
      ? tasks.filter((t) => t.status === 'done' && t.updatedAt && fmtDate(t.updatedAt) === date)
      : [];

    if (!rows.length && !finishedTodos.length) continue;

    const total = rows.reduce((s, e) => s + durationSec(e), 0);
    out.push(`## ${date} 工作總結`, '', `總時數 **${fmtHM(total)}** · ${rows.length} 筆`, '');

    const groups = new Map<string, Entry[]>();
    for (const e of rows) {
      const key = e.projectId ?? '__none__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    const ordered = [...groups.entries()]
      .map(([key, list]) => ({
        list,
        seconds: list.reduce((s, e) => s + durationSec(e), 0),
        name: key === '__none__' ? '未分類' : pathOf(projects, key).join(' / ') || '未分類',
      }))
      .sort((a, b) => b.seconds - a.seconds);

    for (const g of ordered) {
      out.push(`### ${g.name} — ${fmtHM(g.seconds)}`, '');
      for (const e of g.list) {
        const task = tasks.find((t) => t.id === e.taskId);
        const title = e.description || task?.title || '（無描述）';
        out.push(`- **${fmtClock(e.startedAt)}–${fmtClock(e.endedAt!)}** ${title} · ${fmtHM(durationSec(e))}`);
        for (const line of String(e.notes ?? '').split('\n')) {
          const t = line.trim();
          if (t) out.push(`  - ${t}`);
        }
      }
      out.push('');
    }

    if (finishedTodos.length) {
      out.push('### 完成的 Todo', '');
      for (const t of finishedTodos) {
        const p = t.projectId ? pathOf(projects, t.projectId).join(' / ') : null;
        const m = taskMetrics(t, entries);
        const bits: string[] = [];
        if (t.openedAt) bits.push(`開單 ${fmtDate(t.openedAt)}`);
        if (t.dueDate) bits.push(`截止 ${t.dueDate}`);
        if (m.leadMs !== null) bits.push(`歷時 ${leadLabel(m.leadMs)}`);
        if (m.worked) bits.push(`工時 ${fmtHM(m.worked)}`);
        out.push(`- [x] ${t.title}${p ? ` _(${p})_` : ''}${bits.length ? ` — ${bits.join(' · ')}` : ''}`);
      }
      out.push('');
    }
  }

  return out.length ? `${out.join('\n').trimEnd()}\n` : '';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
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
