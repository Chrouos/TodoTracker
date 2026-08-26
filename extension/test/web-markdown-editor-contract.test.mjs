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
    if (file === 'web/app/log/page.tsx') assert.match(source, /AutoTextarea/);
    else assert.match(source, /MarkdownBlockEditor/);
  }
});

test('Extension and Web editors expose one delegated editable root contract', () => {
  const extensionEditor = fs.readFileSync(
    new URL('../src/lib/markdown-editor.js', import.meta.url),
    'utf8',
  );
  const webEditor = fs.readFileSync(
    new URL('../../web/components/MarkdownBlockEditor.tsx', import.meta.url),
    'utf8',
  );

  assert.match(extensionEditor, /renderEditableBlocks\(content, blocks\)/);
  assert.match(extensionEditor, /readEditableBlocks\(content,/);
  assert.match(extensionEditor, /content\.dataset\.markdownEditorRoot = 'true'/);
  assert.doesNotMatch(extensionEditor, /data-editor-surface|editorSurface|activeSurface/);
  assert.match(webEditor, /contentEditable[\s\S]*onBeforeInput=[\s\S]*onInput=/);
});
