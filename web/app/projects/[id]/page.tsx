'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import Disconnected from '@/components/Disconnected';
import Section from '@/components/Section';
import CopyButton from '@/components/CopyButton';
import EntryDialog, { type EntryDraft } from '@/components/EntryDialog';
import ProjectNotes from '@/components/ProjectNotes';
import { LineChart, DonutChart } from '@/components/Charts';
import { buildSummary } from '@/lib/summary';
import {
  durationSec, dailySeries, fmtHM, fmtDate, fmtClock, daysBetween,
  startOfDay, startOfWeek, startOfMonth,
} from '@/lib/time';
import { taskMetrics, dueLabel } from '@/lib/tasks';
import {
  childrenOf, descendantIds, ancestorIds, pathOf, rollup, secondsByProject,
} from '@/lib/tree';

type Range = 'all' | 'week' | 'month';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { status, data, act } = useStore();
  const { projects, tasks, entries, settings } = data;

  // ── hooks 一律放最前面，early return 才不會打亂順序 ──
  const [includeKids, setIncludeKids] = useState(true);
  const [q, setQ] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [limit, setLimit] = useState(50);
  const [editing, setEditing] = useState<EntryDraft | null>(null);

  const project = projects.find((p) => p.id === id);

  /** 統計範圍：自己 +（可選）所有後代 */
  const scope = useMemo(() => {
    if (!project) return new Set<string>();
    return includeKids
      ? new Set([project.id, ...descendantIds(projects, project.id)])
      : new Set([project.id]);
  }, [projects, project, includeKids]);

  const scoped = useMemo(
    () => entries
      .filter((e) => e.endedAt && !e.deletedAt && e.projectId && scope.has(e.projectId))
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
    [entries, scope],
  );

  /** 再套上搜尋與區間 */
  const filtered = useMemo(() => {
    const from = range === 'week' ? startOfWeek(new Date(), settings.weekStartsOn)
      : range === 'month' ? startOfMonth()
        : null;
    const kw = q.trim().toLowerCase();
    return scoped.filter((e) => {
      if (from && new Date(e.startedAt) < from) return false;
      if (!kw) return true;
      return `${e.description} ${e.notes ?? ''}`.toLowerCase().includes(kw);
    });
  }, [scoped, range, q, settings.weekStartsOn]);

  /** 依日期分組 */
  const byDay = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const e of filtered.slice(0, limit)) {
      const d = fmtDate(e.startedAt);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return [...map.entries()].map(([date, list]) => ({
      date,
      list,
      seconds: list.reduce((s, e) => s + durationSec(e), 0),
    }));
  }, [filtered, limit]);

  if (status === 'disconnected') return <Disconnected />;
  if (!project) {
    return (
      <>
        <h1>找不到這個專案</h1>
        <p className="cap">
          可能已經被刪掉了。<Link href="/projects" style={{ textDecoration: 'underline' }}>回專案列表</Link>
        </p>
      </>
    );
  }

  const roll = rollup(projects, secondsByProject(entries.filter((e) => e.endedAt)));
  const r = roll.get(project.id) ?? { own: 0, total: 0 };
  const kids = childrenOf(projects, project.id);

  const scopedTasks = tasks.filter(
    (t) => t.status !== 'archived' && t.projectId && scope.has(t.projectId),
  );
  const doneTasks = scopedTasks.filter((t) => t.status === 'done');
  const openTasks = scopedTasks.filter((t) => t.status !== 'done');
  const overdue = openTasks.filter((t) => taskMetrics(t, entries).isLate);
  const pct = scopedTasks.length ? Math.round((doneTasks.length / scopedTasks.length) * 100) : null;

  const lastAt = scoped.length ? scoped[0].startedAt : null;
  const idleDays = lastAt ? daysBetween(fmtDate(lastAt), fmtDate(new Date())) ?? 0 : null;

  const state = project.archivedAt
    ? { label: '已封存', tone: '' }
    : idleDays === null
      ? { label: '尚未開始', tone: '' }
      : idleDays <= 2
        ? { label: '進行中', tone: 'ok' }
        : idleDays <= 14
          ? { label: `${idleDays} 天沒動`, tone: '' }
          : { label: `停滯 ${idleDays} 天`, tone: 'warn' };

  const from30 = new Date(startOfDay().getTime() - 29 * 864e5);
  const series = dailySeries(scoped.filter((e) => new Date(e.startedAt) >= from30), from30, new Date());

  const slices = kids
    .map((k) => ({
      key: k.id, id: k.id as string | null, name: k.name, color: k.color,
      seconds: roll.get(k.id)?.total ?? 0, canDrill: false,
    }))
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
  if (r.own > 0 && slices.length) {
    slices.push({
      key: '__self__', id: project.id, name: '（直接記在本層）',
      color: '#9a9898', seconds: r.own, canDrill: false,
    });
  }

  const crumbIds = ancestorIds(projects, project.id).slice(0, -1);
  const crumbNames = pathOf(projects, project.id).slice(0, -1);
  const filteredSec = filtered.reduce((s, e) => s + durationSec(e), 0);

  const exportCsv = () => {
    const head = ['date', 'start', 'end', 'seconds', 'hours', 'project', 'task', 'description', 'notes'];
    const qq = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((e) => {
      const p = projects.find((x) => x.id === e.projectId);
      const t = tasks.find((x) => x.id === e.taskId);
      const sec = durationSec(e);
      return [
        fmtDate(e.startedAt), fmtClock(e.startedAt), fmtClock(e.endedAt!),
        sec, (sec / 3600).toFixed(2),
        p ? pathOf(projects, p.id).join(' / ') : '', t?.title ?? '',
        e.description, e.notes ?? '',
      ].map(qq).join(',');
    });
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')],
      { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name}-${fmtDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="crumbs">
        <Link href="/projects" className="crumb">專案</Link>
        {crumbNames.map((n, i) => (
          <span key={crumbIds[i]}>
            <span className="mute"> / </span>
            <Link href={`/projects/${crumbIds[i]}`} className="crumb">{n}</Link>
          </span>
        ))}
      </div>

      <div className="row" style={{ gap: 12 }}>
        <span className="swatch" style={{ background: project.color, width: 14, height: 14, flex: '0 0 14px' }} />
        <h1>{project.name}</h1>
        <span className={`badge${state.tone === 'ok' ? ' ok' : state.tone === 'warn' ? ' overdue' : ''}`}>
          {state.label}
        </span>
        <div className="grow" />
        {scoped.length > 0 && (
          <CopyButton
            label="複製此專案總結"
            build={() => buildSummary({
              dates: [...new Set(scoped.map((e) => fmtDate(e.startedAt)))].sort(),
              entries: scoped, projects, tasks: scopedTasks,
            })}
          />
        )}
      </div>

      <div className="kpis" style={{ marginTop: 24 }}>
        <div className="kpi">
          <span className="cap">總時數{kids.length > 0 && includeKids && '（含子專案）'}</span>
          <span className="num">{fmtHM(includeKids ? r.total : r.own)}</span>
        </div>
        <div className="kpi">
          <span className="cap">紀錄筆數</span>
          <span className="num">{scoped.length}</span>
        </div>
        <div className="kpi">
          <span className="cap">Todo 完成</span>
          <span className="num">{scopedTasks.length ? `${doneTasks.length}/${scopedTasks.length}` : '—'}</span>
        </div>
        <div className="kpi">
          <span className="cap">最近活動</span>
          <span className="num">{lastAt ? fmtDate(lastAt) : '—'}</span>
        </div>
      </div>

      {pct !== null && (
        <div style={{ marginTop: 16 }}>
          <div className="row cap" style={{ marginBottom: 4 }}>
            <span>Todo 進度</span>
            <div className="grow" />
            <span className="num">{pct}%{overdue.length > 0 && ` · ${overdue.length} 個逾期`}</span>
          </div>
          <div className="bar-track" style={{ height: 8 }}>
            <div className="bar-fill" style={{ width: `${pct}%`, background: project.color }} />
          </div>
        </div>
      )}

      <Section
        id={`pd-notes-${project.id}`}
        title={`目標與筆記${project.notes?.length ? `（${project.notes.length}）` : ''}`}
      >
        <ProjectNotes project={project} />
      </Section>

      {kids.length > 0 && (
        <Section id={`pd-kids-${project.id}`} title={`子專案（${kids.length}）`}>
          <div className="chart-split">
            {slices.length > 0 && <DonutChart data={slices} size={180} />}
            <div className="legend">
              {kids.map((k) => {
                const kr = roll.get(k.id) ?? { own: 0, total: 0 };
                const kScope = new Set([k.id, ...descendantIds(projects, k.id)]);
                const kTasks = tasks.filter((t) => t.status !== 'archived' && t.projectId && kScope.has(t.projectId));
                const kDone = kTasks.filter((t) => t.status === 'done').length;
                return (
                  <div className="legend-row drillable" key={k.id}>
                    <span className="swatch" style={{ background: k.color }} />
                    <Link href={`/projects/${k.id}`} className="grow ellipsis" style={{ textDecoration: 'underline' }}>
                      {k.name}
                    </Link>
                    <span className="mute">{kTasks.length ? `${kDone}/${kTasks.length}` : ''}</span>
                    <span className="num">{fmtHM(kr.total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      <Section id={`pd-trend-${project.id}`} title="每日趨勢 · 最近 30 天">
        <div className="chart-box"><LineChart data={series} /></div>
      </Section>

      <Section id={`pd-todo-${project.id}`} title={`Todo（${openTasks.length} 個未完成）`}>
        {scopedTasks.length ? [...openTasks, ...doneTasks].map((t) => {
          const m = taskMetrics(t, entries);
          const done = t.status === 'done';
          const dl = dueLabel(m, done);
          const tp = projects.find((x) => x.id === t.projectId);
          return (
            <div className="item" key={t.id}>
              <button className="btn-ghost btn-sm" style={{ width: 32 }}
                title={done ? '重新打開' : '標記完成'}
                onClick={() => act('upsertTask', { ...t, status: done ? 'todo' : 'done' })}>
                {done ? '[x]' : '[ ]'}
              </button>
              <div className="grow">
                <div className="ellipsis" style={{
                  color: done ? 'var(--text-ash)' : undefined,
                  textDecoration: done ? 'line-through' : undefined,
                }}>
                  {t.title} {dl && <span className={`badge${m.isLate ? ' overdue' : ''}`}>{dl}</span>}
                </div>
                {tp && tp.id !== project.id && <div className="sub">{tp.name}</div>}
              </div>
              <span className="num ash">{m.worked ? fmtHM(m.worked) : ''}</span>
            </div>
          );
        }) : <div className="empty">這個專案還沒有 todo</div>}
      </Section>

      {/* ── 紀錄：這個專案做過的每一段時間 ── */}
      <Section
        id={`pd-entries-${project.id}`}
        title={`紀錄（${filtered.length} 筆 · ${fmtHM(filteredSec)}）`}
      >
        <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={q}
            placeholder="搜尋描述與工作紀錄…"
            onChange={(e) => { setQ(e.target.value); setLimit(50); }}
            style={{ width: 240 }}
          />
          <div className="seg">
            {([['all', '全部'], ['month', '本月'], ['week', '本週']] as const).map(([k, label]) => (
              <button key={k} className={range === k ? 'active' : ''}
                onClick={() => { setRange(k); setLimit(50); }}>{label}</button>
            ))}
          </div>
          {kids.length > 0 && (
            <button onClick={() => { setIncludeKids((v) => !v); setLimit(50); }}>
              {includeKids ? '[x] 含子專案' : '[ ] 含子專案'}
            </button>
          )}
          <div className="grow" />
          {filtered.length > 0 && <button onClick={exportCsv}>↓ CSV</button>}
        </div>

        {byDay.length ? (
          <>
            {byDay.map((d) => (
              <div key={d.date} style={{ marginBottom: 24 }}>
                <div className="row" style={{
                  borderBottom: '1px solid var(--hairline-strong)', paddingBottom: 6, marginBottom: 4,
                }}>
                  <span className="num" style={{ fontWeight: 700 }}>{d.date}</span>
                  <div className="grow" />
                  <span className="num mute">{fmtHM(d.seconds)} · {d.list.length} 筆</span>
                </div>

                {d.list.map((e) => {
                  const ep = projects.find((x) => x.id === e.projectId);
                  const et = tasks.find((x) => x.id === e.taskId);
                  return (
                    <div className="item" key={e.id}>
                      <span className="num mute" style={{ width: 100, flex: '0 0 100px' }}>
                        {fmtClock(e.startedAt)}–{fmtClock(e.endedAt!)}
                      </span>
                      <span className="swatch" style={{ background: ep ? ep.color : '#9a9898' }} />
                      <div className="grow">
                        <div className="ellipsis">
                          {e.description || '（無描述）'}
                          {et && <span className="badge">{et.title}</span>}
                        </div>
                        {ep && ep.id !== project.id && (
                          <div className="sub">{pathOf(projects, ep.id).join(' / ')}</div>
                        )}
                        {e.notes && <div className="notes">{e.notes}</div>}
                      </div>
                      <span className="num">{fmtHM(durationSec(e))}</span>
                      <div className="act">
                        <button className="btn-sm" onClick={() => setEditing({
                          id: e.id, description: e.description, notes: e.notes ?? '',
                          projectId: e.projectId ?? '', taskId: e.taskId ?? '',
                          startedAt: e.startedAt, endedAt: e.endedAt!,
                        })}>[編輯]</button>
                        <button className="btn-sm btn-danger"
                          onClick={() => act('deleteEntry', { id: e.id })}>[x]</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {filtered.length > limit && (
              <div style={{ textAlign: 'center', paddingTop: 8 }}>
                <button onClick={() => setLimit((n) => n + 50)}>
                  載入更多（還有 {filtered.length - limit} 筆）
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty">
            {scoped.length ? '這個條件下沒有紀錄' : '這個專案還沒有計時紀錄'}
          </div>
        )}
      </Section>

      {editing && <EntryDialog draft={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
