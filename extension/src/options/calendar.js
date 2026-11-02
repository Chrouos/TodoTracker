import { buildCalendarModel, navigateCalendarDate, calendarPointerChange } from '../lib/calendar.js';
import { fmtDate } from '../lib/time.js';
import { translate, formatDisplayDate } from '../lib/i18n.js';
import { renderCalendarView, calendarEscape as esc } from './calendar-view.js';
import { createCalendarEditor } from './calendar-editor.js';
import { attachCalendarInteractions } from './calendar-interactions.js';

export function createCalendarController({ root, getSnapshot, getLocale, actions, editors, now = () => new Date() }) {
  let snapshot = getSnapshot();
  let snapshotSignature = JSON.stringify(snapshot);
  let active = false, ticker = null;
  let view = 'week', date = fmtDate(now()), projectId = 'all';
  let showPlans = true, showActual = true, showDue = true;
  let editorOpen = false, pointerBusy = false;
  const t = (key, variables) => translate(getLocale(), `calendar.${key}`, variables);
  root.innerHTML = `<div class="cal-toolbar"><div class="cal-nav"><button type="button" data-cal-nav="today"></button><button type="button" data-cal-nav="-1">‹</button><button type="button" data-cal-nav="1">›</button></div><h2 data-cal-range></h2><div class="cal-view-switch">${['month', 'week', 'day', 'agenda'].map(mode => `<button type="button" data-cal-view="${mode}"></button>`).join('')}</div><button type="button" class="btn-primary" data-cal-new></button></div>
    <div class="cal-filters"><select data-cal-project></select><label><input type="checkbox" data-cal-filter="plans" checked><i class="cal-legend-dot"></i><span data-cal-label="planned"></span></label><label><input type="checkbox" data-cal-filter="actual" checked><i class="cal-legend-dot solid"></i><span data-cal-label="actual"></span></label><label><input type="checkbox" data-cal-filter="due" checked><span data-cal-label="due"></span></label></div><div class="cal-error" data-cal-error role="status"></div><div data-cal-body></div><p class="cal-hint" data-cal-label="hint"></p>`;
  const body = root.querySelector('[data-cal-body]');
  const error = root.querySelector('[data-cal-error]');
  const editor = createCalendarEditor({ root, getSnapshot: () => snapshot, getLocale, actions, editors, onClose: () => { editorOpen = false; render(); } });
  function openPlanEditor(options) {
    if (editor.open({ date, ...options })) editorOpen = true;
  }
  let needsScroll = true;

  function render() {
    if (!active || editorOpen || pointerBusy) return;
    const model = buildCalendarModel(snapshot, { view, date, weekStartsOn: snapshot.settings?.weekStartsOn ?? 1, projectId, showPlans, showActual, showDue, now: now() });
    model.projects = snapshot.projects || [];
    model.today = fmtDate(now());
    model.nowMinute = now().getHours() * 60 + now().getMinutes();
    const previousScroll = body.querySelector('.cal-time-scroll');
    const scroll = { top: previousScroll?.scrollTop || 0, left: previousScroll?.scrollLeft || 0 };
    root.querySelector('[data-cal-nav="today"]').textContent = t('today');
    root.querySelector('[data-cal-nav="-1"]').setAttribute('aria-label', t('previous'));
    root.querySelector('[data-cal-nav="1"]').setAttribute('aria-label', t('next'));
    root.querySelector('[data-cal-new]').textContent = '+ ' + t('new');
    root.querySelectorAll('[data-cal-label]').forEach(element => { element.textContent = t(element.dataset.calLabel); });
    root.querySelectorAll('[data-cal-view]').forEach(button => {
      button.textContent = t(button.dataset.calView);
      button.setAttribute('aria-pressed', String(button.dataset.calView === view));
    });
    const rangeText = view === 'month'
      ? new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: 'long' }).format(new Date(date + 'T12:00:00'))
      : view === 'day' ? formatDisplayDate(new Date(date + 'T12:00:00'), getLocale())
        : `${formatDisplayDate(model.range.from, getLocale())} – ${formatDisplayDate(new Date(model.range.dates.at(-1) + 'T12:00:00'), getLocale())}`;
    root.querySelector('[data-cal-range]').textContent = rangeText;
    const projectSelect = root.querySelector('[data-cal-project]');
    projectSelect.setAttribute('aria-label', t('project'));
    projectSelect.innerHTML = `<option value="all">${esc(translate(getLocale(), 'common.all'))}</option><option value="none">${esc(translate(getLocale(), 'project.uncategorized'))}</option>` + (snapshot.projects || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    projectSelect.value = projectId;
    renderCalendarView(body, model, { view, selectedDate: date, locale: getLocale() });
    const scroller = body.querySelector('.cal-time-scroll');
    if (scroller) {
      scroller.scrollTop = needsScroll ? Math.max(0, model.range.dates.includes(fmtDate(now())) ? now().getHours() - 1 : 8) * 64 : scroll.top;
      scroller.scrollLeft = scroll.left;
    }
    needsScroll = false;
  }

  function click(event) {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.calView) { view = target.dataset.calView; needsScroll = true; render(); }
    else if (target.hasAttribute('data-cal-nav')) {
      date = target.dataset.calNav === 'today' ? fmtDate(now()) : navigateCalendarDate(view, date, Number(target.dataset.calNav));
      needsScroll = true; render();
    } else if (target.dataset.calDay) { date = target.dataset.calDay; view = 'day'; needsScroll = true; render(); }
    else if (target.dataset.calEntry) actions.openEntry(target.dataset.calEntry);
    else if (target.dataset.calTask) actions.openTask(target.dataset.calTask);
    else if (target.dataset.calPlan) openPlanEditor({ id: target.dataset.calPlan });
    else if (target.hasAttribute('data-cal-new')) openPlanEditor({ allDay: false });
    else if (target.dataset.calAddDate) openPlanEditor({ date: target.dataset.calAddDate, allDay: true });
  }
  function change(event) {
    if (event.target.hasAttribute('data-cal-project')) projectId = event.target.value;
    else if (event.target.dataset.calFilter) {
      const key = event.target.dataset.calFilter;
      if (key === 'plans') showPlans = event.target.checked;
      if (key === 'actual') showActual = event.target.checked;
      if (key === 'due') showDue = event.target.checked;
    } else return;
    render();
  }
  root.addEventListener('click', click);
  root.addEventListener('change', change);
  const detachPointers = attachCalendarInteractions(root, {
    onOpen(id) { openPlanEditor({ id }); },
    onBusy(value) { pointerBusy = value; if (!value) render(); },
    onCreate({ date: selectedDate, startMinute, endMinute }) {
      const start = new Date(selectedDate + 'T00:00:00'), end = new Date(start);
      start.setMinutes(startMinute); end.setMinutes(endMinute);
      openPlanEditor({ date: selectedDate, allDay: false, startedAt: start.toISOString(), endedAt: end.toISOString() });
    },
    async onChange(change) {
      const plan = snapshot.calendarPlans.find(item => item.id === change.id);
      if (!plan) return;
      await actions.savePlan(calendarPointerChange(plan, change));
      await actions.refresh();
    },
    onError() { error.textContent = t('error.save'); },
  });
  return {
    update(next = getSnapshot()) {
      const signature = JSON.stringify(next);
      snapshot = next;
      editor.update();
      if (signature !== snapshotSignature) { snapshotSignature = signature; render(); }
    },
    setActive(value) {
      active = value;
      clearInterval(ticker);
      if (active) { render(); ticker = setInterval(() => { snapshot = getSnapshot(); render(); }, 60000); }
    },
    destroy() { clearInterval(ticker); detachPointers(); editor.destroy(); root.removeEventListener('click', click); root.removeEventListener('change', change); },
  };
}
