import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
const popup = await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/popup/popup.css', import.meta.url), 'utf8');

assert.match(html, /id="appToast"[^>]*role="status"[^>]*aria-live="polite"/,
  'Popup should expose one unobtrusive live toast region');
assert.doesNotMatch(html, /id="appToast"[^>]*hidden/,
  'Popup toast live region should remain available to assistive technology');
for (const key of ['todoCreated', 'todoCompleted', 'todoReopened', 'todoDeleted']) {
  assert.match(popup, new RegExp(`['"]toast\\.${key}['"]`), `Popup should expose ${key} feedback`);
}
assert.match(popup, /showToast\(translate\(currentLocale,/, 'Popup Todo actions should display translated toast feedback');
assert.match(css, /\.app-toast\s*\{[^}]*position:\s*fixed/s,
  'Popup toast should float without changing the compact layout');

for (const key of ['popup.track', 'popup.todo', 'popup.copySummary', 'timer.start']) {
  assert.match(html, new RegExp(`data-i18n="${key}"`), `Popup markup should mark ${key}`);
}
for (const key of [
  'popup.manage', 'popup.logEntry', 'popup.saveLog', 'timer.keepTime', 'timer.discardTime',
  'popup.descriptionPlaceholder', 'timer.notes', 'popup.recentEntries', 'popup.newTodoPlaceholder',
  'project.project', 'todo.parent', 'todo.priority', 'todo.dueDate', 'todo.dueTime',
  'common.filter', 'todo.status',
]) {
  assert.match(html, new RegExp(`data-i18n(?:-[a-z-]+)?="${key}"`), `Popup markup should mark ${key}`);
}
for (const key of ['popup.todoPlaceholder', 'popup.notesPlaceholder']) {
  assert.match(html, new RegExp(`data-i18n-placeholder="${key}"`), `Popup markup should translate ${key}`);
}
assert.match(html, /id="ctx"[^>]*data-i18n="timer\.notStarted"/);
for (const name of ['resolveLocale', 'getBrowserLocale', 'applyTranslations', 'translate']) {
  assert.match(popup, new RegExp(`\\b${name}\\b`), `Popup should use ${name}`);
}
assert.match(popup, /formatDuration/, 'Popup should use the shared duration formatter');
assert.match(popup, /locale:\s*currentLocale/, 'Popup summary should use the selected locale');
for (const key of [
  'popup.manage', 'popup.logEntry', 'popup.saveLog', 'timer.keepTime', 'timer.discardTime',
  'popup.descriptionPlaceholder', 'timer.notes', 'popup.recentEntries', 'popup.newTodoPlaceholder',
  'project.project', 'todo.parent', 'todo.priority', 'todo.dueDate', 'todo.dueTime',
  'common.filter', 'todo.status',
]) {
  assert.match(html, new RegExp(`data-i18n(?:-[a-z-]+)?="${key}"`), `Popup markup should mark ${key}`);
}
for (const key of ['popup.todoPlaceholder', 'popup.notesPlaceholder']) {
  assert.match(html, new RegExp(`data-i18n-placeholder="${key}"`), `Popup markup should translate ${key}`);
}
assert.match(popup, /formatDisplayTime/, 'Popup should use the locale-aware time formatter');
assert.match(popup, /document\.documentElement\.lang/);
for (const key of [
  'common.unnamedWork', 'popup.resumeEntry', 'popup.addSubtaskButton', 'popup.saved', 'todo.addSubtask',
  'todo.start', 'common.delete', 'common.uncategorizedOption', 'common.noTodoOption',
]) {
  assert.match(popup, new RegExp(`translate\\(currentLocale, ['"]${key}['"]`), `Popup should translate ${key}`);
}

console.log('popup layout contract passed');
