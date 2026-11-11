/**
 * charts.js — 純 SVG 圖表，回傳字串直接塞 innerHTML。
 * 沒有任何相依套件。視覺遵守 DESIGN.md：零陰影、hairline 格線、圓角 0。
 */

import { formatDuration, translate } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function trendEmpty(locale = 'zh-TW') {
  return `<div class="empty">${translate(locale, 'chart.empty')}</div>`;
}

function trendY(seconds, maxSeconds, top, height) {
  return top + (1 - (maxSeconds ? seconds / maxSeconds : 0)) * height;
}

/** 每日工時折線圖：保留日期順序，適合快速看出工作量的起伏。 */
export function lineSVG(data, locale = 'zh-TW') {
  if (!data?.dates?.length || !data.values?.length) return trendEmpty(locale);

  const dates = data.dates;
  const values = dates.map((_, index) => Math.max(0, Number(data.values[index]) || 0));
  const W = 760, H = 260, PL = 48, PR = 18, PT = 20, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const maxSeconds = Math.max(3600, Math.ceil(Math.max(...values, 0) / 3600) * 3600);
  const x = (index) => dates.length === 1
    ? PL + iw / 2
    : PL + (index * iw) / (dates.length - 1);
  const y = (seconds) => trendY(seconds, maxSeconds, PT, ih);
  const gridStep = Math.max(1, Math.ceil((maxSeconds / 3600) / 4));
  let grid = '';
  for (let h = 0; h <= maxSeconds / 3600; h += gridStep) {
    const value = h * 3600;
    grid += `<line x1="${PL}" x2="${W - PR}" y1="${y(value)}" y2="${y(value)}" stroke="var(--hairline)" stroke-width="1"></line>
      <text x="${PL - 8}" y="${y(value) + 4}" text-anchor="end" class="axis-label">${h}h</text>`;
  }

  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const labels = dates.map((date, index) =>
    (index % Math.max(1, Math.ceil(dates.length / 8)) === 0 || index === dates.length - 1)
      ? `<text x="${x(index)}" y="${H - 10}" text-anchor="middle" class="axis-label">${esc(String(date).slice(5))}</text>`
      : '').join('');
  const zones = dates.map((date, index) => {
    const step = dates.length > 1 ? iw / (dates.length - 1) : iw;
    const left = dates.length === 1 ? PL : Math.max(PL, x(index) - step / 2);
    const width = dates.length === 1 ? iw : index === 0 || index === dates.length - 1 ? step / 2 : step;
    return `<rect data-process-date="${esc(date)}" x="${left}" y="${PT}" width="${width}" height="${ih}" fill="transparent" tabindex="0"><title>${esc(date)} · ${esc(formatDuration(values[index], locale))}</title></rect>`;
  }).join('');
  const circles = values.map((value, index) =>
    `<circle data-process-date="${esc(dates[index])}" cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="4" fill="var(--canvas)" stroke="var(--ink)" stroke-width="2"><title>${esc(dates[index])} · ${esc(formatDuration(value, locale))}</title></circle>`).join('');

  return `<svg class="workspace-process-svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:${Math.min(W, Math.max(420, dates.length * 56))}px" role="img" aria-label="${esc(translate(locale, 'project.process'))}">
    ${grid}<polyline points="${points}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>${circles}${zones}${labels}
  </svg>`;
}

/** 每天一根的堆疊長條：工時是每日獨立的數字，不用斜線連接；單日也畫得出來。 */
export function stackedBarSVG(data, locale = 'zh-TW', { width = 760, goalHours = 0 } = {}) {
  if (!data?.dates?.length || !data.series?.length) return trendEmpty(locale);

  const goalSeconds = Math.max(0, Number(goalHours) || 0) * 3600;
  const W = Math.max(280, Math.round(width)), H = 260, PL = 40, PR = goalSeconds ? 58 : 12, PT = 14, PB = 42;
  const iw = W - PL - PR, ih = H - PT - PB;
  const count = data.dates.length;
  const step = iw / count;
  const barWidth = Math.max(1, Math.min(step * 0.66, 48));
  const maxSeconds = Math.max(3600, Math.ceil(Math.max(...data.dailyTotals, goalSeconds) / 3600) * 3600);
  const y = (seconds) => trendY(seconds, maxSeconds, PT, ih);
  const gridStep = Math.max(1, Math.ceil(maxSeconds / 3600 / 4));
  let grid = '';
  for (let h = 0; h <= maxSeconds / 3600; h += gridStep) {
    const value = h * 3600;
    grid += `<line x1="${PL}" x2="${W - PR}" y1="${y(value)}" y2="${y(value)}" stroke="var(--hairline)" stroke-width="1"></line>
      <text x="${PL - 8}" y="${y(value) + 4}" text-anchor="end" class="axis-label">${h}h</text>`;
  }

  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const days = data.dates.map((date) => new Date(`${date}T00:00:00`));
  const weekends = data.dates.map((date, index) => ([0, 6].includes(days[index].getDay())
    ? `<rect class="trend-weekend" x="${(PL + index * step).toFixed(1)}" y="${PT}" width="${step.toFixed(1)}" height="${ih}"></rect>`
    : '')).join('');

  // 從最新一天往回標，最新的日期一定看得到
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(iw / 52))));
  const labels = data.dates.map((date, index) => {
    if ((count - 1 - index) % labelEvery) return '';
    const center = (PL + (index + 0.5) * step).toFixed(1);
    return `<text x="${center}" y="${H - 22}" text-anchor="middle" class="axis-label">${esc(date.slice(5).replace('-', '/'))}</text>
      <text x="${center}" y="${H - 7}" text-anchor="middle" class="axis-label axis-label-sub">${esc(weekday.format(days[index]))}</text>`;
  }).join('');

  const zones = data.dates.map((date, index) => {
    const details = data.detailsByDate[index] || [];
    const detailText = details.map((item) => `${item.name} ${formatDuration(item.seconds, locale)}`).join(' · ');
    return `<rect class="trend-hover-zone" data-trend-date="${esc(date)}" x="${(PL + index * step).toFixed(1)}" y="${PT}" width="${step.toFixed(1)}" height="${ih}" fill="transparent" tabindex="0"><title>${esc(date)} · ${formatDuration(data.dailyTotals[index], locale)}${detailText ? ` · ${esc(detailText)}` : ''}</title></rect>`;
  }).join('');

  const tops = data.dates.map(() => 0);
  const bars = data.series.map((series) => series.values.map((value, index) => {
    if (!(value > 0)) return '';
    const bottom = tops[index];
    tops[index] = bottom + value;
    const top = y(tops[index]);
    // 少 1px 讓相鄰專案之間留縫，很短的區段仍保留看得見的高度
    const height = Math.max(1, y(bottom) - top - 1);
    return `<rect class="trend-segment" data-project-id="${esc(series.id)}" data-trend-date="${esc(data.dates[index])}" x="${(PL + (index + 0.5) * step - barWidth / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" fill="${esc(series.color)}"></rect>`;
  }).join('')).join('');

  const goal = goalSeconds
    ? `<line class="trend-goal-line" x1="${PL}" x2="${W - PR}" y1="${y(goalSeconds)}" y2="${y(goalSeconds)}"></line>
      <text x="${W - PR + 6}" y="${y(goalSeconds) + 4}" class="axis-label">${esc(translate(locale, 'chart.goal', { hours: Number(goalHours) }))}</text>`
    : '';

  return `<svg class="project-trend-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block" role="img" aria-label="${esc(translate(locale, 'chart.trend'))}">
    ${weekends}${grid}${zones}${bars}${goal}${labels}
  </svg>`;
}
