import { addCalendarDays, calendarDate, CalendarValidationError } from '../lib/calendar.js';
import { toLocalInput } from '../lib/time.js';
import { translate, formatDisplayTime, formatDuration } from '../lib/i18n.js';
import { calendarEscape as esc } from './calendar-view.js';

export function createCalendarEditor({ root, getSnapshot, getLocale, actions, editors, onClose }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'cal-dialog';
  dialog.dataset.calDialog = '';
  root.append(dialog);
  let original = null, busy = false, missing = false, notesElement = null;
  const t = (key, variables) => translate(getLocale(), `calendar.${key}`, variables);
  const field = name => dialog.querySelector(`[name="${name}"]`);
  function close() { dialog.close(); }
  function disposed() {
    if (notesElement) editors.destroy(notesElement);
    notesElement = null;
    onClose();
  }
  dialog.addEventListener('close', disposed);
  function setKind() {
    const allDay = field('allDay').checked;
    dialog.querySelector('[data-cal-date-fields]').hidden = !allDay;
    dialog.querySelector('[data-cal-time-fields]').hidden = allDay;
  }
  function inputValue(value, previous) {
    if (previous && value === toLocalInput(previous)) return previous;
    const parsed = new Date(value);
    if (!Number.isFinite(+parsed) || toLocalInput(parsed.toISOString()) !== value) throw new CalendarValidationError('date', 'startedAt');
    return parsed.toISOString();
  }
  function readDraft() {
    const base = { id: original?.id, title: field('title').value, projectId: field('projectId').value || null, taskId: field('taskId').value || null, notes: field('notes').value, allDay: field('allDay').checked };
    return base.allDay ? { ...base, startDate: field('startDate').value, endDate: addCalendarDays(field('endDate').value, 1) }
      : { ...base, startedAt: inputValue(field('startedAt').value, original?.startedAt), endedAt: inputValue(field('endedAt').value, original?.endedAt) };
  }
  function message(error) {
    dialog.querySelector('[data-cal-form-error]').textContent = error instanceof CalendarValidationError ? t(`error.${error.code}`) : t('error.save');
  }
  function setBusy(value) {
    busy = value;
    dialog.querySelectorAll('[data-cal-save],[data-cal-start],[data-cal-delete]').forEach(button => { button.disabled = value || missing; });
  }
  async function save(start = false) {
    if (busy) return;
    try {
      setBusy(true);
      if (original?.id && !getSnapshot().calendarPlans.some(p => p.id === original.id)) { update(); return; }
      const saved = await actions.savePlan(readDraft());
      close();
      await actions.refresh();
      if (start) await actions.startPlan(saved.id);
    } catch (error) { message(error); }
    finally { setBusy(false); }
  }
  function update() {
    if (!dialog.open || !original?.id) return;
    if (!getSnapshot().calendarPlans.some(plan => plan.id === original.id)) {
      dialog.querySelector('[data-cal-form-error]').textContent = t('deleted');
      missing = true;
      setBusy(false);
    }
  }
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('submit', event => { event.preventDefault(); save(); });
  dialog.addEventListener('change', event => {
    if (event.target.name === 'allDay') setKind();
    if (event.target.name === 'taskId') {
      const task = getSnapshot().tasks.find(item => item.id === field('taskId').value);
      if (task) { field('projectId').value = task.projectId || ''; field('title').value = task.title; }
    }
    if (event.target.name === 'projectId') {
      const task = getSnapshot().tasks.find(item => item.id === field('taskId').value);
      if (task && (task.projectId || '') !== field('projectId').value) {
        field('taskId').value = '';
        dialog.querySelector('[data-cal-form-notice]').textContent = t('taskCleared');
      }
    }
  });
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-cal-cancel') && !busy) close();
    if (button.hasAttribute('data-cal-start')) {
      if (original?.id && getSnapshot().timer?.planId === original.id) { close(); actions.startPlan(original.id); }
      else save(true);
    }
    if (button.hasAttribute('data-cal-delete') && !busy && confirm(t('deleteConfirm'))) {
      try { setBusy(true); await actions.deletePlan(original.id); close(); await actions.refresh(); }
      catch (error) { message(error); }
      finally { setBusy(false); }
    }
    if (button.dataset.calLinkedEntry) { close(); actions.openEntry(button.dataset.calLinkedEntry); }
  });

  function open({ id, date, startedAt, endedAt, allDay = false }) {
    const snap = getSnapshot();
    original = id ? snap.calendarPlans.find(plan => plan.id === id) : null;
    if (id && !original) return false;
    const start = startedAt || new Date(date + 'T09:00:00').toISOString();
    const end = endedAt || new Date(new Date(start).getTime() + 30 * 60000).toISOString();
    const current = original || { title: '', projectId: null, taskId: null, allDay, startDate: date, endDate: addCalendarDays(date, 1), startedAt: start, endedAt: end, notes: '' };
    const localStart = current.allDay ? toLocalInput(start) : toLocalInput(current.startedAt);
    const localEnd = current.allDay ? toLocalInput(end) : toLocalInput(current.endedAt);
    const tasks = snap.tasks.filter(task => task.status !== 'archived' || task.id === current.taskId);
    const projects = snap.projects.filter(project => !project.archivedAt || project.id === current.projectId || tasks.some(task => task.id === current.taskId && task.projectId === project.id));
    const linked = (snap.entries || []).filter(entry => entry.planId === id && !entry.deletedAt && entry.endedAt);
    const total = linked.reduce((seconds, entry) => seconds + Math.max(0, (new Date(entry.endedAt) - new Date(entry.startedAt)) / 1000), 0);
    dialog.innerHTML = `<form novalidate><h2>${esc(t(id ? 'edit' : 'new'))}</h2><label class="field">${esc(t('title'))}<input name="title" value="${esc(current.title)}" required autocomplete="off"></label><div class="cal-form-grid"><label class="field">${esc(t('project'))}<select name="projectId"><option value="">${esc(translate(getLocale(), 'project.uncategorized'))}</option>${projects.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label class="field">${esc(t('task'))}<select name="taskId"><option value="">${esc(t('noTask'))}</option>${tasks.map(task => `<option value="${esc(task.id)}">${esc(task.title)}${task.status === 'done' ? ' · ' + esc(translate(getLocale(), 'todo.status.done')) : ''}</option>`).join('')}</select></label></div>
      <label class="cal-all-day-toggle"><input type="checkbox" name="allDay"${current.allDay ? ' checked' : ''}>${esc(t('allDay'))}</label>
      <div class="cal-form-grid" data-cal-time-fields><label class="field">${esc(t('start'))}<input type="datetime-local" name="startedAt" value="${esc(localStart)}"></label><label class="field">${esc(t('end'))}<input type="datetime-local" name="endedAt" value="${esc(localEnd)}"></label></div>
      <div class="cal-form-grid" data-cal-date-fields><label class="field">${esc(t('start'))}<input type="date" name="startDate" value="${esc(current.startDate || localStart.slice(0, 10))}"></label><label class="field">${esc(t('through'))}<input type="date" name="endDate" value="${esc(current.endDate ? addCalendarDays(current.endDate, -1) : localEnd.slice(0, 10))}"></label></div>
      <label class="field">${esc(t('notes'))}<textarea name="notes"></textarea></label><p class="cap" data-cal-form-notice></p><p class="cal-error" data-cal-form-error role="alert"></p>
      ${id ? `<div class="cal-linked"><h3>${esc(t('linkedWork'))} · ${esc(formatDuration(total, getLocale()))}</h3>${linked.map(entry => `<button type="button" data-cal-linked-entry="${esc(entry.id)}">${esc(entry.description || current.title)} · ${esc(formatDisplayTime(entry.startedAt, getLocale()))}–${esc(formatDisplayTime(entry.endedAt, getLocale()))}</button>`).join('') || `<p class="cap">${esc(t('noLinkedWork'))}</p>`}</div>` : ''}
      <div class="cal-dialog-actions">${id ? `<button type="button" class="cal-delete" data-cal-delete>${esc(t('delete'))}</button>` : ''}<span></span><button type="button" data-cal-cancel>${esc(t('cancel'))}</button><button type="button" data-cal-start>${esc(t(snap.timer?.planId === id && id ? 'goTimer' : 'startTimer'))}</button><button type="submit" class="btn-primary" data-cal-save>${esc(t('save'))}</button></div></form>`;
    field('projectId').value = current.projectId || '';
    field('taskId').value = current.taskId || '';
    notesElement = field('notes');
    notesElement.value = current.notes || '';
    busy = false;
    missing = false;
    setKind();
    dialog.showModal();
    editors.mount(notesElement);
    field('title').focus();
    return true;
  }
  return { open, update, destroy() { if (notesElement) editors.destroy(notesElement); dialog.remove(); } };
}
