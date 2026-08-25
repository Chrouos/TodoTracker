import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = [
  'web/app/todos/page.tsx',
  'web/components/ProjectNotes.tsx',
  'web/components/EntryDialog.tsx',
  'web/components/TimerPanel.tsx',
  'web/app/schedules/page.tsx',
  'web/app/log/page.tsx',
];

test('all Markdown note fields use the block editor', () => {
  for (const file of files) {
    const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(source, /MarkdownBlockEditor/);
  }
});
