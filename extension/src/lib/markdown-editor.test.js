import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blocksFromMarkdown,
  continueListItem,
  exitEmptyListItem,
  formatMarkdownSelection,
  markdownShortcutToBlock,
  mountMarkdownEditor,
  normalizeMarkdownEditorMode,
  pasteMarkdownAtTextBlock,
  serializeTaskCheckboxToggle,
  splitTextBlockAtOffset,
  toolbarSelection,
  indentListItem,
  insertInlineTextAtSelection,
  isAfterInlineBoundary,
  isTextNodeEndAtOffset,
  listItemPathAfterIndent,
  restoreTextareaFromEditor,
  updateInlinesForTextInput,
} from './markdown-editor.js';
import { parseMarkdown, serializeMarkdown } from './markdown.js';

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

test('converts block-start Markdown shortcuts to native editor blocks', () => {
  assert.deepEqual(markdownShortcutToBlock('# '), { type: 'heading', level: 1, inlines: [] });
  assert.deepEqual(markdownShortcutToBlock('- [x] '), {
    type: 'taskList',
    items: [{ checked: true, inlines: [], children: [] }],
  });
  assert.equal(markdownShortcutToBlock('text - '), null);
});

test('converts quote and fenced-code shortcuts to native editor blocks', () => {
  assert.deepEqual(markdownShortcutToBlock('> '), {
    type: 'quote',
    blocks: [{ type: 'paragraph', inlines: [] }],
  });
  assert.deepEqual(markdownShortcutToBlock('``` '), { type: 'codeBlock', value: '' });
});

test('serializes an editor task checkbox change back to Markdown', () => {
  assert.equal(
    serializeTaskCheckboxToggle('- [ ] Open\n- [x] Done', '0.0'),
    '- [x] Open\n- [x] Done',
  );
});

test('formats a selection as a Todo item without changing legacy commands', () => {
  assert.deepEqual(
    formatMarkdownSelection('Plan', 0, 4, 'todo'),
    { value: '- [ ] Plan', selectionStart: 6, selectionEnd: 10 },
  );
  assert.deepEqual(
    formatMarkdownSelection('Plan', 0, 4, 'bold'),
    { value: '**Plan**', selectionStart: 2, selectionEnd: 6 },
  );
});

test('keeps the editor selection when an Extension toolbar button moves browser focus', () => {
  const remembered = {
    anchor: { path: [0], offset: 2 },
    focus: { path: [0], offset: 6 },
  };

  assert.deepEqual(toolbarSelection(null, remembered), remembered);
  assert.deepEqual(toolbarSelection({
    anchor: { path: [0], offset: 0 },
    focus: { path: [0], offset: 0 },
  }, remembered), remembered);
});

test('creates an editable paragraph block for an empty Markdown value', () => {
  assert.deepEqual(blocksFromMarkdown(''), [{ type: 'paragraph', inlines: [] }]);
});

test('preserves inline marks and link URLs while text changes inside them', () => {
  const [block] = parseMarkdown('**Bold** and [docs](https://example.com)');
  assert.equal(
    serializeMarkdown([{ ...block, inlines: updateInlinesForTextInput(block.inlines, 'Bald and docs') }]),
    '**Bald** and [docs](https://example.com)',
  );
});

test('splits a text block at the focused caret offset', () => {
  const split = splitTextBlockAtOffset(parseMarkdown('BeforeAfter'), [0], 6);
  assert.equal(serializeMarkdown(split.blocks), 'Before\n\nAfter');
  assert.deepEqual(split.nextPath, [1]);
});

test('replaces a selected text block with parsed multiline Markdown paste', () => {
  const result = pasteMarkdownAtTextBlock(
    parseMarkdown('replace me'),
    [0],
    0,
    10,
    '# Pasted\n\n- [ ] Task',
  );

  assert.deepEqual(result.blocks.map((block) => block.type), ['heading', 'taskList']);
  assert.equal(serializeMarkdown(result.blocks), '# Pasted\n\n- [ ] Task');
  assert.deepEqual(result.nextPath, [1]);
});

test('splits the active text block around multiline Markdown paste', () => {
  const result = pasteMarkdownAtTextBlock(
    parseMarkdown('before after'),
    [0],
    7,
    7,
    '> Quote\n\n```js\nconst value = 1;\n```',
  );

  assert.equal(
    serializeMarkdown(result.blocks),
    'before \n\n> Quote\n\n```js\nconst value = 1;\n```\n\nafter',
  );
  assert.deepEqual(result.nextPath, [3]);
});

test('toggles a nested task after a sibling normal list without path collisions', () => {
  const markdown = '- Parent\n  - Plain child\n  - [ ] Nested task\n- [ ] Sibling task';
  assert.equal(
    serializeTaskCheckboxToggle(markdown, '0.0.1.0'),
    '- Parent\n  - Plain child\n  - [x] Nested task\n- [ ] Sibling task',
  );
});

test('toggles a quote-list-task item at the canonical editor path', () => {
  const markdown = '> - Parent\n>   - [ ] Nested task';
  assert.equal(
    serializeTaskCheckboxToggle(markdown, '0.0.0.0.0'),
    '> - Parent\n>   - [x] Nested task',
  );
});

test('continues and exits list items with the shared Markdown structure', () => {
  const source = parseMarkdown('- One');
  assert.equal(serializeMarkdown(continueListItem(source, [0, 0])), '- One\n- ');
  assert.equal(serializeMarkdown(exitEmptyListItem(continueListItem(source, [0, 0]), [0, 1])), '- One\n\n');
});

test('exits an empty quoted list item without removing the preceding paragraph', () => {
  const source = parseMarkdown('> Intro\n>\n> - ');
  const next = exitEmptyListItem(source, [0, 1, 0]);

  assert.deepEqual(next[0].blocks, [
    { type: 'paragraph', inlines: [{ type: 'text', value: 'Intro' }] },
    { type: 'paragraph', inlines: [] },
  ]);
});

test('indents and outdents a list item without mutating the source', () => {
  const source = parseMarkdown('- One\n- Two');
  const nestedPath = listItemPathAfterIndent(source, [0, 1], 'in');
  const nested = indentListItem(source, [0, 1], 'in');
  assert.equal(serializeMarkdown(nested), '- One\n  - Two');
  assert.deepEqual(nestedPath, [0, 0, 0, 0]);
  assert.equal(serializeMarkdown(indentListItem(nested, nestedPath, 'out')), '- One\n- Two');
  assert.equal(serializeMarkdown(source), '- One\n- Two');
});

test('restores the textarea by replacing the editor wrapper and removing its marker', () => {
  const calls = [];
  const textarea = { id: 'notes' };
  const wrapper = { replaceWith(value) { calls.push(['replaceWith', value]); } };
  const marker = { remove() { calls.push(['remove']); } };
  restoreTextareaFromEditor(marker, wrapper, textarea);
  assert.deepEqual(calls, [['replaceWith', textarea], ['remove']]);
});

test('recognizes text-node carets at inline mark boundaries before inserting', () => {
  const surface = { nodeType: 1, tagName: 'DIV' };
  const ranges = ['STRONG', 'EM', 'CODE', 'A'].map((tagName) => {
    const mark = { nodeType: 1, tagName, parentNode: surface };
    const nested = { nodeType: 1, tagName: 'SPAN', parentNode: mark };
    const textNode = { nodeType: 3, nodeValue: 'Bold', parentNode: nested };
    return { textNode, range: { collapsed: true, startContainer: textNode, startOffset: 4 } };
  });
  assert.ok(ranges.every(({ textNode, range }) => isTextNodeEndAtOffset(textNode, range.startOffset) && isAfterInlineBoundary(range, surface)));

  const [block] = parseMarkdown('**Bold** plain');
  assert.equal(
    serializeMarkdown([{ ...block, inlines: insertInlineTextAtSelection(block.inlines, 4, 4, '!', { range: ranges[0].range, surface }) }]),
    '**Bold**! plain',
  );
  assert.equal(
    serializeMarkdown([{ ...block, inlines: insertInlineTextAtSelection(block.inlines, 3, 3, '!', { range: { ...ranges[0].range, startOffset: 3 }, surface }) }]),
    '**Bol!d** plain',
  );
});

class EditorFixtureNode {
  constructor(nodeType, ownerDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.parentNode = null;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== listener));
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener.call(this, event);
    if (event.bubbles && !event.propagationStopped) this.parentNode?.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  replaceWith(node) {
    const parent = this.parentNode;
    if (!parent) return;
    const index = parent.childNodes.indexOf(this);
    parent.removeChild(this);
    parent.insertBefore(node, parent.childNodes[index] ?? null);
  }
}

class EditorFixtureText extends EditorFixtureNode {
  constructor(value, ownerDocument) {
    super(3, ownerDocument);
    this.nodeValue = String(value);
  }

  get textContent() {
    return this.nodeValue;
  }

  set textContent(value) {
    this.nodeValue = String(value);
  }
}

class EditorFixtureComment extends EditorFixtureNode {
  constructor(value, ownerDocument) {
    super(8, ownerDocument);
    this.nodeValue = value;
  }

  get textContent() {
    return '';
  }
}

class EditorFixtureClassList {
  constructor(element) {
    this.element = element;
  }

  toggle(name, force) {
    const names = new Set(this.element.className.split(/\s+/).filter(Boolean));
    const enabled = force === undefined ? !names.has(name) : force;
    if (enabled) names.add(name);
    else names.delete(name);
    this.element.className = [...names].join(' ');
    return enabled;
  }

  contains(name) {
    return this.element.className.split(/\s+/).includes(name);
  }
}

class EditorFixtureElement extends EditorFixtureNode {
  constructor(tagName, ownerDocument) {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.classList = new EditorFixtureClassList(this);
    this.contentEditable = 'inherit';
    this.hidden = false;
    this.value = '';
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.style = {};
    this.scrollHeight = 140;
  }

  append(...nodes) {
    nodes.forEach((node) => this.insertBefore(
      typeof node === 'string' ? new EditorFixtureText(node, this.ownerDocument) : node,
      null,
    ));
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  insertBefore(node, reference) {
    node.parentNode?.removeChild(node);
    const index = reference ? this.childNodes.indexOf(reference) : this.childNodes.length;
    const safeIndex = index < 0 ? this.childNodes.length : index;
    node.parentNode = this;
    node.parentElement = this;
    this.childNodes.splice(safeIndex, 0, node);
    this.children = this.childNodes.filter((child) => child.nodeType === 1);
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) return node;
    this.childNodes.splice(index, 1);
    this.children = this.childNodes.filter((child) => child.nodeType === 1);
    node.parentNode = null;
    node.parentElement = null;
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of [...this.childNodes]) this.removeChild(child);
    this.append(...nodes);
  }

  contains(node) {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent ?? '').join('');
  }

  set textContent(value) {
    this.replaceChildren(...(value ? [new EditorFixtureText(value, this.ownerDocument)] : []));
  }

  setAttribute(name, value) {
    this[name === 'aria-label' ? 'ariaLabel' : name] = String(value);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.childNodes ?? []) {
        if (child.nodeType === 1 && editorFixtureMatches(child, selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.nodeType === 1 && editorFixtureMatches(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

class EditorFixtureRange {
  setStart(node, offset) {
    this.startContainer = node;
    this.startOffset = offset;
  }

  setEnd(node, offset) {
    this.endContainer = node;
    this.endOffset = offset;
  }
}

class EditorFixtureSelection {
  constructor() {
    this.ranges = [];
  }

  get rangeCount() {
    return this.ranges.length;
  }

  getRangeAt(index) {
    return this.ranges[index];
  }

  removeAllRanges() {
    this.ranges = [];
  }

  addRange(range) {
    this.ranges = [range];
    this.anchorNode = range.startContainer;
    this.anchorOffset = range.startOffset;
    this.focusNode = range.endContainer;
    this.focusOffset = range.endOffset;
  }
}

class EditorFixtureDocument {
  constructor() {
    this.selection = new EditorFixtureSelection();
    this.activeElement = null;
  }

  createElement(tagName) {
    return new EditorFixtureElement(tagName, this);
  }

  createTextNode(value) {
    return new EditorFixtureText(value, this);
  }

  createComment(value) {
    return new EditorFixtureComment(value, this);
  }

  createRange() {
    return new EditorFixtureRange();
  }

  getSelection() {
    return this.selection;
  }
}

class EditorFixtureEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
    Object.assign(this, options);
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

function editorFixtureMatches(element, selector) {
  const classMatch = selector.match(/^\.([\w-]+)$/);
  if (classMatch) return element.classList.contains(classMatch[1]);
  const dataMatch = selector.match(/^\[data-([\w-]+)(?:="([^"]+)")?\]$/);
  if (dataMatch) {
    const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return dataMatch[2] === undefined ? key in element.dataset : element.dataset[key] === dataMatch[2];
  }
  return element.tagName === selector.toUpperCase();
}

function editorFixture(markdown = 'First\n\nSecond') {
  const document = new EditorFixtureDocument();
  const host = document.createElement('section');
  const textarea = document.createElement('textarea');
  textarea.value = markdown;
  host.append(textarea);
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Event: globalThis.Event,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  globalThis.document = document;
  globalThis.window = { getSelection: () => document.getSelection() };
  globalThis.Event = EditorFixtureEvent;
  globalThis.requestAnimationFrame = (callback) => callback();
  return {
    document,
    host,
    textarea,
    restore() {
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.Event = previous.Event;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    },
  };
}

function setEditorFixtureSelection(document, startNode, startOffset, endNode = startNode, endOffset = startOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
}

test('mounts one preview root and no contenteditable descendants', () => {
  const fixture = editorFixture();
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const wrapper = fixture.host.querySelector('.markdown-editor');
    const root = wrapper.querySelector('[data-markdown-editor-root="true"]');

    assert.equal(root.contentEditable, 'false');
    assert.equal(root.querySelectorAll('[contenteditable="true"]').length, 0);
    assert.equal(root.querySelectorAll('[data-editor-surface="true"]').length, 0);
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('activates one Markdown source textarea when a preview block is clicked', () => {
  const fixture = editorFixture('First\n\nSecond');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    assert.equal(root.contentEditable, 'false');
    assert.equal(active.value, 'First');
    assert.equal(root.querySelectorAll('.markdown-editor-active-source').length, 1);
    editor.destroy();
  } finally { fixture.restore(); }
});

test('activates the empty first block when the blank editor canvas is clicked', () => {
  const fixture = editorFixture('');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));

    const active = root.querySelector('.markdown-editor-active-source');
    assert.ok(active);
    assert.equal(active.value, '');
    assert.equal(fixture.document.activeElement, active);
    editor.destroy();
  } finally { fixture.restore(); }
});

test('commits the previous block before activating the next preview', () => {
  const fixture = editorFixture('First\n\nSecond');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelectorAll('p')[0].dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const first = root.querySelector('.markdown-editor-active-source');
    first.value = 'Updated';
    first.setSelectionRange(7, 7);
    first.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
    root.querySelectorAll('p')[0].dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    assert.equal(fixture.textarea.value, 'Updated\n\nSecond');
    assert.equal(root.querySelector('.markdown-editor-active-source').value, 'Second');
    editor.destroy();
  } finally { fixture.restore(); }
});

test('clicking outside commits source and leaves only previews', () => {
  const fixture = editorFixture('Text');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    active.value = 'Changed';
    active.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
    active.dispatchEvent(new EditorFixtureEvent('focusout', { bubbles: true, relatedTarget: fixture.host }));
    assert.equal(root.querySelector('.markdown-editor-active-source'), null);
    assert.equal(root.querySelector('p').textContent, 'Changed');
    editor.destroy();
  } finally { fixture.restore(); }
});

test('bold toolbar mouse-down preserves selection and toggles bold off on the second click', () => {
  const fixture = editorFixture('Text');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const bold = fixture.host.querySelector('[data-markdown-command="bold"]');
    let active = root.querySelector('.markdown-editor-active-source');
    active.setSelectionRange(0, 4);
    bold.dispatchEvent(new EditorFixtureEvent('mousedown', { bubbles: true }));
    bold.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    assert.equal(fixture.textarea.value, '**Text**');
    active = root.querySelector('.markdown-editor-active-source');
    bold.dispatchEvent(new EditorFixtureEvent('mousedown', { bubbles: true }));
    bold.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    assert.equal(fixture.textarea.value, 'Text');
    editor.destroy();
  } finally { fixture.restore(); }
});

test('horizontal rule previews as hr, activates as three hyphens, and toggles to an empty paragraph', () => {
  const fixture = editorFixture('---');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('hr').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    assert.equal(root.querySelector('.markdown-editor-active-source').value, '---');
    const rule = fixture.host.querySelector('[data-markdown-command="rule"]');
    rule.dispatchEvent(new EditorFixtureEvent('mousedown', { bubbles: true }));
    rule.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    assert.equal(fixture.textarea.value, '');
    assert.equal(root.querySelector('.markdown-editor-active-source').value, '');
    editor.destroy();
  } finally { fixture.restore(); }
});

test('Enter inside fenced code inserts a literal newline without submitting or creating a paragraph', () => {
  const fixture = editorFixture('```js\nfirst\n```');
  let submits = 0;
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks', onEmptyParagraphEnter: () => { submits += 1; } });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('pre').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    active.setSelectionRange(11, 11);
    const enter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
    active.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true);
    assert.equal(fixture.textarea.value, '```js\nfirst\n\n```');
    assert.equal(submits, 0);
    assert.equal(root.querySelectorAll('p').length, 0);
    editor.destroy();
  } finally { fixture.restore(); }
});

test('IME composition postpones parsing and preserves the textarea selection', () => {
  const fixture = editorFixture('Text');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    active.dispatchEvent(new EditorFixtureEvent('compositionstart', { bubbles: true }));
    active.value = '文字';
    active.setSelectionRange(2, 2);
    active.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true, isComposing: true }));
    assert.equal(root.querySelector('.markdown-editor-active-source'), active);
    active.dispatchEvent(new EditorFixtureEvent('compositionend', { bubbles: true }));
    assert.equal(fixture.textarea.value, '文字');
    assert.equal(active.selectionStart, 2);
    assert.equal(active.selectionEnd, 2);
    editor.destroy();
  } finally { fixture.restore(); }
});

test('preview task checkbox changes Markdown without activating source', () => {
  const fixture = editorFixture('- [ ] Task');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    const checkbox = root.querySelector('input');
    checkbox.checked = true;
    checkbox.dispatchEvent(new EditorFixtureEvent('change', { bubbles: true }));
    assert.equal(fixture.textarea.value, '- [x] Task');
    assert.equal(root.querySelector('.markdown-editor-active-source'), null);
    editor.destroy();
  } finally { fixture.restore(); }
});

test('matching external values preserve active source while new external values safely reconcile it', () => {
  const fixture = editorFixture('Text');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    active.value = 'Local';
    active.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
    fixture.textarea.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
    assert.equal(root.querySelector('.markdown-editor-active-source').value, 'Local');
    fixture.textarea.value = '# Remote';
    fixture.textarea.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
    assert.equal(root.querySelector('.markdown-editor-active-source'), null);
    assert.equal(root.querySelector('h1').textContent, 'Remote');
    editor.destroy();
  } finally { fixture.restore(); }
});

test('keeps the textarea bridge synchronized for active and external input', () => {
  const fixture = editorFixture('Before');
  const emitted = [];
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks', onChange: (value) => emitted.push(value) });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    active.value = 'After';
    active.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
    assert.equal(fixture.textarea.value, 'After');
    assert.deepEqual(emitted, ['After']);

    fixture.textarea.value = '# External';
    fixture.textarea.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
    assert.equal(root.querySelector('h1').textContent, 'External');

    fixture.textarea.value = 'Synced directly';
    editor.sync();
    assert.equal(root.querySelector('p').textContent, 'Synced directly');
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('preserves source focus and restores the original textarea on destroy', () => {
  const fixture = editorFixture('Source');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'source' });
    editor.focus();
    assert.equal(fixture.document.activeElement, fixture.textarea);
    assert.equal(fixture.host.querySelector('[data-markdown-editor-root="true"]'), null);

    editor.destroy();
    assert.deepEqual(fixture.host.children, [fixture.textarea]);
    assert.equal(fixture.textarea.parentElement, fixture.host);
  } finally {
    fixture.restore();
  }
});

test('uses source mode for whole-editor and cross-block replacements', () => {
  const whole = editorFixture('First\n\nSecond');
  try {
    const editor = mountMarkdownEditor(whole.textarea, { mode: 'source' });
    whole.textarea.setSelectionRange(0, whole.textarea.value.length);
    editor.insertText('Replacement');
    assert.equal(whole.textarea.value, 'Replacement');
    editor.destroy();
  } finally {
    whole.restore();
  }

  const crossBlock = editorFixture('First\n\nSecond');
  try {
    const editor = mountMarkdownEditor(crossBlock.textarea, { mode: 'source' });
    crossBlock.textarea.setSelectionRange(2, 10);
    editor.insertText('X');
    assert.equal(crossBlock.textarea.value, 'FiXond');
    editor.destroy();
  } finally {
    crossBlock.restore();
  }
});

test('activates a table as complete Markdown source without dismantling it', () => {
  const fixture = editorFixture('| Name |\n| --- |\n| Row |');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('table').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    assert.equal(active.value, '| Name |\n| --- |\n| Row |');
    const table = fixture.host.querySelector('[data-markdown-command="table"]');
    table.dispatchEvent(new EditorFixtureEvent('mousedown', { bubbles: true }));
    table.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    assert.equal(fixture.textarea.value, '| Name |\n| --- |\n| Row |');
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('submits after Enter creates an empty trailing line and Enter is pressed again', () => {
  const fixture = editorFixture('Finished work');
  let submits = 0;
  try {
    const editor = mountMarkdownEditor(fixture.textarea, {
      mode: 'blocks',
      onEmptyParagraphEnter: () => { submits += 1; },
    });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    active.setSelectionRange(active.value.length, active.value.length);

    const firstEnter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
    active.dispatchEvent(firstEnter);
    assert.equal(submits, 0);
    const secondEnter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
    active.dispatchEvent(secondEnter);

    assert.equal(secondEnter.defaultPrevented, true);
    assert.equal(submits, 1);
    assert.equal(fixture.textarea.value, 'Finished work\n');
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('submits on the second consecutive Enter in textarea editor modes', () => {
  for (const mode of ['simple', 'source']) {
    const fixture = editorFixture('Finished work');
    let submits = 0;
    try {
      const editor = mountMarkdownEditor(fixture.textarea, {
        mode,
        onEmptyParagraphEnter: () => { submits += 1; },
      });
      fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
      fixture.textarea.dispatchEvent(new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' }));
      fixture.textarea.value += '\n';
      fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
      fixture.textarea.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
      const secondEnter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
      fixture.textarea.dispatchEvent(secondEnter);

      assert.equal(secondEnter.defaultPrevented, true, `${mode} should prevent a second newline`);
      assert.equal(submits, 1, `${mode} should submit once`);
      editor.destroy();
    } finally {
      fixture.restore();
    }
  }
});

test('does not submit textarea modes after cursor movement, IME, or a newline inside text', () => {
  for (const mode of ['simple', 'source']) {
    const fixture = editorFixture('LeftRight');
    let submits = 0;
    try {
      const editor = mountMarkdownEditor(fixture.textarea, {
        mode,
        onEmptyParagraphEnter: () => { submits += 1; },
      });
      fixture.textarea.setSelectionRange(4, 4);
      fixture.textarea.dispatchEvent(new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' }));
      fixture.textarea.value = 'Left\nRight';
      fixture.textarea.setSelectionRange(5, 5);
      fixture.textarea.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
      const middleEnter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
      fixture.textarea.dispatchEvent(middleEnter);
      assert.equal(middleEnter.defaultPrevented, undefined, `${mode} should keep a non-empty line editable`);

      fixture.textarea.dispatchEvent(new EditorFixtureEvent('compositionstart', { bubbles: true }));
      const imeEnter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter', isComposing: true, keyCode: 229 });
      fixture.textarea.dispatchEvent(imeEnter);
      assert.equal(imeEnter.defaultPrevented, undefined, `${mode} should not submit during IME composition`);

      fixture.textarea.dispatchEvent(new EditorFixtureEvent('select', { bubbles: true }));
      fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
      const movedEnter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
      fixture.textarea.dispatchEvent(movedEnter);
      assert.equal(movedEnter.defaultPrevented, undefined, `${mode} should re-arm after selection changes`);
      assert.equal(submits, 0);
      editor.destroy();
    } finally {
      fixture.restore();
    }
  }
});

test('does not submit toolbar mode for modified Enter', () => {
  const fixture = editorFixture('Finished work');
  let submits = 0;
  try {
    const editor = mountMarkdownEditor(fixture.textarea, {
      mode: 'blocks',
      onEmptyParagraphEnter: () => { submits += 1; },
    });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    active.setSelectionRange(active.value.length, active.value.length);
    const shiftedEnter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter', shiftKey: true });
    active.dispatchEvent(shiftedEnter);
    assert.equal(shiftedEnter.defaultPrevented, undefined);
    assert.equal(submits, 0);
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('does not intercept consecutive Enter when no submit callback is configured', () => {
  const fixture = editorFixture('Regular note');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'simple' });
    fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
    fixture.textarea.dispatchEvent(new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' }));
    fixture.textarea.value += '\n';
    fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
    const secondEnter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
    fixture.textarea.dispatchEvent(secondEnter);

    assert.equal(secondEnter.defaultPrevented, undefined);
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('delegates task checkbox changes and rerenders its preview row', () => {
  const fixture = editorFixture('- [ ] Task');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    const item = root.querySelector('li');
    const checkbox = root.querySelector('input');
    assert.equal(item.firstChild, checkbox);
    assert.equal(item.childNodes[1].textContent, 'Task');

    checkbox.checked = true;
    checkbox.dispatchEvent(new EditorFixtureEvent('change', { bubbles: true }));
    assert.equal(fixture.textarea.value, '- [x] Task');
    assert.notEqual(root.querySelector('input'), checkbox);
    assert.equal(root.querySelector('input').checked, true);
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('keeps list-local multiline replacement inside the task list', () => {
  const fixture = editorFixture('- [x] Parent\n  - Nested child\n- [ ] Sibling');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelectorAll('li')[0].dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    active.setSelectionRange(0, active.value.length);
    const paste = new EditorFixtureEvent('paste', {
      bubbles: true,
      clipboardData: { getData: () => '- [x] Updated\n- [x] Second' },
    });
    active.dispatchEvent(paste);

    assert.equal(paste.defaultPrevented, true);
    assert.equal(
      fixture.textarea.value,
      '- [x] Updated\n  - Nested child\n- [x] Second\n- [ ] Sibling',
    );
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('preserves paragraph text around multiline paste in the middle', () => {
  const fixture = editorFixture('before after');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    const active = root.querySelector('.markdown-editor-active-source');
    active.setSelectionRange(7, 7);
    const paste = new EditorFixtureEvent('paste', {
      bubbles: true,
      clipboardData: { getData: () => 'First\n\nSecond' },
    });
    active.dispatchEvent(paste);

    assert.equal(paste.defaultPrevented, true);
    assert.equal(fixture.textarea.value, 'before First\n\nSecondafter');
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('does not run editor keyboard transactions from the toolbar', () => {
  const fixture = editorFixture('Text');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'blocks' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    const text = root.querySelector('p').firstChild;
    setEditorFixtureSelection(fixture.document, text, 0, text, 4);
    const toolbarButton = fixture.host.querySelector('[data-markdown-command="bold"]');
    const keyboard = new EditorFixtureEvent('keydown', {
      bubbles: true,
      key: 'b',
      ctrlKey: true,
    });
    toolbarButton.dispatchEvent(keyboard);

    assert.equal(keyboard.defaultPrevented, undefined);
    assert.equal(fixture.textarea.value, 'Text');
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('simple mode keeps the textarea and wraps selected Markdown directly', () => {
  const fixture = editorFixture('Text');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'simple' });
    const toolbarButton = fixture.host.querySelector('[data-markdown-command="bold"]');

    fixture.textarea.focus();
    fixture.textarea.setSelectionRange(0, 4);
    toolbarButton.dispatchEvent(new EditorFixtureEvent('mousedown', { bubbles: true }));
    toolbarButton.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));

    assert.equal(fixture.textarea.value, '**Text**');
    assert.equal(fixture.textarea.selectionStart, 2);
    assert.equal(fixture.textarea.selectionEnd, 6);
    assert.equal(fixture.host.querySelector('[data-markdown-editor-root="true"]'), null);
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('simple mode inserts empty bold markers at the textarea caret', () => {
  const fixture = editorFixture('Text');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'simple' });
    const toolbarButton = fixture.host.querySelector('[data-markdown-command="bold"]');

    fixture.textarea.focus();
    fixture.textarea.setSelectionRange(4, 4);
    toolbarButton.dispatchEvent(new EditorFixtureEvent('mousedown', { bubbles: true }));
    toolbarButton.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));

    assert.equal(fixture.textarea.value, 'Text** **');
    assert.equal(fixture.textarea.selectionStart, 6);
    assert.equal(fixture.textarea.selectionEnd, 7);
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('toolbar editor edits the whole document without normalizing whitespace on blur', () => {
  const original = '同時請求數    每分鐘處理量\n12            264\n16            305\n\n\n最後一段  \n';
  const fixture = editorFixture(original);
  try {
    const emitted = [];
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar', onChange: (value) => emitted.push(value) });
    assert.equal(fixture.textarea.hidden, false, 'the original full-document textarea should be editable');
    editor.focus();
    fixture.textarea.value = `${original}新增一行`;
    fixture.textarea.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
    fixture.textarea.dispatchEvent(new EditorFixtureEvent('focusout', { bubbles: true }));
    assert.equal(editor.getValue(), `${original}新增一行`);
    assert.deepEqual(emitted, [`${original}新增一行`]);
    assert.equal(fixture.host.querySelector('.markdown-editor-active-source'), null);
    editor.destroy();
  } finally { fixture.restore(); }
});

test('toolbar formatting changes only selected text across paragraphs and toggles back', () => {
  const fixture = editorFixture('Before  \n\n\nText\n\nAfter  ');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar' });
    editor.focus();
    fixture.textarea.setSelectionRange(11, 15);
    const button = fixture.host.querySelector('[data-markdown-command="bold"]');
    button.dispatchEvent(new EditorFixtureEvent('mousedown', { bubbles: true }));
    button.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    assert.equal(editor.getValue(), 'Before  \n\n\n**Text**\n\nAfter  ');
    button.dispatchEvent(new EditorFixtureEvent('mousedown', { bubbles: true }));
    button.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    assert.equal(editor.getValue(), 'Before  \n\n\nText\n\nAfter  ');
    editor.destroy();
  } finally { fixture.restore(); }
});

test('toolbar editor grows with pasted or externally synchronized long notes', () => {
  const fixture = editorFixture('Short');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar' });
    fixture.textarea.scrollHeight = 900;
    fixture.textarea.value = 'row\n'.repeat(40);
    fixture.textarea.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
    assert.ok(Number.parseFloat(fixture.textarea.style.height) >= 900);
    assert.equal(fixture.textarea.style.overflowY, 'hidden');
    fixture.textarea.scrollHeight = 1200;
    fixture.textarea.value += 'more\n'.repeat(20);
    editor.sync();
    assert.ok(Number.parseFloat(fixture.textarea.style.height) >= 1200);
    editor.destroy();
  } finally { fixture.restore(); }
});

test('toolbar shortcuts format text but leave Enter and IME to native textarea input', () => {
  const fixture = editorFixture('Text');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar' });
    editor.focus();
    fixture.textarea.setSelectionRange(0, 4);
    const bold = new EditorFixtureEvent('keydown', { bubbles: true, key: 'b', ctrlKey: true });
    fixture.textarea.dispatchEvent(bold);
    assert.equal(editor.getValue(), '**Text**');
    assert.equal(bold.defaultPrevented, true);
    const enter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
    fixture.textarea.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, undefined);
    const composing = new EditorFixtureEvent('keydown', { bubbles: true, key: 'b', ctrlKey: true, isComposing: true });
    fixture.textarea.dispatchEvent(composing);
    assert.equal(composing.defaultPrevented, undefined);
    assert.equal(editor.getValue(), '**Text**');
    editor.destroy();
  } finally { fixture.restore(); }
});

test('consecutive Enter inside fenced source never submits the note form', () => {
  const fixture = editorFixture('```js\nconst value = 1;');
  let submits = 0;
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar', onEmptyParagraphEnter: () => { submits += 1; } });
    fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
    fixture.textarea.dispatchEvent(new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' }));
    fixture.textarea.value += '\n';
    fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
    fixture.textarea.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
    const secondEnter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
    fixture.textarea.dispatchEvent(secondEnter);
    assert.equal(submits, 0);
    assert.equal(secondEnter.defaultPrevented, undefined);
    editor.destroy();
  } finally { fixture.restore(); }
});

test('keyboard formatting after preview uses the new textarea selection', () => {
  const fixture = editorFixture('One Two');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar' });
    const preview = fixture.host.querySelector('[data-markdown-preview-toggle]');
    fixture.textarea.setSelectionRange(0, 3);
    preview.dispatchEvent(new EditorFixtureEvent('mousedown', { bubbles: true }));
    preview.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    preview.dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    fixture.textarea.setSelectionRange(4, 7);
    fixture.host.querySelector('[data-markdown-command="bold"]').dispatchEvent(new EditorFixtureEvent('click', { bubbles: true }));
    assert.equal(editor.getValue(), 'One **Two**');
    editor.destroy();
  } finally { fixture.restore(); }
});
