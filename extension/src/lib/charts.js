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

export function donutSVG(segments, locale = 'zh-TW', { centerValue = '', centerLabel = '', selectedStatus = '' } = {}) {
  const visible = (segments || []).filter((segment) => Number(segment?.value) > 0);
  const total = visible.reduce((sum, segment) => sum + Number(segment.value), 0);
  const W = 180, H = 180, cx = 90, cy = 90, radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const rings = visible.map((segment) => {
    const value = Number(segment.value);
    const length = circumference * value / total;
    const status = segment.id || segment.status || '';
    const classes = ['todo-health-donut-segment'];
    if (selectedStatus && status && selectedStatus !== status) classes.push('is-dimmed');
    if (selectedStatus && selectedStatus === status) classes.push('is-selected');
    const controls = status
      ? ` data-todo-health-status="${esc(status)}" tabindex="0" role="button" aria-pressed="${String(selectedStatus === status)}"`
      : '';
    const ring = `<circle class="todo-health-donut-segment" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${esc(segment.color || '#9a9898')}" stroke-width="20" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(segment.label)} · ${value}</title></circle>`;
    offset += length;
    return ring.replace('class="todo-health-donut-segment"', `class="${classes.join(' ')}"${controls}`);
  }).join('');
  const value = centerValue || (total ? String(total) : '0');
  const label = centerLabel || translate(locale, 'report.todoTotal');
  return `<svg class="todo-health-donut-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--surface-card)" stroke-width="20"></circle>
    ${rings}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="todo-health-donut-value">${esc(value)}</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" class="todo-health-donut-label">${esc(label)}</text>
  </svg>`;
}

export function stackedAreaSVG(data, locale = 'zh-TW') {
  if (!data?.dates?.length || !data.series?.length) return trendEmpty(locale);

  const W = 760, H = 260, PL = 48, PR = 18, PT = 20, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const maxSeconds = Math.max(3600, Math.ceil(Math.max(...data.dailyTotals, 0) / 3600) * 3600);
  const x = (index) => PL + (index * iw) / Math.max(1, data.dates.length - 1);
  const y = (seconds) => trendY(seconds, maxSeconds, PT, ih);
  const xStep = data.dates.length > 1 ? iw / (data.dates.length - 1) : iw;
  const zoneWidth = data.dates.length > 1 ? Math.max(18, xStep) : iw;
  const gridStep = Math.max(1, Math.ceil(maxSeconds / 3600 / 4));
  let grid = '';
  for (let h = 0; h <= maxSeconds / 3600; h += gridStep) {
    const value = h * 3600;
    grid += `<line x1="${PL}" x2="${W - PR}" y1="${y(value)}" y2="${y(value)}" stroke="var(--hairline)" stroke-width="1"></line>
      <text x="${PL - 8}" y="${y(value) + 4}" text-anchor="end" class="axis-label">${h}h</text>`;
  }

  const tops = data.dates.map(() => 0);
  const areas = data.series.map((series) => {
    const bottom = [...tops];
    const top = series.values.map((value, index) => bottom[index] + value);
    top.forEach((value, index) => { tops[index] = value; });
    const points = top.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`)
      .concat(bottom.map((value, index) => {
        const reverseIndex = data.dates.length - 1 - index;
        return `${x(reverseIndex).toFixed(1)},${y(bottom[reverseIndex]).toFixed(1)}`;
      }))
      .join(' ');
    return `<polygon class="trend-segment" data-project-id="${esc(series.id)}" points="${points}" fill="${esc(series.color)}" fill-opacity="0.72"></polygon>`;
  }).join('');

  const labels = data.dates.map((date, index) =>
    (index % Math.max(1, Math.ceil(data.dates.length / 8)) === 0 || index === data.dates.length - 1)
      ? `<text x="${x(index)}" y="${H - 10}" text-anchor="middle" class="axis-label">${esc(date.slice(5))}</text>`
      : '').join('');
  const zones = data.dates.map((date, index) => {
    const left = index === 0 ? PL : x(index) - zoneWidth / 2;
    const width = data.dates.length === 1
      ? zoneWidth
      : index === 0 || index === data.dates.length - 1 ? zoneWidth / 2 : zoneWidth;
    const details = data.detailsByDate[index] || [];
    const detailText = details.map((item) => `${item.name} ${formatDuration(item.seconds, locale)}`).join(' · ');
    return `<rect class="trend-hover-zone" data-trend-date="${esc(date)}" x="${left}" y="${PT}" width="${width}" height="${ih}" fill="transparent" tabindex="0"><title>${esc(date)} · ${formatDuration(data.dailyTotals[index], locale)}${detailText ? ` · ${esc(detailText)}` : ''}</title></rect>`;
  }).join('');

  return `<svg class="project-trend-svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block" role="img" aria-label="${esc(translate(locale, 'chart.trend'))}">
    ${grid}${areas}${zones}${labels}
  </svg>`;
}
