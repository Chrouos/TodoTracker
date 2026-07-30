'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import Disconnected from '@/components/Disconnected';
import Section from '@/components/Section';
import { EXTENSION_ID } from '@/lib/bridge';
import { fmtDate } from '@/lib/time';
import type { Settings } from '@/lib/types';

export default function SettingsPage() {
  const { status, data, act, refresh } = useStore();
  const [form, setForm] = useState<Settings>(data.settings);

  useEffect(() => { setForm(data.settings); }, [data.settings]);

  if (status === 'disconnected') return <Disconnected />;

  const backup = async () => {
    const dump = await act<Record<string, unknown>>('exportAll');
    if (!dump) return;
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `todotracker-backup-${fmtDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = async (file: File) => {
    if (!confirm('匯入會覆蓋擴充裡目前所有資料，確定？')) return;
    try {
      await act('importAll', JSON.parse(await file.text()));
      await refresh();
      alert('已匯入');
    } catch (e) {
      alert('匯入失敗：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <>
      <h1>設定</h1>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="grid2">
          <label className="field">
            <span>閒置提醒（分）</span>
            <input type="number" min={1} value={form.idleThresholdMin}
              onChange={(e) => setForm({ ...form, idleThresholdMin: Number(e.target.value) })} />
            <span className="hint">
              計時中如果這麼久沒碰鍵盤滑鼠（或鎖螢幕），回來時會問你這段要不要扣掉。
              防止忘記按停止導致時數灌水。
            </span>
          </label>
          <label className="field"><span>每筆進位（分）</span>
            <select value={String(form.roundToMin)}
              onChange={(e) => setForm({ ...form, roundToMin: Number(e.target.value) })}>
              <option value="0">不進位</option>
              <option value="5">5</option><option value="6">6</option>
              <option value="15">15</option><option value="30">30</option>
            </select>
            <span className="hint">
              每筆紀錄的長度往上湊到這個倍數。設 15 的話，8 分鐘會記成 15 分鐘。
              想要精確時數就留「不進位」。
            </span>
          </label>
        </div>
        <div className="actions">
          <button className="btn-primary" onClick={async () => { await act('saveSettings', form); alert('已儲存'); }}>
            儲存設定
          </button>
        </div>
      </div>

      <Section id="set-data" title="資料">
      <div className="card">
        <p className="cap">
          資料存在 Chrome 擴充的本機儲存區，沒有伺服器。換電腦前記得備份。
        </p>
        <div className="actions">
          <button onClick={backup}>↓ 匯出備份 JSON</button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            ↑ 匯入備份
            <input type="file" accept="application/json" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
          </label>
        </div>
      </div>
      </Section>

      <Section id="set-conn" title="連線">
      <div className="card">
        <div className="item" style={{ borderBottom: 0, paddingTop: 0 }}>
          <div className="grow">
            <div>擴充 ID</div>
            <div className="sub">{EXTENSION_ID}</div>
          </div>
          <span className="badge badge-dark">{status === 'ok' ? '已連線' : '未連線'}</span>
        </div>
        <p className="cap">
          擴充 ID 由 manifest 裡的固定 key 決定，重新載入也不會變。
          要換的話設環境變數 <code>NEXT_PUBLIC_EXTENSION_ID</code>。
        </p>
      </div>
      </Section>
    </>
  );
}
