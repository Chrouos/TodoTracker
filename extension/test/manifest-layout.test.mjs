import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

assert.equal(manifest.commands['toggle-timer'].suggested_key.default, 'Alt+Shift+K');
assert.equal(manifest.commands._execute_action.suggested_key.default, 'Alt+Shift+J');
for (const locale of ['en', 'zh_TW', 'ja']) {
  const messages = JSON.parse(await readFile(new URL(`../_locales/${locale}/messages.json`, import.meta.url), 'utf8'));
  for (const key of ['commandToggleTimer', 'commandOpenPopup']) {
    assert.ok(messages[key]?.message, `${locale} should name the ${key} shortcut`);
  }
}

assert.deepEqual(
  manifest.externally_connectable,
  { matches: ['http://localhost/*', 'http://127.0.0.1/*'] },
  'Manifest should allow the web bridge only from local development origins',
);
