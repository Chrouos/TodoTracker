// Run: node --test extension/test/calendar.browser.mjs (PLAYWRIGHT_MODULE may point to an installed copy).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
async function eventually(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('Timed out waiting for persisted calendar change');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}
const fixture = () => ({
  settings: { language: 'zh-TW', weekStartsOn: 1, notesEditor: 'toolbar' },
  projects: [{ id: 'project', name: '產品開發', color: '#427bba', notes: [] }, { id: 'personal', name: '生活', color: '#708653', notes: [] }],
  tasks: [{ id: 'task', title: '完成日曆介面', projectId: 'project', status: 'todo', dueDate: '2026-10-22', priority: 'normal' }],
  entries: [{ id: 'actual', projectId: 'project', taskId: 'task', description: '製作日曆原型', startedAt: '2026-10-20T01:30:00Z', endedAt: '2026-10-20T02:30:00Z', notes: '完成週檢視的初步版面。' }],
  calendarPlans: [
    { id: 'plan', title: '日曆介面設計', projectId: 'project', taskId: 'task', allDay: false, startedAt: '2026-10-20T01:00:00Z', endedAt: '2026-10-20T03:00:00Z', notes: '先完成週檢視。' },
    { id: 'walk', title: '散步與午餐', projectId: 'personal', taskId: null, allDay: false, startedAt: '2026-10-20T04:00:00Z', endedAt: '2026-10-20T05:00:00Z', notes: '' },
    { id: 'trip', title: '週末旅行', projectId: 'personal', taskId: null, allDay: true, startDate: '2026-10-24', endDate: '2026-10-27', notes: '' },
  ],
});

async function setup(t, options = {}) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root) || !/^\/(extension\/(src|icons)\/|shared\/)/.test(pathname)) { res.writeHead(404).end(); return; }
    try {
      const bytes = await readFile(filename);
      const ext = path.extname(filename);
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[ext] || 'application/octet-stream');
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: options.width || 1440, height: 1000 }, timezoneId: 'Asia/Taipei' });
  const storage = fixture();
  if (options.locale) storage.settings.language = options.locale;
  let failNext = false;
  await context.exposeBinding('__get', (_, key) => {
    if (key === null || key === undefined) return structuredClone(storage);
    if (Array.isArray(key)) return Object.fromEntries(key.map(k => [k, structuredClone(storage[k])]));
    return { [key]: structuredClone(storage[key]) };
  });
  const publish = async (changes) => {
    await Promise.all(context.pages().map(p => p.evaluate(changes => window.__storageListeners?.forEach(fn => fn(changes, 'local')), changes).catch(() => {})));
  };
  await context.exposeBinding('__set', async (_, patch) => {
    if (failNext) { failNext = false; throw new Error('Test storage failure'); }
    const changes = {};
    for (const [key, value] of Object.entries(patch)) { changes[key] = { oldValue: storage[key], newValue: value }; storage[key] = structuredClone(value); }
    await publish(changes);
  });
  await context.exposeBinding('__remove', async (_, key) => {
    const changes = { [key]: { oldValue: storage[key] } }; delete storage[key]; await publish(changes);
  });
  await context.addInitScript(() => {
    const NativeDate = Date;
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-20T02:00:00Z'])); }
      static now() { return +new NativeDate('2026-10-20T02:00:00Z'); }
    };
    window.__storageListeners = [];
    window.chrome = {
      storage: { local: { get: key => window.__get(key), set: patch => window.__set(patch), remove: key => window.__remove(key), clear: async () => {} }, onChanged: { addListener: fn => window.__storageListeners.push(fn), removeListener: fn => { window.__storageListeners = window.__storageListeners.filter(f => f !== fn); } } },
      i18n: { getUILanguage: () => 'zh-TW' }, runtime: { getManifest: () => ({ version: '0.3.3' }), openOptionsPage() {} },
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
  await page.goto(base + '/extension/src/options/options.html');
  await page.locator('#initialLoading').waitFor({ state: 'hidden' });
  await page.locator('[data-tab="calendar"]').click({ timeout: 5000 });
  return { page, context, base, storage, errors, publish, fail: () => { failNext = true; } };
}


export { setup, eventually, root };
