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
    '- Parent\n  - Plain child\n  - [x] Nested task\n\n- [ ] Sibling task',
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

test('mounts one editable root and no independently editable descendants', () => {
  const fixture = editorFixture();
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar' });
    const wrapper = fixture.host.querySelector('.markdown-editor');
    const root = wrapper.querySelector('[data-markdown-editor-root="true"]');

    assert.equal(root.contentEditable, 'true');
    assert.equal(root.querySelectorAll('[contenteditable="true"]').length, 0);
    assert.equal(root.querySelectorAll('[data-editor-surface="true"]').length, 0);
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('keeps the textarea bridge synchronized for root and external input', () => {
  const fixture = editorFixture('Before');
  const emitted = [];
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar', onChange: (value) => emitted.push(value) });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    root.querySelector('p').textContent = 'After';
    root.dispatchEvent(new EditorFixtureEvent('input', { bubbles: true }));
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

test('replaces whole-editor and native cross-block selections through root beforeinput', () => {
  const whole = editorFixture('First\n\nSecond');
  try {
    const editor = mountMarkdownEditor(whole.textarea, { mode: 'toolbar' });
    const root = whole.host.querySelector('[data-markdown-editor-root="true"]');
    setEditorFixtureSelection(whole.document, root, 0, root, root.childNodes.length);
    const wholeInput = new EditorFixtureEvent('beforeinput', {
      bubbles: true,
      inputType: 'insertText',
      data: 'Replacement',
    });
    root.dispatchEvent(wholeInput);
    assert.equal(wholeInput.defaultPrevented, true);
    assert.equal(whole.textarea.value, 'Replacement');
    editor.destroy();
  } finally {
    whole.restore();
  }

  const crossBlock = editorFixture('First\n\nSecond');
  try {
    const editor = mountMarkdownEditor(crossBlock.textarea, { mode: 'toolbar' });
    const root = crossBlock.host.querySelector('[data-markdown-editor-root="true"]');
    const paragraphs = root.querySelectorAll('p');
    setEditorFixtureSelection(crossBlock.document, paragraphs[0].firstChild, 2, paragraphs[1].firstChild, 3);
    const nativeInput = new EditorFixtureEvent('beforeinput', {
      bubbles: true,
      inputType: 'insertText',
      data: 'X',
    });
    root.dispatchEvent(nativeInput);
    assert.equal(nativeInput.defaultPrevented, true);
    assert.equal(crossBlock.textarea.value, 'FiXond');

    const arrow = new EditorFixtureEvent('keydown', { bubbles: true, key: 'ArrowDown' });
    root.dispatchEvent(arrow);
    assert.equal(arrow.defaultPrevented, undefined);
    editor.destroy();
  } finally {
    crossBlock.restore();
  }
});

test('continues after a table and removes it from the following empty paragraph', () => {
  const fixture = editorFixture('| Name |\n| --- |\n| Row |');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    const cell = root.querySelector('td');
    setEditorFixtureSelection(fixture.document, cell.firstChild, 3);
    const enter = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Enter' });
    root.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true);
    assert.deepEqual(root.children.map((element) => element.tagName), ['TABLE', 'P']);

    const paragraph = root.querySelector('p');
    setEditorFixtureSelection(fixture.document, paragraph, 0);
    const backspace = new EditorFixtureEvent('keydown', { bubbles: true, key: 'Backspace' });
    root.dispatchEvent(backspace);
    assert.equal(backspace.defaultPrevented, true);
    assert.deepEqual(root.children.map((element) => element.tagName), ['P']);
    assert.equal(fixture.textarea.value, '');
    editor.destroy();
  } finally {
    fixture.restore();
  }
});

test('delegates task checkbox changes while keeping checkbox and text in one list row', () => {
  const fixture = editorFixture('- [ ] Task');
  try {
    const editor = mountMarkdownEditor(fixture.textarea, { mode: 'toolbar' });
    const root = fixture.host.querySelector('[data-markdown-editor-root="true"]');
    const item = root.querySelector('li');
    const checkbox = root.querySelector('input');
    assert.equal(item.firstChild, checkbox);
    assert.equal(item.childNodes[1].textContent, 'Task');

    checkbox.checked = true;
    checkbox.dispatchEvent(new EditorFixtureEvent('change', { bubbles: true }));
    assert.equal(fixture.textarea.value, '- [x] Task');
    assert.equal(root.querySelector('input'), checkbox);
    editor.destroy();
  } finally {
    fixture.restore();
  }
});
