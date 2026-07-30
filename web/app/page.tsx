'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import TimerPanel from '@/components/TimerPanel';
import Disconnected from '@/components/Disconnected';
import Section from '@/components/Section';
import {
  durationSec, groupByProject, fmtHM, fmtClock, fmtDate,
  startOfDay, startOfWeek,
} from '@/lib/time';

export default function Home() {
  const { status, data, act } = useStore();
  const { entries, projects, settings } = data;

  if (status === 'disconnected') return <Disconnected />;

  const done = entries.filter((e) => e.endedAt);
  const d0 = startOfDay().toISOString();
  const w0 = startOfWeek(new Date(), settings.weekStartsOn).toISOString();
  const today = done.filter((e) => e.startedAt >= d0);
  const week = done.filter((e) => e.startedAt >= w0);

  const sum = (a: typeof done) => a.reduce((s, e) => s + durationSec(e), 0);
  const weekSec = sum(week);
  const groups = groupByProject(week, projects);
  const max = Math.max(1, ...groups.map((g) => g.seconds));

  return (
    <>
      <TimerPanel />

      <div className="kpis" style={{ marginTop: 24 }}>
        <div className="kpi"><span className="cap">今日</span><span className="num">{fmtHM(sum(today))}</span></div>
        <div className="kpi"><span className="cap">本週</span><span className="num">{fmtHM(weekSec)}</span></div>
        <div className="kpi"><span className="cap">本週筆數</span><span className="num">{week.length}</span></div>
        <div className="kpi"><span className="cap">進行中專案</span><span className="num">{projects.filter((p) => !p.archivedAt).length}</span></div>
      </div>

      <Section id="home-projects" title="本週依專案">
      {groups.length ? groups.map((g) => (
        <div className="bar-wrap" key={g.projectId ?? 'none'}>
          <div className="bar-label">
            <span className="swatch" style={{ background: g.color }} />
            <span className="ellipsis">{g.name}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(g.seconds / max) * 100}%`, background: g.color }} />
          </div>
          <div className="bar-val">
            {fmtHM(g.seconds)}{weekSec ? ` · ${Math.round((g.seconds / weekSec) * 100)}%` : ''}
          </div>
        </div>
      )) : (
        <div className="empty">
          本週還沒有紀錄。先到 <Link href="/projects" style={{ textDecoration: 'underline' }}>專案</Link> 建一個，再按上面的開始計時。
        </div>
      )}
      </Section>

      <Section id="home-recent" title="最近紀錄">
      {done.slice(0, 12).map((e) => {
        const p = projects.find((x) => x.id === e.projectId);
        return (
          <div className="item" key={e.id}>
            <span className="swatch" style={{ background: p ? p.color : '#9a9898' }} />
            <div className="grow">
              <div className="ellipsis">{e.description || '（無描述）'}</div>
              <div className="sub">
                {p ? p.name : '未分類'} · {fmtDate(e.startedAt)} {fmtClock(e.startedAt)}–{fmtClock(e.endedAt!)}
                {e.notes?.trim() ? ' · 有紀錄' : ''}
              </div>
            </div>
            <span className="num">{fmtHM(durationSec(e))}</span>
            <div className="act">
              <button
                className="btn-sm"
                title="用同樣設定再開始"
                onClick={() => act('startTimer', {
                  projectId: e.projectId, taskId: e.taskId,
                  description: e.description, tagIds: e.tagIds,
                })}
              >[&gt;]</button>
            </div>
          </div>
        );
      })}
      {!done.length && <div className="empty">還沒有任何紀錄</div>}
      </Section>
    </>
  );
}
