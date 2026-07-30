'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import Disconnected from '@/components/Disconnected';
import Section from '@/components/Section';
import CopyButton from '@/components/CopyButton';
import AutoTextarea from '@/components/AutoTextarea';
import { buildSummary } from '@/lib/summary';
import { durationSec, fmtHM, fmtDate, fmtClock, startOfDay } from '@/lib/time';
import type { Entry } from '@/lib/types';

/** 工作結束後補紀錄的地方：按日期分組，每筆直接就地寫。 */
export default function LogPage() {
  const { status, data } = useStore();
  const { entries, projects, tasks } = data;
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  const summaryFor = (dates: string[]) => () =>
    buildSummary({ dates, entries, projects, tasks });

  const days = useMemo(() => {
    const rows = entries.filter((e) => e.endedAt && !e.deletedAt);
    const map = new Map<string, Entry[]>();
    for (const e of rows) {
      const d = fmtDate(e.startedAt);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, list]) => ({
        date,
        list: list.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)),
        seconds: list.reduce((s, e) => s + durationSec(e), 0),
      }));
  }, [entries]);

  if (status === 'disconnected') return <Disconnected />;

  const today = startOfDay().toISOString();
  const missingToday = entries.filter(
    (e) => e.endedAt && e.startedAt >= today && !e.notes?.trim(),
  ).length;

  const shown = onlyEmpty
    ? days.map((d) => ({ ...d, list: d.list.filter((e) => !e.notes?.trim()) })).filter((d) => d.list.length)
    : days;

  return (
    <>
      <h1>工作日誌</h1>
      <p className="cap">每天收工來這裡把紀錄補完。直接在框裡打字，移開游標就存。</p>

      <div className="row" style={{ marginTop: 24 }}>
        {missingToday > 0 ? (
          <span className="badge badge-dark">今天還有 {missingToday} 筆沒寫</span>
        ) : (
          <span className="badge">今天的紀錄都寫完了</span>
        )}
        <div className="grow" />
        <CopyButton build={summaryFor([fmtDate(new Date())])} label="複製今日總結" />
        <button onClick={() => setOnlyEmpty((v) => !v)}>
          {onlyEmpty ? '[x] 只看未填寫' : '[ ] 只看未填寫'}
        </button>
      </div>

      {shown.length ? shown.map((d) => (
        <Section
          key={d.date}
          id={`log-${d.date}`}
          title={<span className="num">{d.date}</span>}
          extra={
            <>
              <span className="grow" />
              <span className="num mute" style={{ fontWeight: 400, fontSize: 13 }}>
                {fmtHM(d.seconds)} · {d.list.length} 筆
              </span>
              <CopyButton className="btn-sm" build={summaryFor([d.date])} label="複製" />
            </>
          }
        >
          {d.list.map((e) => (
            <LogRow key={e.id} entry={e} projectName={projects.find((p) => p.id === e.projectId)?.name}
              color={projects.find((p) => p.id === e.projectId)?.color} />
          ))}
        </Section>
      )) : <div className="empty">沒有符合的紀錄</div>}
    </>
  );
}

function LogRow({ entry, projectName, color }: {
  entry: Entry; projectName?: string; color?: string;
}) {
  const { act } = useStore();
  const [text, setText] = useState(entry.notes ?? '');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (text === (entry.notes ?? '')) return;
    await act('upsertEntry', { ...entry, notes: text });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--hairline)' }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="swatch" style={{ background: color ?? '#9a9898' }} />
        <span className="num mute" style={{ width: 110, flex: '0 0 110px' }}>
          {fmtClock(entry.startedAt)}–{fmtClock(entry.endedAt!)}
        </span>
        <span className="grow ellipsis">
          {entry.description || '（無描述）'}
          <span className="ash">　{projectName ?? '未分類'}</span>
        </span>
        <span className="num mute">{fmtHM(durationSec(entry))}</span>
        {saved && <span className="badge">已儲存</span>}
      </div>
      <AutoTextarea
        value={text}
        min={text ? 64 : 40}
        max={400}
        placeholder="做了什麼？遇到什麼？下次要注意什麼？"
        onChange={setText}
        onBlur={save}
        onKeyDown={(ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') save(); }}
      />
    </div>
  );
}
