import { formatDisplayDate, formatDisplayTime, formatDuration, translate } from '../lib/i18n.js';
import { calendarDate, layoutTimedSegments } from '../lib/calendar.js';
import { readableTextColor } from '../lib/color.js';

export const calendarEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const esc = calendarEscape;

export function calendarViewMarkup(model, { view, selectedDate, locale }) {
  const t = (key, vars) => translate(locale, `calendar.${key}`, vars);
  const today = model.today;
  const dateLabel = date => formatDisplayDate(calendarDate(date), locale);
  const weekday = date => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(calendarDate(date));
  const project = segment => (model.projects || []).find(p => p.id === segment.item.projectId);
  const color = segment => /^#[0-9a-f]{6}$/i.test(project(segment)?.color || '') ? project(segment).color : '#74787e';
  const title = segment => segment.item.title || segment.item.description || translate(locale, 'common.unnamedWork');
  const action = segment => `data-cal-${segment.kind === 'plan' ? 'plan' : segment.kind === 'due' ? 'task' : 'entry'}="${esc(segment.id)}"`;
  const time = segment => segment.item.allDay ? t('allDay') : segment.kind === 'due' ? (segment.item.dueTime || '')
    : `${formatDisplayTime(segment.from, locale)}–${segment.endMinute === 1440 ? '24:00' : formatDisplayTime(segment.to, locale)}`;
  const kind = segment => t(segment.kind === 'plan' ? 'planned' : segment.kind === 'due' ? 'due' : 'actual');
  // 0 的時數不顯示，空白的日子就不會整片都是「0 小時 00 分」
  const summary = day => `${day.plannedSeconds ? `<span>${esc(t('planned'))} <b>${esc(formatDuration(day.plannedSeconds, locale))}</b></span>` : ''}${day.actualSeconds ? `<span>${esc(t('actual'))} <b>${esc(formatDuration(day.actualSeconds, locale))}</b></span>` : ''}${day.allDayCount ? `<span>${esc(t('allDayCount', { count: day.allDayCount }))}</span>` : ''}`;
  const entry = (segment, css = '', style = '') => {
    const movable = segment.kind === 'plan' && !segment.item.allDay && !segment.continuesBefore && !segment.continuesAfter
      && new Date(segment.item.startedAt).toDateString() === new Date(new Date(segment.item.endedAt).getTime() - 1).toDateString();
    return `<button type="button" class="cal-event cal-${segment.kind} ${css}${segment.item.running ? ' cal-running' : ''}${segment.continuesBefore ? ' cal-cont-before' : ''}${segment.continuesAfter ? ' cal-cont-after' : ''}" ${action(segment)} data-cal-date="${esc(segment.date)}"${movable ? ' data-cal-movable' : ''} style="--cal-color:${color(segment)};--cal-on:${readableTextColor(color(segment))};${style}" title="${esc(`${kind(segment)} · ${title(segment)} · ${time(segment)}${segment.conflict ? ' · ' + t('conflict') : ''}`)}">
      ${movable && css.includes('cal-timed') ? '<span class="cal-resize cal-resize-start" data-cal-resize="resize-start"></span>' : ''}
      <span class="cal-event-title">${esc(title(segment))}</span><span class="cal-event-time">${esc(time(segment))}${segment.item.running ? ' · ' + esc(t('running')) : ''}</span>
      ${segment.conflict ? `<span class="cal-conflict">${esc(t('conflict'))}</span>` : ''}
      ${movable && css.includes('cal-timed') ? '<span class="cal-resize cal-resize-end" data-cal-resize="resize-end"></span>' : ''}
    </button>`;
  };
  if (view === 'month') {
    return `<div class="cal-month"><div class="cal-weekdays">${model.days.slice(0, 7).map(d => `<div>${esc(weekday(d.date))}</div>`).join('')}</div>${model.monthWeeks.map((week, index) => {
      const days = model.days.slice(index * 7, index * 7 + 7);
      const visible = week.bars.filter(bar => bar.row < 3);
      return `<div class="cal-month-week"><div class="cal-month-cells">${days.map((day, col) => {
        const count = day.plans.length + day.actual.length + day.due.length;
        const shown = visible.filter(bar => bar.startColumn <= col && col < bar.startColumn + bar.span).length;
        return `<div class="cal-month-cell${day.date === today ? ' cal-today' : ''}${day.date.slice(0, 7) !== selectedDate.slice(0, 7) ? ' cal-outside' : ''}" data-cal-drop-date="${day.date}">
          <div class="cal-month-date"><button type="button" data-cal-day="${day.date}">${Number(day.date.slice(8))}</button><button type="button" data-cal-add-date="${day.date}" aria-label="${esc(t('new'))} ${day.date}">+</button></div>
          <div class="cal-month-foot">${count > shown ? `<button type="button" class="cal-more" data-cal-day="${day.date}">${esc(t('more', { count: count - shown }))}</button>` : ''}<div class="cal-summary">${summary(day)}</div></div>
        </div>`;
      }).join('')}</div><div class="cal-month-bars">${visible.map(bar => entry(bar, 'cal-month-bar', `grid-column:${bar.startColumn + 1}/span ${bar.span};grid-row:${bar.row + 1};`)).join('')}</div></div>`;
    }).join('')}</div>`;
  }
  if (view === 'agenda') return `<div class="cal-agenda">${model.days.map(day => `<div class="cal-agenda-day${day.date === today ? ' cal-today' : ''}"><div class="cal-agenda-heading"><button type="button" data-cal-day="${day.date}">${esc(dateLabel(day.date))} ${esc(weekday(day.date))}</button><button type="button" data-cal-add-date="${day.date}">+ ${esc(t('new'))}</button></div><div class="cal-summary">${summary(day)}</div><div class="cal-agenda-items">${[...day.plans, ...day.actual, ...day.due].sort((a, b) => Number(!a.item.allDay) - Number(!b.item.allDay) || (a.from || 0) - (b.from || 0)).map(segment => `<div class="cal-agenda-row"><span class="cal-kind">${esc(kind(segment))}</span>${entry(segment, 'cal-agenda-event')}</div>`).join('') || `<p class="cal-empty">${esc(t('empty'))}</p>`}</div></div>`).join('')}</div>`;
  return `<div class="cal-time-scroll" tabindex="0" aria-label="${esc(t(view))}"><div class="cal-time-grid" style="--cal-days:${model.days.length}"><div class="cal-axis-head"></div>${model.days.map(day => `<div class="cal-day-head${day.date === today ? ' cal-today' : ''}"><button type="button" data-cal-day="${day.date}">${esc(weekday(day.date))} <strong>${esc(day.date.slice(5).replace('-', '/'))}</strong></button><div class="cal-summary">${summary(day)}</div><div class="cal-column-labels"><span>${esc(t('planned'))}</span><span>${esc(t('actual'))}</span></div><div class="cal-all-day">${[...day.plans.filter(s => s.item.allDay), ...day.due.filter(s => !s.item.dueTime)].map(segment => entry(segment, 'cal-small-event')).join('')}</div></div>`).join('')}
    <div class="cal-time-axis">${Array.from({ length: 25 }, (_, hour) => `<span style="top:${hour * 64}px${model.days.some(day => day.date === today) && model.nowMinute - hour * 60 > -10 && model.nowMinute - hour * 60 < 24 ? ';visibility:hidden' : ''}">${String(hour).padStart(2, '0')}:00</span>`).join('')}${model.days.some(day => day.date === today) ? `<span class="cal-now-label" style="top:${model.nowMinute / 60 * 64}px">${String(Math.floor(model.nowMinute / 60)).padStart(2, '0')}:${String(Math.floor(model.nowMinute % 60)).padStart(2, '0')}</span>` : ''}</div>${model.days.map(day => `<div class="cal-time-day" data-cal-date="${day.date}"><div class="cal-plan-column" data-cal-slot="${day.date}"></div><div class="cal-actual-column"></div>${[...layoutTimedSegments(day.plans.filter(s => !s.item.allDay)), ...layoutTimedSegments(day.actual)].map(({ segment, top, height }) => entry(segment, `cal-timed${height < 38 ? ' cal-compact' : ''}${segment.lanes > 1 ? ' cal-stacked' : ''}`, `top:${top}px;height:${height}px;--cal-offset:calc(${segment.lane} * min(14px, ${30 / segment.lanes}%));left:calc(${segment.kind === 'actual' ? 50 : 0}% + var(--cal-offset) + 2px);width:calc(50% - var(--cal-offset) - 4px);z-index:${2 + segment.lane};`)).join('')}${day.due.filter(s => s.item.dueTime).map(segment => `<div class="cal-deadline" style="top:${(Number(segment.item.dueTime.slice(0, 2)) * 60 + Number(segment.item.dueTime.slice(3))) / 60 * 64}px"><button type="button" ${action(segment)}>${esc(t('due'))} · ${esc(title(segment))} ${esc(segment.item.dueTime)}</button></div>`).join('')}${day.date === today ? `<div class="cal-now" style="top:${model.nowMinute / 60 * 64}px"><span></span></div>` : ''}</div>`).join('')}</div></div>`;
}

export function renderCalendarView(root, model, options) {
  root.innerHTML = calendarViewMarkup(model, options);
}
