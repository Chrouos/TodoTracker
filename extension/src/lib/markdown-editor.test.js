import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMarkdownSelection, normalizeMarkdownEditorMode } from './markdown-editor.js';

test('wraps selected text in Markdown bold and keeps it selected', () => {
  assert.deepEqual(
    formatMarkdownSelection('請回覆客戶', 1, 3, 'bold'),
    { value: '請**回覆**客戶', selectionStart: 3, selectionEnd: 5 },
  );
});

test('inserts an italic placeholder when nothing is selected', () => {
  assert.deepEqual(
    formatMarkdownSelection('', 0, 0, 'italic'),
    { value: '*斜體文字*', selectionStart: 1, selectionEnd: 5 },
  );
});

test('prefixes every selected line for a Markdown list', () => {
  assert.deepEqual(
    formatMarkdownSelection('第一項\n第二項', 0, 7, 'unordered-list'),
    { value: '- 第一項\n- 第二項', selectionStart: 2, selectionEnd: 11 },
  );
});

test('normalizes unknown editor settings to the toolbar editor', () => {
  assert.equal(normalizeMarkdownEditorMode('source'), 'source');
  assert.equal(normalizeMarkdownEditorMode('anything-else'), 'toolbar');
});
