'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { fmtHMS, fmtClock } from '@/lib/time';
import { flattenTree, indentLabel } from '@/lib/tree';
import AutoTextarea from '@/components/AutoTextarea';

type Draft = { projectId: string; taskId: string; description: string };

export default function TimerPanel() {
  const { data, act } = useStore();
  const { timer, projects, tasks } = data;
  const [draft, setDraft] = useState<Draft>({ projectId: '', taskId: '', description: '' });
  const [elapsed, setElapsed] = useState(0);

  // 計時中的即時紀錄：本地先收，500ms 後才寫回擴充
  const [notes, setNotes] = useState('');
  const [savedFlag, setSavedFlag] = useState('');
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // 換一筆計時（或從別的介面改動）時才吃遠端的值，避免打字被蓋掉
  useEffect(() => {
    if (!dirty.current) setNotes(timer?.notes ?? '');
  }, [timer?.entryId, timer?.notes]);

  const writeNotes = (v: string) => {
    setNotes(v);
    dirty.current = true;
    setSavedFlag('…');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await act('patchTimer', { notes: v });
      dirty.current = false;
      setSavedFlag('已存');
      setTimeout(() => setSavedFlag(''), 1200);
    }, 500);
  };

  const stamp = () => {
    const ta = notesRef.current;
    if (!ta) return;
    const at = ta.selectionStart;
    const before = notes.slice(0, at);
    const prefix = before === '' || before.endsWith('\n') ? '' : '\n';
    const ins = `${prefix}${fmtClock(new Date().toISOString())} `;
    writeNotes(before + ins + notes.slice(at));
    requestAnimationFrame(() => {
      const el = notesRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = at + ins.length;
    });
  };

  // 只有本地跳秒，不打擴充 —— 經過時間從 startedAt 現算
  useEffect(() => {
    if (!timer) { setElapsed(0); return; }
    const tick = () => setElapsed((Date.now() - +new Date(timer.startedAt)) / 1000);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timer]);

  const live = timer
    ? { projectId: timer.projectId ?? '', taskId: timer.taskId ?? '', description: timer.description }
    : draft;

  const patch = (p: Partial<Draft>) => {
    if (timer) act('patchTimer', { ...p, ...(p.projectId !== undefined ? { taskId: null } : {}) });
    else setDraft((d) => ({ ...d, ...p, ...(p.projectId !== undefined ? { taskId: '' } : {}) }));
  };

  const toggle = async () => {
    if (timer) {
      // 還沒送出去的字先落地，再停止
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirty.current) await act('patchTimer', { notes });
      dirty.current = false;
      await act('stopTimer');
      setNotes('');
    } else {
      await act('startTimer', {
        projectId: draft.projectId || null,
        taskId: draft.taskId || null,
        description: draft.description,
        notes: '',
        tagIds: [],
      });
    }
  };

  const openTasks = tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'archived' &&
      (!live.projectId || t.projectId === live.projectId),
  );

  return (
    <section className="timer-panel">
      <div className="clock">{fmtHMS(elapsed)}</div>

      <div className="fields">
        <input
          value={live.description}
          placeholder="在做什麼？"
          onChange={(e) => patch({ description: e.target.value })}
        />
        <div className="grid2">
          <select value={live.projectId} onChange={(e) => patch({ projectId: e.target.value })}>
            <option value="">— 未分類 —</option>
            {flattenTree(projects, { includeArchived: false }).map((p) => (
              <option key={p.id} value={p.id}>{indentLabel(p.name, p.depth)}</option>
            ))}
          </select>
          <select value={live.taskId} onChange={(e) => patch({ taskId: e.target.value })}>
            <option value="">— 不綁 todo —</option>
            {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>

        {timer && (
          <div className="livelog">
            <div className="livelog-head">
              工作紀錄
              <button className="btn-sm" onClick={stamp} title="插入現在時間">[時間]</button>
              <span className="flag">{savedFlag}</span>
            </div>
            <AutoTextarea
              innerRef={notesRef}
              value={notes}
              min={96}
              max={360}
              placeholder="隨時寫，停止計時時一起存進這筆"
              onChange={writeNotes}
            />
          </div>
        )}
      </div>

      <button className={`btn-primary${timer ? ' running' : ''}`} onClick={toggle}>
        {timer ? '[x] 停止' : '[>] 開始計時'}
      </button>
    </section>
  );
}
