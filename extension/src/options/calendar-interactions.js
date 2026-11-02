const snap = minutes => Math.round(minutes / 15) * 15;

export function attachCalendarInteractions(root, { onCreate, onOpen, onChange, onBusy, onError }) {
  let current = null, suppressedUntil = 0, pending = false;
  function targetAt(event) { return document.elementFromPoint(event.clientX, event.clientY); }
  function monthDate(event) {
    const week = targetAt(event)?.closest('.cal-month-week');
    if (!week) return null;
    const rect = week.getBoundingClientRect();
    const col = Math.max(0, Math.min(6, Math.floor((event.clientX - rect.left) / rect.width * 7)));
    return week.querySelectorAll('[data-cal-drop-date]')[col]?.dataset.calDropDate;
  }
  function cancel() {
    if (!current) return;
    current.preview?.remove();
    current = null;
    suppressedUntil = performance.now() + 150;
    onBusy(false);
  }
  function down(event) {
    if (pending || current || event.button !== 0 || event.target.closest('dialog')) return;
    const plan = event.target.closest('[data-cal-plan]');
    const slot = event.target.closest('[data-cal-slot]');
    const month = Boolean(plan?.classList.contains('cal-month-bar'));
    if (plan && !month && !plan.hasAttribute('data-cal-movable')) return;
    if (!plan && !slot) return;
    const scroller = root.querySelector('.cal-time-scroll');
    current = {
      id: plan?.dataset.calPlan, mode: event.target.closest('[data-cal-resize]')?.dataset.calResize || 'move',
      date: plan?.dataset.calDate || slot?.dataset.calSlot, month, slot,
      sourceDate: month ? monthDate(event) : null,
      x: event.clientX, y: event.clientY, scroll: scroller?.scrollTop || 0, moved: false,
      source: plan, top: plan?.offsetTop || 0,
      minute: slot ? Math.max(0, Math.min(1425, snap((event.clientY - slot.getBoundingClientRect().top) / 64 * 60))) : 0,
    };
    root.setPointerCapture(event.pointerId);
    onBusy(true);
  }
  function move(event) {
    const state = current;
    if (!state) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 4 && !state.moved) return;
    state.moved = true;
    event.preventDefault();
    const scroller = root.querySelector('.cal-time-scroll');
    state.delta = snap((event.clientY - state.y + (scroller?.scrollTop || 0) - state.scroll) / 64 * 60);
    state.targetDate = state.month ? monthDate(event) : targetAt(event)?.closest('.cal-time-day')?.dataset.calDate;
    if (state.month) return;
    if (!state.preview) {
      state.preview = document.createElement('div');
      state.preview.className = 'cal-pointer-preview';
      (state.slot?.parentElement || state.source.parentElement).append(state.preview);
    }
    const preview = state.preview;
    if (state.slot) {
      const end = Math.max(0, Math.min(1440, state.minute + state.delta));
      preview.style.cssText = `left:2px;width:calc(50% - 4px);top:${Math.min(state.minute, end) / 60 * 64}px;height:${Math.max(15, Math.abs(end - state.minute)) / 60 * 64}px`;
    } else {
      const pixels = state.delta / 60 * 64;
      const height = state.source.offsetHeight;
      preview.style.cssText = `left:2px;width:calc(50% - 4px);top:${state.mode === 'resize-end' ? state.top : state.top + pixels}px;height:${state.mode === 'resize-start' ? Math.max(16, height - pixels) : state.mode === 'resize-end' ? Math.max(16, height + pixels) : height}px`;
    }
  }
  async function up(event) {
    const state = current;
    if (!state) return;
    current = null;
    state.preview?.remove();
    suppressedUntil = performance.now() + 200;
    try {
      pending = true;
      if (state.slot) {
        const other = Math.max(0, Math.min(1440, state.minute + (state.delta || 0)));
        onCreate({ date: state.date, startMinute: state.moved ? Math.min(state.minute, other) : state.minute, endMinute: state.moved ? Math.max(state.minute, other) + (state.minute === other ? 15 : 0) : state.minute + 30 });
      } else if (!state.moved) onOpen(state.id);
      else if (state.moved) {
        const targetDate = state.month ? monthDate(event) : state.targetDate;
        if (targetDate) await onChange({ id: state.id, mode: state.mode, sourceDate: state.sourceDate, targetDate, minuteDelta: state.month ? 0 : state.delta || 0 });
      }
    } catch (error) { onError(error); }
    finally { pending = false; onBusy(false); }
  }
  function click(event) {
    if (event.target.closest('dialog')) return;
    if (performance.now() < suppressedUntil) { suppressedUntil = 0; event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function key(event) { if (event.key === 'Escape' && current) { event.preventDefault(); cancel(); } }
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('click', click, true);
  window.addEventListener('keydown', key);
  return () => {
    cancel();
    root.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', cancel);
    root.removeEventListener('click', click, true); window.removeEventListener('keydown', key);
  };
}
