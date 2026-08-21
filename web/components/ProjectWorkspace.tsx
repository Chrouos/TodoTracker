'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { buildProjectWorkspace, paginateItems } from '@/lib/projectWorkspace';
import { fmtHM, fmtClock, fmtDate, durationSec } from '@/lib/time';
import { FEATURES } from '@/lib/features';
import type { ProjectWorkspaceData } from '@/lib/projectWorkspace';
import MarkdownPreview from '@/components/MarkdownPreview';

export default function ProjectWorkspace({ projectId }: { projectId: string }) {
  const { status, data } = useStore();
  const workspace = useMemo(() => buildProjectWorkspace(projectId, data.projects, data.tasks, data.entries), [projectId, data]);
  if (status === 'disconnected') return <div className="empty">無法連線到本機資料</div>;
  if (!workspace) return <><Link href="/projects">← 返回專案</Link><div className="empty">找不到這個專案</div></>;
  return <WorkspaceBody data={workspace} />;
}

function PaginationControls({
  label,
  page,
  pageCount,
  onPageChange,
}: {
  label: string;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return <nav className="workspace-pagination" aria-label={`${label}分頁`}>
    <button type="button" className="btn-sm" onClick={() => onPageChange(page - 1)} disabled={page === 1}>上一頁</button>
    <span>第 {page} / {pageCount} 頁</span>
    <button type="button" className="btn-sm" onClick={() => onPageChange(page + 1)} disabled={page === pageCount}>下一頁</button>
  </nav>;
}

function WorkspaceBody({ data }: { data: ProjectWorkspaceData }) {
  const [taskPage, setTaskPage] = useState(1);
  const [entryPage, setEntryPage] = useState(1);
  const pageSize = 10;
  const groups = { todo: data.tasks.filter((task) => task.status === 'todo'), doing: data.tasks.filter((task) => task.status === 'doing'), done: data.tasks.filter((task) => task.status === 'done') };
  const taskItems = [...groups.doing, ...groups.todo, ...groups.done];
  const pagedTasks = paginateItems(taskItems, taskPage, pageSize);
  const pageGroups = {
    todo: pagedTasks.items.filter((task) => task.status === 'todo'),
    doing: pagedTasks.items.filter((task) => task.status === 'doing'),
    done: pagedTasks.items.filter((task) => task.status === 'done'),
  };
  const entries = [...data.entries].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const pagedEntries = paginateItems(entries, entryPage, pageSize);
  return <>
    <div className="row"><Link href="/projects">← 返回專案</Link><span className="grow" /><span className="badge">專案工作區</span></div>
    <div className="workspace-heading"><div><p className="cap">專案</p><h1>{data.project.name}</h1><MarkdownPreview value={data.project.notes?.map((note) => note.text).join('\n\n') ?? ''} /></div><div className="num workspace-total">{fmtHM(data.stats.totalSeconds)}<small>總工時</small></div></div>
    <div className="kpis workspace-kpis"><div className="kpi"><strong>{data.stats.taskCount}</strong><span>Todo</span></div><div className="kpi"><strong>{data.stats.doneCount}</strong><span>已完成</span></div><div className="kpi"><strong>{data.stats.overdueCount}</strong><span>逾期</span></div><div className="kpi"><strong>{data.cycle.lastActivityAt ? fmtDate(data.cycle.lastActivityAt) : '—'}</strong><span>最近活動</span></div></div>
    <section className="workspace-section"><h2>工作週期與狀況</h2><div className="workspace-cycle"><span>開始：{data.cycle.openedAt ? fmtDate(data.cycle.openedAt) : '—'}</span><span>預計：{data.cycle.dueDate ?? '—'}</span><span>完成：{data.cycle.completedAt ? fmtDate(data.cycle.completedAt) : '進行中'}</span></div></section>
    <section className="workspace-section"><h2>Todo</h2>{taskItems.length ? (['doing', 'todo', 'done'] as const).map((status) => pageGroups[status].length ? <div className="workspace-task-group" key={status}><h3>{status === 'doing' ? '進行中' : status === 'todo' ? '待辦' : '已完成'} <span className="badge">{groups[status].length}</span></h3>{pageGroups[status].map((task) => <div className="workspace-task" key={task.id}><div><strong>{task.title}</strong><MarkdownPreview value={task.notes} /></div><div className="num">{fmtHM(data.byTask.get(task.id) ?? 0)}<br /><span className="hint">{task.dueDate ?? '無期限'}</span></div></div>)}</div> : null) : <div className="empty">這個專案目前沒有 Todo</div>}<PaginationControls label="Todo" page={pagedTasks.page} pageCount={pagedTasks.pageCount} onPageChange={setTaskPage} /></section>
    <section className="workspace-section"><h2>工作日誌</h2>{entries.length ? pagedEntries.items.map((entry) => { const task = data.tasks.find((item) => item.id === entry.taskId); return <div className="workspace-log" key={entry.id}><div className="num mute">{fmtDate(entry.startedAt)}<br />{fmtClock(entry.startedAt)}{entry.endedAt ? `–${fmtClock(entry.endedAt)}` : ''}</div><div><strong>{task?.title || entry.description || '未命名工作'}</strong><MarkdownPreview value={entry.notes} /></div><span className="num">{entry.endedAt ? fmtHM(durationSec(entry)) : '進行中'}</span></div>; }) : <div className="empty">這個專案目前沒有工作日誌</div>}<PaginationControls label="工作日誌" page={pagedEntries.page} pageCount={pagedEntries.pageCount} onPageChange={setEntryPage} /></section>
    <section className="workspace-section"><h2>工時報表</h2>{data.daily.length ? data.daily.map((day) => <div className="workspace-report" key={day.date}><span>{day.date}</span><div className="bar"><i style={{ width: `${Math.min(100, day.seconds / Math.max(...data.daily.map((item) => item.seconds)) * 100)}%` }} /></div><span className="num">{fmtHM(day.seconds)}</span></div>) : <div className="empty">目前沒有可用報表資料</div>}</section>
    {FEATURES.workNoteImagesAndSharing && <section className="workspace-section"><h2>附件與分享</h2><p className="cap">圖片與公開分享功能已暫停。</p></section>}
  </>;
}
