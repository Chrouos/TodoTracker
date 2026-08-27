import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../src/background.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

assert.match(background, /from ['"]\.\/lib\/i18n\.js['"]/, 'Background should import the locale engine');
for (const key of ['notification.todoCreated', 'notification.todoDue']) {
  assert.match(background, new RegExp(`translate\\([^;]*['"]${key}['"]`), `Background should translate ${key}`);
}
assert.match(background, /resolveLocale/, 'Background should resolve the saved locale');
assert.match(background, /getBrowserLocale/, 'Background should read the browser locale');
assert.match(background, /getSettings/, 'Background should load settings before notifications');

assert.equal(manifest.default_locale, 'en');
assert.equal(manifest.name, '__MSG_extensionName__');
assert.equal(manifest.description, '__MSG_extensionDescription__');

for (const locale of ['en', 'zh_TW', 'ja']) {
  const messages = JSON.parse(await readFile(new URL(`../_locales/${locale}/messages.json`, import.meta.url), 'utf8'));
  assert.ok(messages.extensionName);
  assert.ok(messages.extensionDescription);
}

console.log('background layout contract passed');
