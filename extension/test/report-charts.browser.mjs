// Run with: node --test extension/test/report-charts.browser.mjs
// Requires Playwright (or PLAYWRIGHT_MODULE pointing to an installed copy).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OPTIONS = '/extension/src/options/options.html';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const pad = (value) => String(value).padStart(2, '0');
const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const daysAgo = (days, hour = 9) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
};
const entry = (id, projectId, days, hours) => ({
  id, clientEntryId: id, projectId, taskId: null, description: id, notes: '', tagIds: [],
  startedAt: daysAgo(days).toISOString(),
  endedAt: new Date(daysAgo(days).getTime() + hours * 3600000).toISOString(),
  createdAt: daysAgo(days).toISOString(),
  deletedAt: null,
});
const seed = () => ({
  settings: { language: 'zh-TW', weekStartsOn: 1, notesEditor: 'toolbar', dailyGoalHours: 8, idleThresholdMin: 5, roundToMin: 0 },
  projects: [
    { id: 'a', name: 'Alpha', color: '#427bba', notes: [] },
    { id: 'b', name: 'Beta', color: '#c9503c', notes: [] },
  ],
  tags: [],
  tasks: [{ id: 't', title: 'Task', projectId: 'a', status: 'todo', priority: 'normal', openedAt: daysAgo(20).toISOString(), createdAt: daysAgo(20).toISOString(), sortOrder: 1 }],
  schedules: [],
  calendarPlans: [],
  entries: [
    entry('older-a', 'a', 3, 3),
    entry('older-b', 'b', 3, 2),
    entry('older-none', null, 3, 1),
    entry('long-ago', 'a', 45, 4),
  ],
});

let server;
let base;
let browser;

test.before(async () => {
  server = createServer(async (req, res) => {
    try {
      const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const body = await readFile(path);
      res.setHeader('Content-Type', MIME[extname(path)] || 'application/octet-stream');
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

test.after(async () => {
  await browser.close();
  server.close();
});

async function open(storage, width = 1200, colorScheme = 'light') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
  await context.exposeBinding('__get', (_, key) => {
    if (key == null) return structuredClone(storage);
    const keys = Array.isArray(key) ? key : [key];
    return structuredClone(Object.fromEntries(keys.map((name) => [name, storage[name]])));
  });
  await context.exposeBinding('__set', (_, patch) => { Object.assign(storage, patch); });
  await context.exposeBinding('__remove', (_, key) => { delete storage[key]; });
  await context.addInitScript(() => {
    const event = { addListener() {}, removeListener() {} };
    window.chrome = {
      storage: { local: { get: (key) => window.__get(key), set: (patch) => window.__set(patch), remove: (key) => window.__remove(key) }, onChanged: event },
      i18n: { getUILanguage: () => 'zh-TW' },
      runtime: { getManifest: () => ({ version: '0.0.0' }), openOptionsPage() {}, sendMessage: async () => ({}), onMessage: event, getURL: (path) => path },
      alarms: { create() {}, clear: async () => {}, onAlarm: event },
      tabs: { create() {}, query: async () => [] },
      action: { setBadgeText() {} },
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + OPTIONS);
  await page.waitForFunction(() => document.getElementById('initialLoading')?.hidden);
  return { context, page, errors };
}

const pickRange = async (page, name) => {
  await page.locator(`#range [data-range="${name}"]`).click();
  await page.locator(`#range [data-range="${name}"].active`).waitFor();
};

test('today: review lists only today and the chart says which days it covers', async () => {
  const { context, page, errors } = await open(seed());
  await pickRange(page, 'today');
  const days = await page.locator('#dailyReview .daily-review-day').count();
  assert.equal(days, 1, 'neighbouring days have no data in this range and must not read as empty');
  assert.match(await page.locator('.project-trend-toolbar').first().textContent(), /最近 6 天/);
  assert.match(await page.locator('#projectTrendTooltip').textContent(), /這 6 天總計 6h/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a one-day range draws visible bars, a goal line and a complete legend', async () => {
  const { context, page, errors } = await open(seed());
  await page.locator('#range [data-range="custom"]').click();
  const day = dayKey(daysAgo(3));
  await page.locator('#reportRangeFrom').fill(day);
  await page.locator('#reportRangeTo').fill(day);
  await page.locator('#reportApplyRange').click();
  await page.waitForFunction(() => document.getElementById('kTime').textContent.includes('6h'));

  const widths = await page.locator('.project-trend-svg .trend-segment').evaluateAll((bars) => bars.map((bar) => bar.getBoundingClientRect().width));
  assert.equal(widths.length, 3);
  assert.ok(widths.every((width) => width > 10), `bars should be visible: ${widths}`);
  assert.equal(await page.locator('.project-trend-svg .trend-goal-line').count(), 1);
  assert.match(await page.locator('.project-trend-svg').textContent(), /目標 8h/);

  const legend = await page.locator('.trend-legend').textContent();
  assert.match(legend, /未分類/, 'every colour on the chart needs a legend entry');
  assert.equal(await page.locator('.trend-legend button').count(), 2, 'only real projects can be focused');
  assert.deepEqual(errors, []);
  await context.close();
});

test('all time: the share matches the KPI while the chart is labelled as the last 30 days', async () => {
  const { context, page, errors } = await open(seed());
  await pickRange(page, 'all');
  assert.match(await page.locator('#kTime').textContent(), /10h/);
  const share = await page.locator('.report-share').textContent();
  assert.match(share, /Alpha[\s\S]*7h[\s\S]*70%/);
  assert.match(share, /全部/);
  assert.match(await page.locator('.project-trend-toolbar').first().textContent(), /最近 30 天/);
  assert.equal(await page.locator('.report-share-row.is-static').count(), 1);

  await page.locator('.report-share-row[data-trend-project="a"]').click();
  await page.locator('#projectTrendDetail').waitFor();
  assert.equal(await page.locator('.report-share-row[data-trend-project="a"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
  await context.close();
});

test('workspace status keeps its text on one line above the full-width progress bar', async () => {
  const { context, page, errors } = await open(seed());
  await page.locator('[data-collapse="rep-insights"]').click();
  const box = await page.locator('.report-status').evaluate((status) => {
    const rect = (selector) => status.querySelector(selector).getBoundingClientRect();
    return {
      statusWidth: status.getBoundingClientRect().width,
      barWidth: rect('.report-status-bar').width,
      barTop: rect('.report-status-bar').top,
      overviewBottom: rect('.report-status-overview').bottom,
      labelHeight: rect('.report-status-label').height,
      labelWidth: rect('.report-status-label').width,
    };
  });
  assert.ok(box.labelWidth > box.labelHeight, `status label should not wrap into a vertical column: ${JSON.stringify(box)}`);
  assert.ok(box.barTop >= box.overviewBottom, 'the bar should sit below the status text');
  assert.ok(box.barWidth > box.statusWidth * 0.8, 'the bar should span the panel');
  assert.deepEqual(errors, []);
  await context.close();
});

for (const colorScheme of ['light', 'dark']) test(`Todo progress shows done, in progress and not started as separate steps (${colorScheme})`, async () => {
  const storage = seed();
  const task = (id, status) => ({ id, title: id, projectId: 'a', status, priority: 'normal', openedAt: daysAgo(20).toISOString(), createdAt: daysAgo(20).toISOString(), sortOrder: 1 });
  storage.tasks = [task('d1', 'done'), task('p1', 'doing'), task('p2', 'doing'), task('t1', 'todo'), task('t2', 'todo'), task('t3', 'todo')];
  const { context, page, errors } = await open(storage, 1200, colorScheme);
  await page.locator('[data-collapse="rep-insights"]').click();
  const segments = await page.locator('.report-status-bar > span').evaluateAll((items) => items.map((item) => ({
    name: item.className,
    width: item.getBoundingClientRect().width,
    color: getComputedStyle(item).backgroundColor,
  })));
  const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.deepEqual(segments.map((segment) => segment.name), ['report-status-bar-done', 'report-status-bar-doing', 'report-status-bar-todo']);
  assert.ok(segments[0].width < segments[1].width && segments[1].width < segments[2].width, JSON.stringify(segments));
  const [done, doing, todo] = segments.map((segment) => luminance(toRgb(segment.color)));
  const page_ = luminance(toRgb(canvas));
  const distance = (value) => Math.abs(value - page_);
  assert.ok(distance(done) > distance(doing) && distance(doing) > distance(todo), `steps should fade from done to not started: ${JSON.stringify(segments)}`);
  assert.ok(contrast(toRgb(segments[1].color), toRgb(segments[2].color)) >= 1.3, `in progress and not started should be distinct: ${JSON.stringify(segments)}`);
  assert.ok(contrast(toRgb(segments[2].color), toRgb(canvas)) >= 1.05, `not started should remain visible: ${segments[2].color} on ${canvas}`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('work without a Todo or notes is not reported as a problem', async () => {
  const storage = seed();
  storage.tasks = [];
  storage.entries = [entry('quick-look', 'a', 3, 1)];
  const { context, page, errors } = await open(storage);
  await pickRange(page, 'all');
  await page.locator('[data-collapse="rep-insights"]').click();
  const insights = await page.locator('#reportInsights').textContent();
  assert.doesNotMatch(insights, /未綁定|未填寫/);
  assert.equal(await page.locator('.report-status-label.report-status-success').count(), 1, 'nothing here needs attention');
  assert.equal(await page.locator('.report-attention').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('collapsed section headings line up with an even rhythm', async () => {
  const { context, page, errors } = await open(seed());
  await page.locator('[data-collapse="rep-trend"]').click();
  await page.locator('[data-collapse="rep-review"]').click();
  await page.locator('#byProject').waitFor({ state: 'hidden' });
  const rows = await page.locator('#p-report h2.sec').evaluateAll((headings) => headings.map((heading) => {
    const mark = heading.querySelector('.mark');
    const style = getComputedStyle(mark);
    return {
      top: heading.getBoundingClientRect().top,
      height: heading.getBoundingClientRect().height,
      markLeft: mark.getBoundingClientRect().left,
      titleLeft: mark.nextElementSibling.getBoundingClientRect().left,
      markColor: style.color,
      markWeight: style.fontWeight,
    };
  }));
  assert.equal(rows.length, 3);
  const same = (key) => assert.equal(new Set(rows.map((row) => row[key])).size, 1, `${key}: ${JSON.stringify(rows)}`);
  ['height', 'markLeft', 'titleLeft', 'markColor', 'markWeight'].forEach(same);
  const firstGap = rows[1].top - rows[0].top;
  const secondGap = rows[2].top - rows[1].top;
  assert.ok(Math.abs(firstGap - secondGap) <= 1, `headings should be evenly spaced: ${firstGap} vs ${secondGap}`);
  assert.deepEqual(errors, []);
  await context.close();
});

const CHANNELS = /^(?:rgba?\(|color\(srgb )([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/;
const toRgb = (color, isUnit = color.startsWith('color(')) => {
  const match = color.match(CHANNELS);
  assert.ok(match, `unparsed colour: ${color}`);
  return match.slice(1, 4).map((value) => Number(value) * (isUnit ? 255 : 1));
};
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (left, right) => {
  const [dark, light] = [luminance(left), luminance(right)].sort((a, b) => a - b);
  return (light + 0.05) / (dark + 0.05);
};

for (const colorScheme of ['light', 'dark']) test(`KPI changes stay readable and only overdue work is red (${colorScheme})`, async () => {
  const storage = seed();
  storage.entries.push(entry('previous-day', 'a', 4, 2), entry('two-days-before', 'a', 5, 8));
  const { context, page, errors } = await open(storage, 1200, colorScheme);
  const pickDay = async (days, total) => {
    await page.locator('#range [data-range="custom"]').click();
    const day = dayKey(daysAgo(days));
    await page.locator('#reportRangeFrom').fill(day);
    await page.locator('#reportRangeTo').fill(day);
    await page.locator('#reportApplyRange').click();
    await page.waitForFunction((expected) => document.getElementById('kTime').textContent.includes(expected), total);
  };
  const colours = (selector) => page.locator(selector).evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--danger)';
    document.body.append(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    return { text: getComputedStyle(element).color, danger, canvas: getComputedStyle(document.body).backgroundColor };
  });
  const expectReadable = async (selector) => {
    const { text, danger, canvas } = await colours(selector);
    assert.notEqual(text, danger, 'a change is not a warning');
    const ratio = contrast(toRgb(text), toRgb(canvas));
    assert.ok(ratio >= 4.5, `${selector} contrast ${ratio.toFixed(2)} on ${canvas}`);
    return text;
  };

  await pickDay(3, '6h');
  assert.match(await page.locator('#kTimeDelta').textContent(), /▲ 200%/);
  const up = await expectReadable('#kTimeDelta .kpi-delta-up');

  await page.locator('#range [data-range="back"]').click({ timeout: 2000 }).catch(() => {});
  await pickDay(4, '2h');
  assert.match(await page.locator('#kTimeDelta').textContent(), /▼ 75%/);
  assert.notEqual(await expectReadable('#kTimeDelta .kpi-delta-down'), up, 'up and down should look different');
  assert.equal(await page.locator('#kDaysDelta span').count(), 0, 'an unchanged value stays neutral');
  assert.deepEqual(errors, []);
  await context.close();
});

test('chart text keeps its size in a narrow window and redraws when resized', async () => {
  const { context, page, errors } = await open(seed(), 640);
  await pickRange(page, 'week');
  const fontSize = () => page.locator('.project-trend-svg .axis-label').first().evaluate((label) => {
    const svg = label.ownerSVGElement;
    return parseFloat(getComputedStyle(label).fontSize) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  });
  assert.equal(Math.round(await fontSize()), 11);
  const fits = () => page.locator('.project-trend-svg').evaluate((svg) => svg.getBoundingClientRect().width <= svg.parentElement.clientWidth + 1);
  assert.equal(await fits(), true);

  const narrow = await page.locator('.project-trend-svg').evaluate((svg) => svg.viewBox.baseVal.width);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForFunction((width) => document.querySelector('.project-trend-svg').viewBox.baseVal.width > width, narrow);
  assert.equal(Math.round(await fontSize()), 11);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await context.close();
});
