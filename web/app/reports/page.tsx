'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import Disconnected from '@/components/Disconnected';
import EntryDialog, { type EntryDraft } from '@/components/EntryDialog';
import Section from '@/components/Section';
import CopyButton from '@/components/CopyButton';
import { buildSummary } from '@/lib/summary';
import { DonutChart, LineChart, TimelineChart } from '@/components/Charts';
import {
  dailySeries, durationSec, fmtClock, fmtDate, fmtHM, startOfDay, startOfMonth, startOfWeek,
  timelineData,
} from '@/lib/time';
import { flattenTree, pathOf } from '@/lib/tree';
import {
  buildProjectTaskMetrics, buildReportQuality, compareSeconds, filterReportEntries,
  splitEntryByDay,
  type ReportFilters,
} from '@/lib/report';
import type { Entry } from '@/lib/types';

type Range = 'today' | 'week' | 'month' | 'all' | 'custom';
const RANGES: { key: Exclude<Range, 'custom'>; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本週' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
];
const PAGE_SIZE = 50;

function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function rangeBounds(range: Range, customFrom: string, customTo: string, weekStartsOn: number) {
  if (range === 'custom') {
    const from = customFrom ? localDate(customFrom) : startOfDay();
    const to = customTo ? nextDay(localDate(customTo)) : from;
    return { from, to };
  }
  const from = range === 'today' ? startOfDay()
    : range === 'week' ? startOfWeek(new Date(), weekStartsOn)
      : range === 'month' ? startOfMonth()
        : new Date(0);
  return { from, to: range === 'all' ? null : nextDay(range === 'today' ? from : range === 'week' ? new Date(from.getTime() + 6 * 864e5) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)) };
}

function includesInRange(entry: Entry, from: Date, to: Date | null): boolean {
  if (!entry.endedAt) return false;
  const start = new Date(entry.startedAt);
  const end = new Date(entry.endedAt);
  return end > from && (!to || start < to);
}

function secondsInRange(entry: Entry, from: Date, to: Date | null): number {
  if (!entry.endedAt) return 0;
  const start = new Date(entry.startedAt);
  const end = new Date(entry.endedAt);
  const clippedStart = Math.max(start.getTime(), from.getTime());
  const clippedEnd = to ? Math.min(end.getTime(), to.getTime()) : end.getTime();
  return clippedEnd > clippedStart ? Math.round((clippedEnd - clippedStart) / 1000) : 0;
}

function labelForRange(range: Range, customFrom: string, customTo: string): string {
  if (range === 'custom') return `${customFrom} ～ ${customTo}`;
  return RANGES.find((item) => item.key === range)?.label || '全部';
}

function percentLabel(value: number | null): string {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${value}%`;
}

export default function ReportsPage() {
  const { status, data, act } = useStore();
  const { entries, projects, tags, tasks, settings } = data;
  const [range, setRange] = useState<Range>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filters, setFilters] = useState<ReportFilters>({});
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<EntryDraft | null>(null);

  const bounds = useMemo(
    () => rangeBounds(range, customFrom, customTo, settings.weekStartsOn),
    [range, customFrom, customTo, settings.weekStartsOn],
  );
  const currentFilters = useMemo(() => ({ ...filters, query }), [filters, query]);
  const rows = useMemo(() => {
    const filtered = filterReportEntries(entries, currentFilters);
    return filtered.filter((entry) => includesInRange(entry, bounds.from, bounds.to));
  }, [entries, currentFilters, bounds]);
  const totalSec = useMemo(
    () => rows.reduce((sum, entry) => sum + secondsInRange(entry, bounds.from, bounds.to), 0),
    [rows, bounds],
  );
  const activeDays = useMemo(
    () => new Set(rows.flatMap((entry) => splitEntryByDay(entry).map((part) => part.date))).size,
    [rows],
  );

  const previous = useMemo(() => {
    if (!bounds.to || range === 'all') return { from: null, to: null };
    const length = bounds.to.getTime() - bounds.from.getTime();
    return { from: new Date(bounds.from.getTime() - length), to: bounds.from };
  }, [bounds, range]);
  const previousSec = useMemo(() => {
    if (!previous.from || !previous.to) return 0;
    return filterReportEntries(entries, currentFilters)
      .filter((entry) => includesInRange(entry, previous.from!, previous.to!))
      .reduce((sum, entry) => sum + secondsInRange(entry, previous.from!, previous.to!), 0);
  }, [entries, currentFilters, previous]);
  const comparison = compareSeconds(totalSec, previousSec);

  const daily = useMemo(() => {
    const lineFrom = range === 'all' ? startOfDay(new Date(Date.now() - 29 * 864e5)) : bounds.from;
    const lineTo = bounds.to ? new Date(bounds.to.getTime() - 864e5) : new Date();
    return dailySeries(rows, lineFrom, lineTo);
  }, [rows, bounds, range]);
  const projectSlices = useMemo(() => {
    const byId = new Map<string | null, number>();
    for (const entry of rows) {
      const id = entry.projectId ?? null;
      byId.set(id, (byId.get(id) ?? 0) + secondsInRange(entry, bounds.from, bounds.to));
    }
    return [...byId.entries()]
      .map(([id, seconds]) => {
        const project = id ? projects.find((item) => item.id === id) : null;
        return {
          key: id ?? '__none__',
          name: project ? pathOf(projects, id).join(' / ') : '未分類',
          color: project?.color ?? '#9a9898',
          seconds,
        };
      })
      .filter((item) => item.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
  }, [rows, bounds, projects]);
  const projectHeatmap = useMemo(() => {
    const dates = daily.map((day) => day.date);
    const byProject = new Map<string, number[]>();
    for (const entry of rows) {
      if (!entry.projectId) continue;
      const values = byProject.get(entry.projectId) ?? dates.map(() => 0);
      for (const part of splitEntryByDay(entry)) {
        const index = dates.indexOf(part.date);
        if (index >= 0) values[index] += part.seconds;
      }
      byProject.set(entry.projectId, values);
    }
    return [...byProject.entries()]
      .map(([projectId, values]) => ({ projectId, values }))
      .sort((a, b) => b.values.reduce((sum, value) => sum + value, 0) - a.values.reduce((sum, value) => sum + value, 0));
  }, [daily, rows]);
  const quality = useMemo(
    () => buildReportQuality(rows, tasks, dateValue(new Date())),
    [rows, tasks],
  );
  const taskMetrics = useMemo(
    () => buildProjectTaskMetrics(
      filters.projectId ? tasks.filter((task) => task.projectId === filters.projectId) : tasks,
      rows,
      dateValue(new Date()),
    ),
    [filters.projectId, rows, tasks],
  );
  const shownRows = useMemo(() => rows
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const timelineDates = daily.map((day) => day.date).slice(-14);
  const timeline = timelineData(rows, timelineDates);

  if (status === 'disconnected') return <Disconnected />;

  const updateFilter = (key: keyof ReportFilters, value: string) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  };

  const exportCsv = () => {
    const head = ['date', 'start', 'end', 'seconds', 'hours', 'project', 'task', 'description', 'notes', 'tags'];
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((entry) => {
      const project = projects.find((item) => item.id === entry.projectId);
      const task = tasks.find((item) => item.id === entry.taskId);
      const seconds = secondsInRange(entry, bounds.from, bounds.to);
      return [
        fmtDate(entry.startedAt), fmtClock(entry.startedAt), fmtClock(entry.endedAt!), seconds,
        (seconds / 3600).toFixed(2), project?.name ?? '', task?.title ?? '', entry.description,
        entry.notes ?? '', entry.tagIds.map((id) => tags.find((tag) => tag.id === id)?.name).filter(Boolean).join('|'),
      ].map(quote).join(',');
    });
    const blob = new Blob(['\ufeff' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `todotracker-${range}-${fmtDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <>
      <h1>報表</h1>

      <div className="report-toolbar" style={{ marginTop: 24 }}>
        <div className="seg">
          {RANGES.map((item) => (
            <button key={item.key} className={range === item.key ? 'active' : ''} onClick={() => { setRange(item.key); setPage(1); }}>
              {item.label}
            </button>
          ))}
          <button className={range === 'custom' ? 'active' : ''} onClick={() => setRange('custom')}>自訂</button>
        </div>
        <div className="grow" />
        <CopyButton
          label="複製區間摘要"
          build={() => buildSummary({
            dates: [...new Set(rows.map((entry) => fmtDate(entry.startedAt)))].sort(),
            entries: rows, projects, tasks,
          })}
        />
        <button onClick={exportCsv}>↓ CSV</button>
      </div>

      {range === 'custom' && (
        <div className="report-custom-range">
          <label>開始 <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
          <span>～</span>
          <label>結束 <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
          {customFrom && customTo && customFrom > customTo && <span className="report-error">結束日期不可早於開始日期</span>}
        </div>
      )}

      <div className="report-filters">
        <input value={query} placeholder="搜尋描述或 notes" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <select value={filters.projectId ?? ''} onChange={(event) => updateFilter('projectId', event.target.value)}>
          <option value="">全部專案</option>
          {flattenTree(projects).map((project) => <option key={project.id} value={project.id}>{'　'.repeat(project.depth)}{project.name}</option>)}
        </select>
        <select value={filters.taskId ?? ''} onChange={(event) => updateFilter('taskId', event.target.value)}>
          <option value="">全部 Todo</option>
          {tasks.filter((task) => task.status !== 'archived').map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
        <select value={filters.tagId ?? ''} onChange={(event) => updateFilter('tagId', event.target.value)}>
          <option value="">全部 Tag</option>
          {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>
        <button className="btn-sm" onClick={() => { setFilters({}); setQuery(''); setPage(1); }}>清除篩選</button>
      </div>

      <div className="report-scope-label">目前範圍：{labelForRange(range, customFrom, customTo)} · {rows.length} 筆</div>

      <div className="kpis report-kpis" style={{ marginTop: 16 }}>
        <div className="kpi"><span className="cap">總時數</span><span className="num">{fmtHM(totalSec)}</span></div>
        <div className="kpi"><span className="cap">筆數</span><span className="num">{rows.length}</span></div>
        <div className="kpi"><span className="cap">平均每筆</span><span className="num">{rows.length ? fmtHM(totalSec / rows.length) : '—'}</span></div>
        <div className="kpi"><span className="cap">活動天數</span><span className="num">{activeDays}</span></div>
        <div className="kpi report-comparison"><span className="cap">對比前期</span><span className="num">{range === 'all' ? '—' : percentLabel(comparison.percent)}</span><small>{range === 'all' ? '全部範圍不比較' : `${comparison.deltaSeconds >= 0 ? '+' : ''}${fmtHM(comparison.deltaSeconds)} · 前期 ${fmtHM(previousSec)}`}</small></div>
      </div>

      <Section id="rep-quality" title="資料品質與 Todo 狀況">
        <div className="report-quality-grid">
          <div><span className="cap">未分類工時</span><strong>{fmtHM(quality.unclassifiedSeconds)}</strong></div>
          <div><span className="cap">沒有 notes</span><strong>{quality.missingNotesCount} 筆</strong></div>
          <div><span className="cap">未綁定 Todo</span><strong>{fmtHM(quality.unlinkedTaskSeconds)}</strong></div>
          <div className="report-warning"><span className="cap">逾期 Todo</span><strong>{quality.overdueTodoCount}</strong></div>
        </div>
      </Section>

      <Section id="rep-project" title="專案時間分配">
        {projectSlices.length ? <><div className="chart-split"><DonutChart data={projectSlices} /><div className="legend">{projectSlices.map((slice) => <div className="legend-row" key={slice.key}><span className="swatch" style={{ background: slice.color }} /><span className="grow ellipsis">{slice.name}</span><span className="num">{fmtHM(slice.seconds)}</span><span className="num mute" style={{ width: 48, textAlign: 'right' }}>{totalSec ? `${Math.round((slice.seconds / totalSec) * 100)}%` : '—'}</span></div>)}</div></div><div className="report-heatmap-wrap"><div className="cap">專案 × 日期</div><table className="report-heatmap"><thead><tr><th>專案</th>{daily.map((day) => <th key={day.date}>{day.date.slice(5)}</th>)}</tr></thead><tbody>{projectHeatmap.map((row) => { const project = projects.find((item) => item.id === row.projectId); const max = Math.max(...row.values, 1); return <tr key={row.projectId}><th>{project?.name ?? '未分類'}</th>{row.values.map((seconds, index) => <td key={`${row.projectId}-${daily[index].date}`} style={{ '--heat': String(seconds ? Math.max(.12, seconds / max) : 0) } as React.CSSProperties} title={`${daily[index].date} · ${fmtHM(seconds)}`}>{seconds ? fmtHM(seconds) : '—'}</td>)}</tr>; })}</tbody></table></div></> : <div className="empty">目前範圍沒有專案工時</div>}
      </Section>

      <Section id="rep-trend" title={`每日趨勢 · ${range === 'all' ? '最近 30 天' : labelForRange(range, customFrom, customTo)}`}>
        <div className="chart-box"><LineChart data={daily} /></div>
      </Section>

      <Section id="rep-timeline" title={`時間軸 · ${timelineDates.length ? `${timelineDates[0]} ～ ${timelineDates[timelineDates.length - 1]}` : '沒有資料'}`}>
        <div className="chart-box scroll-x"><TimelineChart tl={timeline} meta={(entry) => ({ color: projects.find((project) => project.id === entry.projectId)?.color ?? '#9a9898', label: entry.description || projects.find((project) => project.id === entry.projectId)?.name || '未分類' })} /></div>
      </Section>

      <Section id="rep-performance" title="Todo／專案績效">
        {taskMetrics.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>專案</th><th>Todo</th><th>完成率</th><th>逾期</th><th>實際工時</th><th>平均完成週期</th></tr></thead><tbody>{taskMetrics.map((metric) => <tr key={metric.projectId ?? '__none__'}><td>{metric.projectId ? pathOf(projects, metric.projectId).join(' / ') : '未分類'}</td><td>{metric.done} / {metric.total}</td><td>{Math.round(metric.completionRate * 100)}%</td><td className={metric.overdue ? 'report-warning-text' : ''}>{metric.overdue}</td><td>{fmtHM(metric.workedSeconds)}</td><td>{metric.averageLeadMs === null ? '—' : fmtHM(metric.averageLeadMs / 1000)}</td></tr>)}</tbody></table></div> : <div className="empty">目前沒有 Todo 績效資料</div>}
      </Section>

      <Section id="rep-detail" title={`明細（${rows.length} 筆）`}>
        {shownRows.map((entry) => {
          const project = projects.find((item) => item.id === entry.projectId);
          const task = tasks.find((item) => item.id === entry.taskId);
          return <div className="item" key={entry.id}><span className="swatch" style={{ background: project?.color ?? '#9a9898' }} /><div className="grow"><div className="ellipsis">{entry.description || task?.title || '未命名工作'} {entry.tagIds.map((id) => tags.find((tag) => tag.id === id)).filter(Boolean).map((tag) => <span className="badge" key={tag!.id}>{tag!.name}</span>)}</div><div className="sub">{project ? pathOf(projects, project.id).join(' / ') : '未分類'} · {fmtDate(entry.startedAt)} {fmtClock(entry.startedAt)}–{fmtClock(entry.endedAt!)}</div></div><span className="num">{fmtHM(secondsInRange(entry, bounds.from, bounds.to))}</span><div className="act"><button className="btn-sm" onClick={() => setEditing({ id: entry.id, description: entry.description, notes: entry.notes ?? '', projectId: entry.projectId ?? '', taskId: entry.taskId ?? '', startedAt: entry.startedAt, endedAt: entry.endedAt! })}>編輯</button><button className="btn-sm btn-danger" onClick={() => act('deleteEntry', { id: entry.id })}>刪除</button></div></div>;
        })}
        {!shownRows.length && <div className="empty">目前範圍沒有工作紀錄</div>}
        {rows.length > PAGE_SIZE && <div className="report-pagination"><button className="btn-sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>上一頁</button><span>第 {page} / {pageCount} 頁</span><button className="btn-sm" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>下一頁</button></div>}
      </Section>

      {editing && <EntryDialog draft={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
