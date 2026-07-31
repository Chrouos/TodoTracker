'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import Disconnected from '@/components/Disconnected';
import Section from '@/components/Section';
import AutoTextarea from '@/components/AutoTextarea';
import { flattenTree, indentLabel, pathOf } from '@/lib/tree';
import type { Schedule } from '@/lib/types';

const DOW = [
  { n: 1, label: '一' }, { n: 2, label: '二' }, { n: 3, label: '三' },
  { n: 4, label: '四' }, { n: 5, label: '五' }, { n: 6, label: '六' }, { n: 0, label: '日' },
];
const DOW_NAME = ['日', '一', '二', '三', '四', '五', '六'];

function dowLabel(days: number[]) {
  const s = [...days].sort();
  if (s.length === 7) return '每天';
  if (s.join() === '1,2,3,4,5') return '每個平日';
  if (s.join() === '0,6') return '每個週末';
  return s.map((d) => DOW_NAME[d]).join('、');
}

const blank = () => ({
  id: '', title: '', projectId: '', notes: '',
  weekdays: [1, 2, 3, 4, 5], createTime: '09:00', dueTime: '',
  remindMinutes: '' as string | number, enabled: true,
});

export default function SchedulesPage() {
  const { status, data, act } = useStore();
  const { schedules, projects } = data;
  const [form, setForm] = useState(blank);

  if (status === 'disconnected') return <Disconnected />;

  const tree = flattenTree(projects);
  const days = new Set(form.weekdays);

  const toggleDay = (n: number) => {
    const next = new Set(days);
    if (next.has(n)) next.delete(n); else next.add(n);
    setForm({ ...form, weekdays: [...next].sort() });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (!form.weekdays.length) { alert('至少要選一天'); return; }
    await act('upsertSchedule', {
      id: form.id || undefined,
      title: form.title,
      projectId: form.projectId || null,
      notes: form.notes,
      weekdays: form.weekdays,
      createTime: form.createTime || '09:00',
      dueTime: form.dueTime || null,
      remindMinutes: form.remindMinutes === '' ? null : Number(form.remindMinutes),
      enabled: form.enabled,
    });
    setForm(blank());
  };

  const edit = (s: Schedule) => setForm({
    id: s.id, title: s.title, projectId: s.projectId ?? '', notes: s.notes ?? '',
    weekdays: s.weekdays, createTime: s.createTime, dueTime: s.dueTime ?? '',
    remindMinutes: s.remindMinutes ?? '', enabled: s.enabled,
  });

  return (
    <>
      <h1>排程</h1>
      <p className="cap">
        固定週期的工作，到指定時間會自動開一張 Todo，快到截止時間時用 Chrome 通知提醒。
        例：每個平日 09:00 開一張「填寫工作日誌」，當天 17:30 截止，提前 10 分鐘提醒。
      </p>

      <form className="card" onSubmit={submit} style={{ marginTop: 24 }}>
        <div className="grid4">
          <label className="field" style={{ gridColumn: 'span 2' }}>
            <span>要做什麼</span>
            <input value={form.title} placeholder="例：填寫工作日誌" required
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="field"><span>專案</span>
            <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">— 未分類 —</option>
              {tree.map((p) => <option key={p.id} value={p.id}>{indentLabel(p.name, p.depth)}</option>)}
            </select>
          </label>
          <label className="field"><span>啟用</span>
            <select value={form.enabled ? '1' : '0'}
              onChange={(e) => setForm({ ...form, enabled: e.target.value === '1' })}>
              <option value="1">開啟</option>
              <option value="0">關閉</option>
            </select>
          </label>
        </div>

        <label className="field" style={{ marginTop: 12 }}>
          <span>重複於</span>
          <div className="dow">
            {DOW.map((d) => (
              <button type="button" key={d.n}
                className={days.has(d.n) ? 'on' : ''}
                onClick={() => toggleDay(d.n)}>{d.label}</button>
            ))}
            <span className="grow" />
            <button type="button" className="btn-sm"
              onClick={() => setForm({ ...form, weekdays: [1, 2, 3, 4, 5] })}>平日</button>
            <button type="button" className="btn-sm"
              onClick={() => setForm({ ...form, weekdays: [0, 1, 2, 3, 4, 5, 6] })}>每天</button>
          </div>
        </label>

        <div className="grid4" style={{ marginTop: 12 }}>
          <label className="field"><span>幾點開單</span>
            <input type="time" value={form.createTime}
              onChange={(e) => setForm({ ...form, createTime: e.target.value })} />
            <span className="hint">到這個時間自動新增到 Todo。</span>
          </label>
          <label className="field"><span>當天截止時間</span>
            <input type="time" value={form.dueTime}
              onChange={(e) => setForm({ ...form, dueTime: e.target.value })} />
            <span className="hint">留空就不設截止。</span>
          </label>
          <label className="field"><span>提前幾分鐘提醒</span>
            <input type="number" min={0} step={5} value={form.remindMinutes}
              placeholder="留空不提醒"
              onChange={(e) => setForm({ ...form, remindMinutes: e.target.value })} />
            <span className="hint">用 Chrome 通知，需要允許通知權限。</span>
          </label>
        </div>

        <label className="field" style={{ marginTop: 12 }}><span>備註</span>
          <AutoTextarea value={form.notes} min={72} max={280}
            placeholder="會一併寫進產生的 Todo"
            onChange={(v) => setForm({ ...form, notes: v })} /></label>

        <div className="actions">
          <button type="submit" className="btn-primary">{form.id ? '儲存變更' : '新增排程'}</button>
          {form.id && <button type="button" onClick={() => setForm(blank())}>取消編輯</button>}
          <button type="button" onClick={() => act('runSchedulesNow')}>立刻檢查一次</button>
        </div>
      </form>

      <Section id="sched-list" title={`清單（${schedules.length}）`}>
        {schedules.length ? schedules.map((s) => {
          const p = projects.find((x) => x.id === s.projectId);
          const bits = [
            dowLabel(s.weekdays),
            `${s.createTime} 開單`,
            s.dueTime ? `${s.dueTime} 截止` : null,
            s.remindMinutes ? `提前 ${s.remindMinutes} 分提醒` : null,
          ].filter(Boolean).join(' · ');
          return (
            <div className="item" key={s.id} style={{ opacity: s.enabled ? 1 : 0.55 }}>
              <button className="btn-ghost btn-sm" style={{ width: 32 }}
                title={s.enabled ? '停用' : '啟用'}
                onClick={() => act('upsertSchedule', { ...s, enabled: !s.enabled })}>
                {s.enabled ? '[x]' : '[ ]'}
              </button>
              <span className="swatch" style={{ background: p ? p.color : '#9a9898' }} />
              <div className="grow">
                <div className="ellipsis">
                  {s.title} {!s.enabled && <span className="badge">已停用</span>}
                </div>
                <div className="sub num">{bits}</div>
                <div className="sub">
                  {p ? pathOf(projects, p.id).join(' / ') : '未分類'}
                  {s.lastRunDate ? ` · 上次開單 ${s.lastRunDate}` : ' · 尚未執行過'}
                </div>
                {s.notes && <div className="notes">{s.notes}</div>}
              </div>
              <div className="act">
                <button className="btn-sm" onClick={() => edit(s)}>[編輯]</button>
                <button className="btn-sm btn-danger" onClick={() => {
                  if (confirm('刪除這條排程？已經產生的 Todo 會保留。')) {
                    act('deleteSchedule', { id: s.id });
                  }
                }}>[x]</button>
              </div>
            </div>
          );
        }) : <div className="empty">還沒有排程</div>}
      </Section>
    </>
  );
}
