// Run with: node --test extension/test/popup-options-ux.browser.mjs
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
const POPUP = '/extension/src/popup/popup.html';
const OPTIONS = '/extension/src/options/options.html';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
// datetime-local takes browser-local time; the browser context uses the system time zone like Node.
const localInput = (iso) => {
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const seed = () => ({
  settings: { language: 'zh-TW', weekStartsOn: 1, notesEditor: 'toolbar', dailyGoalHours: 8, idleThresholdMin: 5, roundToMin: 0 },
  projects: [{ id: 'web', name: 'Web', color: '#427bba', notes: [] }],
  tags: [],
  tasks: [
    { id: 'parent', title: 'Parent', projectId: 'web', status: 'todo', priority: 'normal', openedAt: ago(600), createdAt: ago(600), sortOrder: 1 },
    { id: 'other', title: 'Other', projectId: 'web', status: 'todo', priority: 'normal', openedAt: ago(500), createdAt: ago(500), sortOrder: 2 },
  ],
  entries: [
    { id: 'e1', clientEntryId: 'e1', projectId: 'web', taskId: null, description: 'First entry', notes: '', tagIds: [], startedAt: ago(5), endedAt: ago(1), createdAt: ago(5), deletedAt: null },
  ],
  schedules: [],
  calendarPlans: [],
});

const running = (extra = {}) => ({
  entryId: 'run', clientEntryId: 'run', projectId: 'web', taskId: null, description: 'Running work',
  notes: '', tagIds: [], startedAt: ago(30), planId: null, idleSince: null, ...extra,
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

async function open(url, storage, viewport = { width: 380, height: 600 }) {
  const context = await browser.newContext({ viewport });
  await context.exposeBinding('__get', (_, key) => {
    if (key == null) return structuredClone(storage);
    const keys = Array.isArray(key) ? key : [key];
    return structuredClone(Object.fromEntries(keys.map((name) => [name, storage[name]])));
  });
  await context.exposeBinding('__set', (_, patch) => { Object.assign(storage, patch); });
  await context.exposeBinding('__remove', (_, key) => { delete storage[key]; });
  await context.addInitScript(() => {
    const listeners = [];
    const event = { addListener() {}, removeListener() {} };
    window.__storageChanged = (keys) => {
      const changes = Object.fromEntries(keys.map((key) => [key, {}]));
      listeners.forEach((listener) => listener(changes, 'local'));
    };
    window.chrome = {
      storage: {
        local: { get: (key) => window.__get(key), set: (patch) => window.__set(patch), remove: (key) => window.__remove(key), clear: async () => {} },
        onChanged: { addListener: (listener) => listeners.push(listener), removeListener() {} },
      },
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
  await page.goto(base + url);
  await page.waitForFunction(() => document.getElementById('initialLoading')?.hidden);
  return { context, page, errors };
}

test('popup: Space on a focused button does that button\'s job, not the timer', async () => {
  const storage = seed();
  const { context, page, errors } = await open(POPUP, storage);
  await page.locator('[data-tab="todo"]').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#tab-todo').isVisible(), true);
  assert.equal(storage.timer, undefined);

  await page.locator('[data-check="other"]').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !document.querySelector('[data-check="other"]'));
  assert.equal(storage.tasks.find((task) => task.id === 'other').status, 'done');
  assert.equal(storage.timer, undefined);
  assert.deepEqual(errors, []);
  await context.close();
});

test('popup: Space with nothing focused still toggles the timer', async () => {
  const storage = seed();
  const { context, page } = await open(POPUP, storage);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('toggle').dataset.state === 'running');
  assert.ok(storage.timer);
  await context.close();
});

test('popup: text written after stopping survives closing the popup', async () => {
  const storage = { ...seed(), timer: running() };
  const { context, page } = await open(POPUP, storage);
  await page.locator('#toggle').click();
  await page.locator('#logText').waitFor();
  await page.locator('#logText').fill('written after stop');
  await page.waitForFunction(() => document.getElementById('logText').value === 'written after stop');

  await page.reload();
  await page.waitForFunction(() => document.getElementById('initialLoading')?.hidden);
  assert.equal(await page.locator('#logBox').isVisible(), true);
  assert.equal(await page.locator('#logText').inputValue(), 'written after stop');

  await page.locator('#logSave').click();
  await page.waitForFunction(() => document.getElementById('logBox').hidden);
  assert.equal(storage.entries.find((entry) => entry.id === 'run').notes, 'written after stop');
  assert.equal(storage.logDraft, undefined);
  await context.close();
});

test('popup: skipping a written log discards the draft', async () => {
  const storage = { ...seed(), timer: running() };
  const { context, page } = await open(POPUP, storage);
  await page.locator('#toggle').click();
  await page.locator('#logText').fill('discard me');
  await page.locator('#logSkip').click();
  await page.waitForFunction(() => document.getElementById('logBox').hidden);
  assert.equal(storage.logDraft, undefined);
  assert.equal(storage.entries.find((entry) => entry.id === 'run').notes, '');
  await context.close();
});

test('popup: logging another entry saves the unfinished draft first', async () => {
  const storage = { ...seed(), timer: running() };
  const { context, page } = await open(POPUP, storage);
  await page.locator('#toggle').click();
  await page.locator('#logText').fill('kept for run');
  await page.locator('#recent .item[data-entry="e1"]').hover();
  await page.locator('[data-log="e1"]').click();
  await page.waitForFunction(() => document.getElementById('logText').value === '');
  assert.equal(storage.entries.find((entry) => entry.id === 'run').notes, 'kept for run');
  assert.equal(storage.logDraft, undefined);
  await context.close();
});

test('popup: deleting a Todo asks first and cancelling keeps it', async () => {
  const storage = seed();
  const { context, page } = await open(POPUP, storage);
  const answers = [false, true];
  let asked = 0;
  page.on('dialog', async (dialog) => {
    asked += 1;
    await (answers.shift() ? dialog.accept() : dialog.dismiss());
  });
  await page.locator('[data-tab="todo"]').click();
  await page.locator('#todoList .item', { hasText: 'Other' }).hover();
  await page.locator('[data-del-task="other"]').click();
  await page.waitForTimeout(100);
  assert.equal(asked, 1);
  assert.ok(storage.tasks.some((task) => task.id === 'other'));

  await page.locator('[data-del-task="other"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-del-task="other"]'));
  assert.equal(asked, 2);
  assert.ok(!storage.tasks.some((task) => task.id === 'other'));
  await context.close();
});

test('popup: closing the advanced panel stops its hidden values applying', async () => {
  const storage = seed();
  const { context, page } = await open(POPUP, storage);
  await page.locator('[data-tab="todo"]').click();
  await page.locator('#todoList .item', { hasText: 'Parent' }).hover();
  await page.locator('[data-add-subtask="parent"]').click();
  await page.locator('#todoDue').fill('2030-01-02');

  await page.locator('#newTodo').fill('Visible child');
  await page.locator('#newTodo').press('Enter');
  await page.waitForFunction(() => document.getElementById('newTodo').value === '');
  const child = storage.tasks.find((task) => task.title === 'Visible child');
  assert.equal(child.parentId, 'parent');
  assert.equal(child.dueDate, '2030-01-02');

  await page.locator('#todoMore').click();
  await page.locator('#newTodo').fill('Plain todo');
  await page.locator('#newTodo').press('Enter');
  await page.waitForFunction(() => document.getElementById('newTodo').value === '');
  const plain = storage.tasks.find((task) => task.title === 'Plain todo');
  assert.equal(plain.parentId, null);
  assert.equal(plain.dueDate, null);
  assert.equal(plain.projectId, null);
  await context.close();
});

test('options: changes made elsewhere reach every list without touching forms', async () => {
  const storage = seed();
  const { context, page, errors } = await open(OPTIONS, storage, { width: 1280, height: 860 });
  await page.locator('[data-tab="todos"]').click();
  await page.locator('#tdTitle').fill('half typed');

  storage.tasks.push({ id: 'new', title: 'From popup', projectId: 'web', status: 'todo', priority: 'normal', openedAt: ago(1), createdAt: ago(1), sortOrder: 9 });
  storage.entries.push({ id: 'e2', clientEntryId: 'e2', projectId: 'web', taskId: null, description: 'Stopped in popup', notes: '', tagIds: [], startedAt: ago(70), endedAt: ago(10), createdAt: ago(70), deletedAt: null });
  await page.evaluate(() => window.__storageChanged(['tasks', 'entries']));

  await page.locator('#todoList', { hasText: 'From popup' }).waitFor();
  assert.equal(await page.locator('#tdTitle').inputValue(), 'half typed');
  await page.locator('[data-tab="entries"]').click();
  await page.locator('#entryList', { hasText: 'Stopped in popup' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('options: refresh waits while a row is being edited', async () => {
  const storage = seed();
  const { context, page } = await open(OPTIONS, storage, { width: 1280, height: 860 });
  await page.locator('[data-tab="todos"]').click();
  // A row-level field stands in for any inline editor inside the list.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'rowEditor';
    document.getElementById('todoList').append(input);
    input.focus();
  });
  storage.tasks.push({ id: 'new', title: 'From popup', projectId: 'web', status: 'todo', priority: 'normal', openedAt: ago(1), createdAt: ago(1), sortOrder: 9 });
  await page.evaluate(() => window.__storageChanged(['tasks']));
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#rowEditor').count(), 1);

  await page.locator('#rowEditor').blur();
  await page.locator('#todoList', { hasText: 'From popup' }).waitFor();
  await context.close();
});

test('options: a deleted entry can be restored from the toast', async () => {
  const storage = seed();
  const { context, page } = await open(OPTIONS, storage, { width: 1280, height: 860 });
  await page.locator('[data-tab="entries"]').click();
  await page.locator('[data-del-e="e1"]').click({ force: true });
  await page.locator('#appToast .app-toast-action').waitFor();
  assert.ok(storage.entries.find((entry) => entry.id === 'e1').deletedAt);
  assert.doesNotMatch(await page.locator('#entryList').textContent(), /First entry/);

  await page.locator('#appToast .app-toast-action').click();
  await page.locator('#entryList', { hasText: 'First entry' }).waitFor();
  assert.equal(storage.entries.find((entry) => entry.id === 'e1').deletedAt, null);
  await context.close();
});

test('popup: the start time of a running timer can be corrected', async () => {
  const storage = { ...seed(), timer: running({ idleSince: ago(10) }) };
  const { context, page } = await open(POPUP, storage);
  const input = page.locator('#timerStart');
  assert.equal(await input.isVisible(), false);
  await page.locator('#toggleDetails').click();

  await input.fill(localInput(ago(5)));
  await input.blur();
  await page.waitForFunction(() => document.getElementById('clock').textContent.startsWith('00:0'));
  assert.ok(Math.abs(Date.now() - new Date(storage.timer.startedAt)) < 6.5 * 60000);
  assert.equal(storage.timer.idleSince, null, 'idle before the new start no longer needs an answer');

  const before = storage.timer.startedAt;
  await input.fill(localInput(new Date(Date.now() + 3600000).toISOString()));
  await input.blur();
  await page.locator('#appToast.is-visible').waitFor();
  assert.equal(storage.timer.startedAt, before);
  assert.equal(await input.inputValue(), localInput(before));
  await context.close();
});

test('popup: filters sit outside the create panel and survive reopening', async () => {
  const storage = seed();
  storage.tasks.push(
    { id: 'child', title: 'Child', projectId: 'web', parentId: 'parent', status: 'todo', priority: 'normal', dueDate: '2020-01-01', openedAt: ago(100), createdAt: ago(100), sortOrder: 3 },
    { id: 'finished', title: 'Finished', projectId: 'web', status: 'done', priority: 'normal', openedAt: ago(100), completedAt: ago(50), createdAt: ago(100), sortOrder: 4 },
  );
  const { context, page } = await open(POPUP, storage);
  await page.locator('[data-tab="todo"]').click();
  assert.equal(await page.locator('#todoAdvanced').isVisible(), false);
  assert.equal(await page.locator('#todoStatusFilter').isVisible(), true);
  assert.equal(await page.locator('#todoStatusFilter').inputValue(), 'active');
  const titles = await page.locator('#todoList .t1').allTextContents();
  assert.ok(!titles.some((title) => title.includes('Finished')), 'completed Todos stay out by default');
  const parentAt = titles.findIndex((title) => title.includes('Parent'));
  assert.match(titles[parentAt + 1], /Child/, 'a subtask follows its parent');
  assert.equal(await page.locator('#todoList .todo-branch').count(), 1);
  assert.equal(await page.locator('#todoList .badge.overdue').count(), 1);

  await page.locator('#todoStatusFilter').selectOption('done');
  await page.locator('#todoList', { hasText: 'Finished' }).waitFor();
  await page.reload();
  await page.waitForFunction(() => document.getElementById('initialLoading')?.hidden);
  assert.equal(await page.locator('#tab-todo').isVisible(), true);
  assert.equal(await page.locator('#todoStatusFilter').inputValue(), 'done');
  assert.match(await page.locator('#todoList').textContent(), /Finished/);
  await context.close();
});

test('options: the report steps through past periods', async () => {
  const lastWeekDay = new Date(Date.now() - 7 * 86400000);
  lastWeekDay.setHours(9, 0, 0, 0);
  const iso = (date) => date.toISOString();
  const storage = seed();
  storage.entries.push({ id: 'old', clientEntryId: 'old', projectId: 'web', taskId: null, description: 'Last week work', notes: '', tagIds: [], startedAt: iso(lastWeekDay), endedAt: iso(new Date(lastWeekDay.getTime() + 3600000)), createdAt: iso(lastWeekDay), deletedAt: null });
  const { context, page, errors } = await open(OPTIONS, storage, { width: 1280, height: 860 });
  assert.equal(await page.locator('#rangeNext').isDisabled(), true);
  const current = await page.locator('#rangeStepLabel').textContent();
  assert.doesNotMatch(await page.locator('#dailyReview').textContent(), /Last week work/);

  await page.locator('#rangePrev').click();
  assert.notEqual(await page.locator('#rangeStepLabel').textContent(), current);
  assert.match(await page.locator('#dailyReview').textContent(), /Last week work/);
  assert.equal(await page.locator('#kCount').textContent(), '1');
  assert.equal((await page.locator('#dailyReview .daily-review-entry').count()), 1);

  await page.locator('#rangeNext').click();
  assert.equal(await page.locator('#rangeStepLabel').textContent(), current);
  await page.locator('#rangePrev').click();
  await page.locator('[data-range="month"]').click();
  assert.equal(await page.locator('#rangeNext').isDisabled(), true, 'choosing a range returns to the current period');
  await page.locator('[data-range="all"]').click();
  assert.equal(await page.locator('#rangeStep').isVisible(), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('options: the start time of a running timer can be corrected', async () => {
  const storage = { ...seed(), timer: running() };
  const { context, page } = await open(OPTIONS, storage, { width: 1280, height: 860 });
  await page.locator('[data-tab="timer"]').click();
  await page.locator('#mgTimerStart').fill(localInput(ago(5)));
  await page.locator('#mgTimerStart').blur();
  await page.waitForFunction(() => document.getElementById('mgTimerClock').textContent.startsWith('00:0'));
  assert.ok(Math.abs(Date.now() - new Date(storage.timer.startedAt)) < 6.5 * 60000);
  await context.close();
});

test('options: idle time can be discarded from any tab', async () => {
  const startedAt = ago(60);
  const storage = { ...seed(), timer: running({ startedAt, idleSince: ago(20) }) };
  const { context, page } = await open(OPTIONS, storage, { width: 1280, height: 860 });
  await page.locator('#idleBanner').waitFor();
  assert.match(await page.locator('#idleBannerText').textContent(), /20/);

  await page.locator('#idleBannerDrop').click();
  await page.waitForFunction(() => document.getElementById('idleBanner').hidden);
  assert.equal(storage.timer.idleSince, null);
  const shiftedMinutes = (new Date(storage.timer.startedAt) - new Date(startedAt)) / 60000;
  assert.ok(Math.abs(shiftedMinutes - 20) < 1, `start moved ${shiftedMinutes} minutes`);
  await context.close();
});

test('options: keeping idle time only clears the prompt', async () => {
  const startedAt = ago(60);
  const storage = { ...seed(), timer: running({ startedAt, idleSince: ago(20) }) };
  const { context, page } = await open(OPTIONS, storage, { width: 1280, height: 860 });
  await page.locator('#idleBannerKeep').click();
  await page.waitForFunction(() => document.getElementById('idleBanner').hidden);
  assert.equal(storage.timer.idleSince, null);
  assert.equal(storage.timer.startedAt, startedAt);
  await context.close();
});
