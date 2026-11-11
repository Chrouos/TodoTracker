// Run with: node --test extension/test/extension-real.browser.mjs
// Loads the real unpacked extension. Requires Playwright's Chromium (or PLAYWRIGHT_MODULE pointing to an installed copy).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const extension = fileURLToPath(new URL('../', import.meta.url));

let context;
let profile;
let worker;
let id;

test.before(async () => {
  profile = await mkdtemp(path.join(tmpdir(), 'todotracker-real-'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  id = new URL(worker.url()).host;
});

test.after(async () => {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
});

async function openPage(file) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/src/${file}`);
  await page.locator('#initialLoading').waitFor({ state: 'hidden' });
  return page;
}

test('simultaneous writes from two pages all survive', async () => {
  const [options, popup] = [await openPage('options/options.html'), await openPage('popup/popup.html')];
  const write = (page, prefix) => page.evaluate(async (name) => {
    const db = await import('/src/lib/db.js');
    await Promise.all(Array.from({ length: 15 }, (_, i) => db.upsertTask({ id: `${name}${i}`, title: `${name} ${i}` })));
  }, prefix);
  await Promise.all([write(options, 'options'), write(popup, 'popup')]);
  const { tasks } = await worker.evaluate(() => chrome.storage.local.get('tasks'));
  assert.equal(tasks.length, 30);
  await options.close();
  await popup.close();
});

test('side panel page follows real storage changes and fills its width', async () => {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 520, height: 800 });
  await panel.goto(`chrome-extension://${id}/src/popup/popup.html?view=panel`);
  await panel.locator('#initialLoading').waitFor({ state: 'hidden' });
  assert.equal(await panel.locator('body').evaluate((body) => Math.round(body.getBoundingClientRect().width)), 520);
  await worker.evaluate(() => chrome.storage.local.set({ timer: {
    entryId: 'real', clientEntryId: 'real', projectId: null, taskId: null, description: 'Started by the worker',
    notes: '', tagIds: [], startedAt: new Date(Date.now() - 60000).toISOString(), planId: null, idleSince: null,
  } }));
  await panel.waitForFunction(() => document.getElementById('toggle').dataset.state === 'running');
  assert.match(await panel.locator('#ctx').textContent(), /Started by the worker/);
  await worker.evaluate(() => chrome.storage.local.remove('timer'));
  await panel.waitForFunction(() => document.getElementById('toggle').dataset.state === 'idle');
  await panel.close();
});

test('the manifest registers the side panel and its shortcut', async () => {
  const { panel, commands } = await worker.evaluate(async () => ({
    panel: await chrome.sidePanel.getOptions({}),
    commands: await chrome.commands.getAll(),
  }));
  assert.match(panel.path, /popup\.html\?view=panel$/);
  assert.equal(panel.enabled, true);
  assert.equal(commands.find((command) => command.name === 'open-side-panel').shortcut, 'Alt+Shift+L');
});
