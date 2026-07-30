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
  durationSec, dailySeries, timelineData, fmtHM, fmtDate, fmtClock,
  startOfDay, startOfWeek, startOfMonth,
} from '@/lib/time';
import {
  childrenOf, ancestorIds, pathOf, rollup, secondsByProject, flattenTree, indentLabel,
} from '@/lib/tree';

type Range = 'today' | 'week' | 'month' | 'all';
const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: '今日' }, { key: 'week', label: '本週' },
  { key: 'month', label: '本月' }, { key: 'all', label: '全部' },
];

export default function ReportsPage() {
  const { status, data, act } = useStore();
  const { entries, projects, tags, tasks, settings } = data;
  const [range, setRange] = useState<Range>('week');
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null); // 甜甜圈鑽到哪一層

  const rows = useMemo(() => {
    const from = (
      range === 'today' ? startOfDay()
        : range === 'week' ? startOfWeek(new Date(), settings.weekStartsOn)
          : range === 'month' ? startOfMonth()
            : new Date(0)
    ).toISOString();
    return entries.filter((e) => e.endedAt && e.startedAt >= from);
  }, [entries, range, settings.weekStartsOn]);

  if (status === 'disconnected') return <Disconnected />;

  const totalSec = rows.reduce((s, e) => s + durationSec(e), 0);
  const activeDays = new Set(rows.map((e) => fmtDate(e.startedAt))).size;

  // 甜甜圈：顯示目前焦點的直接子專案，時數含各自的後代
  const own = secondsByProject(rows);
  const roll = rollup(projects, own);
  const slices = childrenOf(projects, focusId)
    .map((p) => ({
      key: p.id, id: p.id as string | null, name: p.name, color: p.color,
      seconds: roll.get(p.id)?.total ?? 0,
      canDrill: childrenOf(projects, p.id).length > 0,
    }))
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  const here = own.get(focusId) ?? 0;
  if (here > 0) {
    slices.push({
      key: '__here__', id: null,
      name: focusId ? '（直接記在本層）' : '（未分類）',
      color: '#9a9898', seconds: here, canDrill: false,
    });
  }
  const sliceTotal = slices.reduce((s, x) => s + x.seconds, 0);
  const crumbNames = pathOf(projects, focusId);
  const crumbIds = ancestorIds(projects, focusId);

  // 折線圖用連續日期，區間太短就往前補，才看得出趨勢
  const today = startOfDay();
  const lineFrom =
    range === 'today' ? new Date(today.getTime() - 6 * 864e5)
      : range === 'week' ? startOfWeek(new Date(), settings.weekStartsOn)
        : range === 'month' ? startOfMonth()
          : new Date(today.getTime() - 29 * 864e5);
  const lineLabel =
    range === 'today' ? '最近 7 天'
      : range === 'week' ? '本週'
        : range === 'month' ? '本月'
          : '最近 30 天';
  const series = dailySeries(
    entries.filter((e) => e.endedAt && new Date(e.startedAt) >= lineFrom),
    lineFrom, new Date(),
  );

  // 時間軸：太多天會擠爆，最多顯示最近 14 天
  const tlDates = series.map((d) => d.date).slice(-14);
  const tl = timelineData(entries.filter((e) => e.endedAt && !e.deletedAt), tlDates);

  const exportCsv = () => {
    const head = ['date', 'start', 'end', 'seconds', 'hours', 'project', 'task', 'description', 'notes', 'tags'];
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((e) => {
      const p = projects.find((x) => x.id === e.projectId);
      const t = tasks.find((x) => x.id === e.taskId);
      const sec = durationSec(e);
      return [
        fmtDate(e.startedAt), fmtClock(e.startedAt), fmtClock(e.endedAt!),
        sec, (sec / 3600).toFixed(2),
        p?.name ?? '', t?.title ?? '', e.description, e.notes ?? '',
        e.tagIds.map((id) => tags.find((x) => x.id === id)?.name).filter(Boolean).join('|'),
      ].map(q).join(',');
    });
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')],
      { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `todotracker-${range}-${fmtDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <h1>報表</h1>

      <div className="row" style={{ marginTop: 24 }}>
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="grow" />
        <button onClick={() => {
          const now = new Date();
          setEditing({
            id: '', description: '', notes: '', projectId: '', taskId: '',
            startedAt: new Date(now.getTime() - 3600e3).toISOString(),
            endedAt: now.toISOString(),
          });
        }}>手動補登</button>
        <CopyButton
          label="複製區間總結"
          build={() => buildSummary({
            dates: [...new Set(rows.map((e) => fmtDate(e.startedAt)))].sort(),
            entries, projects, tasks,
          })}
        />
        <button onClick={exportCsv}>↓ CSV</button>
      </div>

      <div className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi"><span className="cap">總時數</span><span className="num">{fmtHM(totalSec)}</span></div>
        <div className="kpi"><span className="cap">筆數</span><span className="num">{rows.length}</span></div>
        <div className="kpi"><span className="cap">平均每筆</span><span className="num">{rows.length ? fmtHM(totalSec / rows.length) : '—'}</span></div>
        <div className="kpi"><span className="cap">有紀錄天數</span><span className="num">{activeDays}</span></div>
      </div>

      <Section id="rep-donut" title="專案時間分配">
        <div className="crumbs">
          <span className="crumb" onClick={() => setFocusId(null)}>全部</span>
          {crumbNames.map((n, i) => (
            <span key={crumbIds[i]}>
              <span className="mute"> / </span>
              <span className="crumb" onClick={() => setFocusId(crumbIds[i])}>{n}</span>
            </span>
          ))}
        </div>

        {slices.length ? (
          <div className="chart-split">
            <DonutChart data={slices} />
            <div className="legend">
              {slices.map((s) => (
                <div
                  className={`legend-row${s.canDrill ? ' drillable' : ''}`}
                  key={s.key}
                  title={s.canDrill ? '點開看子專案' : undefined}
                  onClick={s.canDrill ? () => setFocusId(s.id) : undefined}
                >
                  <span className="swatch" style={{ background: s.color }} />
                  <span className="grow ellipsis">
                    {s.name}{s.canDrill && <span className="mark"> [+]</span>}
                  </span>
                  <span className="num">{fmtHM(s.seconds)}</span>
                  <span className="num mute" style={{ width: 48, textAlign: 'right' }}>
                    {sliceTotal ? `${Math.round((s.seconds / sliceTotal) * 100)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : <div className="empty">這一層在這個區間沒有紀錄</div>}
      </Section>

      <Section
        id="rep-time"
        title={`時間軸${tlDates.length ? ` · ${tlDates[0]} ～ ${tlDates[tlDates.length - 1]}` : ''}`}
      >
        <div className="chart-box scroll-x">
          <TimelineChart
            tl={tl}
            meta={(e) => {
              const p = projects.find((x) => x.id === e.projectId);
              return {
                color: p ? p.color : '#9a9898',
                label: e.description || (p ? p.name : '未分類'),
              };
            }}
          />
        </div>
      </Section>

      <Section id="rep-line" title={`每日趨勢 · ${lineLabel}`}>
        <div className="chart-box">
          <LineChart data={series} />
        </div>
      </Section>

      <Section id="rep-detail" title={`明細（${rows.length} 筆）`}>
      {rows.slice(0, 200).map((e) => {
        const p = projects.find((x) => x.id === e.projectId);
        return (
          <div className="item" key={e.id}>
            <span className="swatch" style={{ background: p ? p.color : '#9a9898' }} />
            <div className="grow">
              <div className="ellipsis">
                {e.description || '（無描述）'}{' '}
                {e.tagIds.map((id) => tags.find((x) => x.id === id)).filter(Boolean)
                  .map((t) => <span className="badge" key={t!.id}>{t!.name}</span>)}
              </div>
              <div className="sub">
                {p ? p.name : '未分類'} · {fmtDate(e.startedAt)} {fmtClock(e.startedAt)}–{fmtClock(e.endedAt!)}
              </div>
            </div>
            <span className="num">{fmtHM(durationSec(e))}</span>
            <div className="act">
              <button className="btn-sm" onClick={() => setEditing({
                id: e.id, description: e.description, notes: e.notes ?? '',
                projectId: e.projectId ?? '', taskId: e.taskId ?? '',
                startedAt: e.startedAt, endedAt: e.endedAt!,
              })}>[編輯]</button>
              <button className="btn-sm btn-danger" onClick={() => act('deleteEntry', { id: e.id })}>[x]</button>
            </div>
          </div>
        );
      })}
      </Section>

      {editing && <EntryDialog draft={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
