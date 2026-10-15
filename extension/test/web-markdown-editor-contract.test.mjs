import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { livePreviewFixtures } from '../../shared/markdown/live-preview-fixtures.js';
import * as sharedLivePreview from '../../shared/markdown/live-preview.js';
import { parseMarkdown as parseSharedMarkdown, serializeMarkdown as serializeSharedMarkdown } from '../../shared/markdown/index.js';
import * as extensionLivePreview from '../src/lib/markdown-live-preview.js';
import { parseMarkdown as parseExtensionMarkdown, serializeMarkdown as serializeExtensionMarkdown } from '../src/lib/markdown.js';

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

test('Extension and Web editors expose whole-document source editing and optional Markdown previews', () => {
  const extensionEditor = fs.readFileSync(
    new URL('../src/lib/markdown-editor.js', import.meta.url),
    'utf8',
  );
  const webEditor = fs.readFileSync(
    new URL('../../web/components/MarkdownBlockEditor.tsx', import.meta.url),
    'utf8',
  );

  assert.match(extensionEditor, /renderPreviewBlocks\(content, blocks\)/);
  assert.match(extensionEditor, /content\.dataset\.markdownEditorRoot = 'true'/);
  assert.match(extensionEditor, /markdown-editor-active-source/);
  assert.match(extensionEditor, /aria-pressed/);
  assert.match(extensionEditor, /formatSourceSelection/);
  assert.match(webEditor, /AutoTextarea/);
  assert.match(webEditor, /formatSourceSelection/);
  assert.match(webEditor, /renderMarkdown\(value/);
  assert.match(webEditor, /mode = 'source'/);
  assert.match(webEditor, /toggleTaskSource/);
  assert.match(webEditor, /aria-pressed/);
  assert.doesNotMatch(webEditor, /contentEditable(?:=|\s)/);
});

test('Extension and shared live preview APIs produce identical fixture output', () => {
  for (const fixture of livePreviewFixtures.activeSource) {
    assert.equal(
      extensionLivePreview.readActiveBlockSource(parseExtensionMarkdown(fixture.markdown), fixture.path),
      sharedLivePreview.readActiveBlockSource(parseSharedMarkdown(fixture.markdown), fixture.path),
    );
  }
  for (const fixture of livePreviewFixtures.composition) {
    assert.equal(
      extensionLivePreview.serializeWithActiveBlockSource(
        parseExtensionMarkdown(fixture.markdown),
        fixture.path,
        fixture.source,
      ),
      sharedLivePreview.serializeWithActiveBlockSource(
        parseSharedMarkdown(fixture.markdown),
        fixture.path,
        fixture.source,
      ),
    );
  }
  for (const fixture of livePreviewFixtures.replacement) {
    const extensionResult = extensionLivePreview.replaceActiveBlockSource(
      parseExtensionMarkdown(fixture.markdown), fixture.path, fixture.source,
    );
    const sharedResult = sharedLivePreview.replaceActiveBlockSource(
      parseSharedMarkdown(fixture.markdown), fixture.path, fixture.source,
    );
    assert.deepEqual(
      { ...extensionResult, blocks: serializeExtensionMarkdown(extensionResult.blocks) },
      { ...sharedResult, blocks: serializeSharedMarkdown(sharedResult.blocks) },
    );
  }
  for (const fixture of livePreviewFixtures.inlineToggle) {
    assert.deepEqual(
      extensionLivePreview.toggleInlineSource(fixture.source, fixture.start, fixture.end, fixture.command),
      sharedLivePreview.toggleInlineSource(fixture.source, fixture.start, fixture.end, fixture.command),
    );
  }
  for (const fixture of livePreviewFixtures.blockToggle) {
    assert.deepEqual(
      extensionLivePreview.toggleBlockSource(fixture.source, fixture.command),
      sharedLivePreview.toggleBlockSource(fixture.source, fixture.command),
    );
  }
  for (const fixture of livePreviewFixtures.toolbarState) {
    assert.deepEqual(
      extensionLivePreview.activeToolbarState(fixture.source, fixture.start, fixture.end),
      sharedLivePreview.activeToolbarState(fixture.source, fixture.start, fixture.end),
    );
  }
});
