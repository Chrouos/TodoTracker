'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import Disconnected from '@/components/Disconnected';
import Section from '@/components/Section';
import CopyButton from '@/components/CopyButton';
import { LineChart, DonutChart } from '@/components/Charts';
import { buildSummary } from '@/lib/summary';
import {
  durationSec, dailySeries, fmtHM, fmtDate, fmtClock, daysBetween, startOfDay,
} from '@/lib/time';
import { taskMetrics, dueLabel } from '@/lib/tasks';
import {
  childrenOf, descendantIds, ancestorIds, pathOf, rollup, secondsByProject,
} from '@/lib/tree';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { status, data, act } = useStore();
  const { projects, tasks, entries } = data;

  const project = projects.find((p) => p.id === id);

  // 這個專案 + 所有後代，統計都以這個範圍為準
  const scope = useMemo(
    () => (project ? new Set([project.id, ...descendantIds(projects, project.id)]) : new Set<string>()),
    [projects, project],
  );

  const scoped = useMemo(
    () => entries.filter((e) => e.endedAt && !e.deletedAt && e.projectId && scope.has(e.projectId)),
    [entries, scope],
  );

  if (status === 'disconnected') return <Disconnected />;
  if (!project) {
    return (
      <>
        <h1>找不到這個專案</h1>
        <p className="cap">可能已經被刪掉了。<Link href="/projects" style={{ textDecoration: 'underline' }}>回專案列表</Link></p>
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

  // 最近一次有紀錄是什麼時候 —— 用來判斷停滯
  const lastAt = scoped.reduce<string | null>(
    (max, e) => (!max || e.startedAt > max ? e.startedAt : max), null,
  );
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

  const from = new Date(startOfDay().getTime() - 29 * 864e5);
  const series = dailySeries(scoped.filter((e) => new Date(e.startedAt) >= from), from, new Date());

  // 子專案分佈；自己這層直接記的時間也算一片
  const slices = kids
    .map((k) => ({
      key: k.id, id: k.id, name: k.name, color: k.color,
      seconds: roll.get(k.id)?.total ?? 0, canDrill: false,
    }))
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
  if (r.own > 0 && slices.length) {
    slices.push({ key: '__self__', id: project.id, name: '（直接記在本層）', color: '#9a9898', seconds: r.own, canDrill: false });
  }

  const crumbIds = ancestorIds(projects, project.id).slice(0, -1);
  const crumbNames = pathOf(projects, project.id).slice(0, -1);
  const dates = [...new Set(scoped.map((e) => fmtDate(e.startedAt)))].sort();

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
        {dates.length > 0 && (
          <CopyButton
            label="複製此專案總結"
            build={() => buildSummary({ dates, entries: scoped, projects, tasks: scopedTasks })}
          />
        )}
      </div>

      <div className="kpis" style={{ marginTop: 24 }}>
        <div className="kpi">
          <span className="cap">總時數{kids.length > 0 && '（含子專案）'}</span>
          <span className="num">{fmtHM(r.total)}</span>
        </div>
        <div className="kpi">
          <span className="cap">本層直接記錄</span>
          <span className="num">{kids.length > 0 ? fmtHM(r.own) : '—'}</span>
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
        <div className="chart-box">
          <LineChart data={series} />
        </div>
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
                  {t.title}{' '}
                  {dl && <span className={`badge${m.isLate ? ' overdue' : ''}`}>{dl}</span>}
                </div>
                {tp && tp.id !== project.id && <div className="sub">{tp.name}</div>}
              </div>
              <span className="num ash">{m.worked ? fmtHM(m.worked) : ''}</span>
            </div>
          );
        }) : <div className="empty">這個專案還沒有 todo</div>}
      </Section>

      <Section id={`pd-entries-${project.id}`} title="最近紀錄">
        {scoped.length ? scoped
          .slice()
          .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
          .slice(0, 20)
          .map((e) => {
            const ep = projects.find((x) => x.id === e.projectId);
            return (
              <div className="item" key={e.id}>
                <span className="swatch" style={{ background: ep ? ep.color : '#9a9898' }} />
                <div className="grow">
                  <div className="ellipsis">{e.description || '（無描述）'}</div>
                  <div className="sub">
                    {ep && ep.id !== project.id ? `${ep.name} · ` : ''}
                    {fmtDate(e.startedAt)} {fmtClock(e.startedAt)}–{fmtClock(e.endedAt!)}
                  </div>
                  {e.notes && <div className="notes">{e.notes}</div>}
                </div>
                <span className="num">{fmtHM(durationSec(e))}</span>
              </div>
            );
          }) : <div className="empty">還沒有計時紀錄</div>}
      </Section>
    </>
  );
}
