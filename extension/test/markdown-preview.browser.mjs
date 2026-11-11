// Run with: node --test extension/test/markdown-preview.browser.mjs
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
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const LONG_NOTES = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n\n');

const entry = (id, notes, minutes) => ({
  id, clientEntryId: id, projectId: null, taskId: null, description: id, notes, tagIds: [],
  startedAt: ago(minutes + 5), endedAt: ago(minutes), createdAt: ago(minutes + 5), deletedAt: null,
});
const seed = () => ({
  settings: { language: 'zh-TW', weekStartsOn: 1, notesEditor: 'toolbar', dailyGoalHours: 8, idleThresholdMin: 5, roundToMin: 0 },
  projects: [], tags: [], tasks: [], schedules: [], calendarPlans: [],
  entries: [entry('long', LONG_NOTES, 10), entry('other', 'Other notes', 20)],
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

async function open(storage) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
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
      storage: {
        local: { get: (key) => window.__get(key), set: (patch) => window.__set(patch), remove: (key) => window.__remove(key) },
        onChanged: event,
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
  await page.goto(base + OPTIONS);
  await page.waitForFunction(() => document.getElementById('initialLoading')?.hidden);
  return { context, page, errors };
}

test('todo notes: click outside previews, click preview edits, Ctrl+E toggles', async () => {
  const { context, page, errors } = await open(seed());
  await page.locator('[data-tab="todos"]').click();
  await page.locator('#tdMore').click();
  const notes = page.locator('#tdNotes');
  const preview = page.locator('#todoForm .markdown-text-preview');

  await page.locator('#tdTitle').click();
  assert.equal(await preview.isVisible(), false, 'an editor the user never entered stays in edit mode');

  await notes.click();
  await page.locator('#tdTitle').click();
  assert.equal(await notes.isVisible(), true, 'empty notes keep their placeholder');

  await notes.fill('**bold** text');
  await page.locator('#todoForm .markdown-editor-toolbar [data-markdown-wrap]').click();
  assert.equal(await notes.isVisible(), true, 'the editor toolbar is not outside the editor');

  await page.locator('#tdTitle').click();
  await preview.waitFor();
  assert.equal(await notes.isVisible(), false);
  assert.equal(await preview.locator('strong').textContent(), 'bold');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tdTitle', 'the clicked field keeps focus');

  await preview.locator('strong').click();
  await notes.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tdNotes');

  await page.keyboard.press('Control+e');
  await preview.waitFor();
  await page.keyboard.press('Control+e');
  await notes.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tdNotes');
  assert.equal(await notes.inputValue(), '**bold** text');
  assert.deepEqual(errors, []);
  await context.close();
});

test('dragging a selection out of the editor does not open the preview', async () => {
  const { context, page, errors } = await open(seed());
  await page.locator('[data-tab="todos"]').click();
  await page.locator('#tdMore').click();
  const notes = page.locator('#tdNotes');
  await notes.fill('Some text to select');
  const box = await notes.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y - 60);
  await page.mouse.up();
  assert.equal(await notes.isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a save button pushed by the shrinking preview still receives the click', async () => {
  const storage = seed();
  const { context, page, errors } = await open(storage);
  await page.locator('[data-tab="entries"]').click();
  await page.locator('[data-edit-e="long"]').click();
  const notes = page.locator('#enNotes');
  await notes.click();
  await notes.press('Control+End');
  await page.keyboard.type(' saved');
  await page.locator('#entrySave').click();
  await page.locator('#entryDlg').waitFor({ state: 'hidden' });
  // The dialog closes before the save reaches storage.
  for (let attempt = 0; attempt < 100 && !/saved$/.test(storage.entries.find((item) => item.id === 'long').notes); attempt += 1) {
    await page.waitForTimeout(50);
  }
  assert.match(storage.entries.find((item) => item.id === 'long').notes, /saved$/);

  await page.locator('[data-edit-e="other"]').click();
  await notes.waitFor();
  assert.equal(await notes.inputValue(), 'Other notes', 'a dialog loading other notes opens in edit mode');
  assert.deepEqual(errors, []);
  await context.close();
});

test('timer notes: click outside and Ctrl+E use the panel preview', async () => {
  const { context, page, errors } = await open(seed());
  await page.locator('[data-tab="timer"]').click();
  const notes = page.locator('#mgTimerNotes');
  const preview = page.locator('#mgTimerNotesPreview');

  await notes.fill('**timer** notes');
  await page.locator('#mgTimerDescription').click();
  await preview.waitFor();
  assert.equal(await preview.locator('strong').textContent(), 'timer');
  assert.equal(await page.locator('#mgTimerNotesPreviewToggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mgTimerDescription');

  await preview.locator('strong').click();
  await notes.waitFor();
  await page.keyboard.press('Control+e');
  await preview.waitFor();
  await page.keyboard.press('Control+e');
  await notes.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mgTimerNotes');

  await page.locator('#mgTimerNotesPreviewToggle').click();
  await preview.waitFor();
  await page.keyboard.press('Control+e');
  await notes.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mgTimerNotes');

  await page.locator('#mgTimerNotesEditToggle').click();
  assert.equal(await notes.isVisible(), true, 'pressing Edit while editing stays in edit mode');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mgTimerNotes');
  assert.deepEqual(errors, []);
  await context.close();
});

test('stopping a running timer saves the notes and leaves no empty preview', async () => {
  const storage = seed();
  storage.timer = {
    entryId: 'run', clientEntryId: 'run', projectId: null, taskId: null, description: 'Running work',
    notes: '**running** notes', tagIds: [], startedAt: ago(30), planId: null, idleSince: null,
  };
  const { context, page, errors } = await open(storage);
  await page.locator('[data-tab="timer"]').click();
  const notes = page.locator('#mgTimerNotes');
  const preview = page.locator('#mgTimerNotesPreview');

  await notes.click();
  await page.locator('#mgTimerToggle').click();
  await page.waitForFunction(() => document.getElementById('mgTimerNotes').value === '');
  await notes.waitFor();
  assert.equal(await preview.isVisible(), false);
  assert.ok(storage.entries.some((item) => item.notes === '**running** notes'));
  assert.deepEqual(errors, []);
  await context.close();
});
