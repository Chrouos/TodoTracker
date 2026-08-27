import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
const popup = await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8');

for (const key of ['popup.track', 'popup.todo', 'popup.copySummary', 'timer.start']) {
  assert.match(html, new RegExp(`data-i18n="${key}"`), `Popup markup should mark ${key}`);
}
for (const name of ['resolveLocale', 'getBrowserLocale', 'applyTranslations', 'translate']) {
  assert.match(popup, new RegExp(`\\b${name}\\b`), `Popup should use ${name}`);
}
assert.match(popup, /formatDuration/, 'Popup should use the shared duration formatter');
assert.match(popup, /locale:\s*currentLocale/, 'Popup summary should use the selected locale');

console.log('popup layout contract passed');
