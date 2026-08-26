import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdown } from '../../shared/markdown/index.js';
import {
  blockPathForNode,
  inlineValueFromDom,
  readEditableBlocks,
  readEditorSelection,
  renderEditableBlocks,
  restoreEditorSelection,
} from './markdown-dom.ts';
import { readEditableBlocks as readExtensionEditableBlocks } from '../../extension/src/lib/markdown-dom.js';

class FixtureText {
  constructor(value, ownerDocument) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
  }

  get textContent() {
    return this.nodeValue;
  }

  set textContent(value) {
    this.nodeValue = String(value);
  }
}

class FixtureElement {
  constructor(tagName, ownerDocument) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.childNodes = [];
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.contentEditable = 'inherit';
    this._href = '';
  }

  get href() {
    return this._href;
  }

  set href(value) {
    this._href = this.tagName === 'A' ? new URL(String(value), 'https://example.com/').toString() : String(value);
  }

  append(...nodes) {
    nodes.forEach((node) => {
      if (typeof node === 'string') node = new FixtureText(node, this.ownerDocument);
      node.parentElement = this;
      this.childNodes.push(node);
      if (node.nodeType === 1) this.children.push(node);
    });
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent ?? '').join('');
  }

  set textContent(value) {
    this.childNodes = [];
    this.children = [];
    if (value) this.append(new FixtureText(String(value), this.ownerDocument));
  }

  querySelector(selector) {
    return walk(this, (node) => node !== this && node.nodeType === 1 && matches(node, selector));
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matches(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
}

class FixtureRange {
  setStart(node, offset) {
    this.startContainer = node;
    this.startOffset = offset;
  }

  setEnd(node, offset) {
    this.endContainer = node;
    this.endOffset = offset;
  }
}

class FixtureSelection {
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

class FixtureDocument {
  constructor() {
    this.selection = new FixtureSelection();
  }

  createElement(tagName) {
    return new FixtureElement(tagName, this);
  }

  createRange() {
    return new FixtureRange();
  }

  getSelection() {
    return this.selection;
  }
}

function walk(root, predicate) {
  for (const child of root.childNodes ?? []) {
    if (predicate(child)) return child;
    const match = walk(child, predicate);
    if (match) return match;
  }
  return null;
}

function matches(element, selector) {
  const presentAttribute = selector.match(/^\[data-([\w-]+)\]$/);
  if (presentAttribute) return toDatasetKey(presentAttribute[1]) in element.dataset;
  const attribute = selector.match(/^\[data-([\w-]+)="([^"]+)"\]$/);
  if (attribute) return element.dataset[toDatasetKey(attribute[1])] === attribute[2];
  return element.tagName === selector.toUpperCase();
}

function toDatasetKey(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function fixtureRoot() {
  const document = new FixtureDocument();
  return { document, root: document.createElement('div') };
}

const fixtureBlocks = parseMarkdown([
  'Plain **bold** *italic* `code` [safe](https://example.com)',
  '',
  '# Heading',
  '',
  '- unordered',
  '',
  '1. ordered',
  '',
  '- [x] task',
  '',
  '> quoted',
  '',
  '```js',
  'const value = 1;',
  '```',
  '',
  '---',
  '',
  '| Name | Done |',
  '| :--- | ---: |',
  '| alpha | yes |',
].join('\n'));

test('renders semantic Markdown blocks with stable paths and one editable root', () => {
  const { root } = fixtureRoot();
  renderEditableBlocks(root, fixtureBlocks);

  assert.equal(root.contentEditable, 'true');
  assert.equal(root.querySelector('p').dataset.blockPath, '0');
  assert.equal(root.querySelector('h1').dataset.blockPath, '1');
  assert.equal(root.querySelector('ul').dataset.blockPath, '2');
  assert.equal(root.querySelector('ol').dataset.blockPath, '3');
  assert.equal(root.querySelector('blockquote').dataset.blockPath, '5');
  assert.equal(root.querySelector('pre').dataset.blockPath, '6');
  assert.equal(root.querySelector('hr').dataset.blockPath, '7');
  assert.equal(root.querySelector('table').dataset.blockPath, '8');
  assert.equal(root.querySelector('strong').tagName, 'STRONG');
  assert.equal(root.querySelector('em').tagName, 'EM');
  assert.equal(root.querySelector('code').tagName, 'CODE');

  const taskInput = walk(root, (node) => node.tagName === 'INPUT');
  assert.equal(taskInput.contentEditable, 'false');
  assert.equal(taskInput.dataset.markdownTaskPath, '4.0');
  assert.deepEqual(blockPathForNode(taskInput), [4, 0]);
  assert.equal(walk(root, (node) => node !== root && node.nodeType === 1 && node.contentEditable === 'true'), null);
});

test('round-trips every supported block and reads unknown blocks as paragraphs', () => {
  const { document, root } = fixtureRoot();
  renderEditableBlocks(root, fixtureBlocks);
  assert.deepEqual(readEditableBlocks(root, []), fixtureBlocks);

  const unknown = document.createElement('aside');
  unknown.textContent = 'kept as text';
  root.append(unknown);
  assert.deepEqual(readEditableBlocks(root, []).at(-1), {
    type: 'paragraph',
    inlines: [{ type: 'text', value: 'kept as text' }],
  });
});

test('reads inline marks and only retains safe links', () => {
  const { document } = fixtureRoot();
  const container = document.createElement('span');
  const strong = document.createElement('strong');
  strong.textContent = 'bold';
  const link = document.createElement('a');
  link.href = 'https://example.com/docs';
  link.textContent = 'docs';
  const unsafe = document.createElement('a');
  unsafe.href = 'javascript:alert(1)';
  unsafe.textContent = 'plain';
  container.append(strong, ' ', link, ' ', unsafe);

  assert.deepEqual(inlineValueFromDom(container), [
    { type: 'strong', inlines: [{ type: 'text', value: 'bold' }] },
    { type: 'text', value: ' ' },
    { type: 'link', url: 'https://example.com/docs', inlines: [{ type: 'text', value: 'docs' }] },
    { type: 'text', value: ' plain' },
  ]);
});

test('preserves the original safe Markdown URL when the browser normalizes href', () => {
  const { root } = fixtureRoot();
  const blocks = [{ type: 'paragraph', inlines: [{
    type: 'link',
    url: 'https://example.com/a/../docs',
    inlines: [{ type: 'text', value: 'docs' }],
  }] }];
  renderEditableBlocks(root, blocks);

  const link = root.querySelector('a');
  assert.equal(link.href, 'https://example.com/docs');
  assert.deepEqual(readEditableBlocks(root, []), blocks);
});

test('keeps unknown nested quote content as a paragraph', () => {
  const { document, root } = fixtureRoot();
  const quote = document.createElement('blockquote');
  quote.dataset.blockPath = '0';
  const unknown = document.createElement('aside');
  unknown.textContent = 'nested text';
  quote.append(unknown);
  root.append(quote);

  assert.deepEqual(readEditableBlocks(root, []), [{
    type: 'quote',
    blocks: [{ type: 'paragraph', inlines: [{ type: 'text', value: 'nested text' }] }],
  }]);
});

test('matches the Extension adapter for unknown list descendants without duplicating inline text', () => {
  const { document, root } = fixtureRoot();
  const list = document.createElement('ul');
  const item = document.createElement('li');
  const unknown = document.createElement('div');
  unknown.textContent = 'pasted child';
  item.append('item ', unknown);
  list.append(item);
  root.append(list);

  const expected = [{
    type: 'list',
    ordered: false,
    items: [{
      inlines: [{ type: 'text', value: 'item ' }],
      children: [{ type: 'paragraph', inlines: [{ type: 'text', value: 'pasted child' }] }],
    }],
  }];
  const webBlocks = readEditableBlocks(root, []);

  assert.deepEqual(webBlocks, expected);
  assert.deepEqual(webBlocks, readExtensionEditableBlocks(root, []));
});

test('converts direct root text into a paragraph instead of using fallback', () => {
  const { root } = fixtureRoot();
  root.textContent = 'direct text';

  assert.deepEqual(readEditableBlocks(root, [{ type: 'heading', level: 1, inlines: [] }]), [{
    type: 'paragraph',
    inlines: [{ type: 'text', value: 'direct text' }],
  }]);
});

test('maps and restores logical selections by counting text nodes inside a block', () => {
  const { document, root } = fixtureRoot();
  renderEditableBlocks(root, fixtureBlocks);
  const boldText = root.querySelector('strong').firstChild;
  const range = document.createRange();
  range.setStart(boldText, 1);
  range.setEnd(boldText, 3);
  document.getSelection().addRange(range);

  assert.deepEqual(readEditorSelection(root), {
    anchor: { path: [0], offset: 7 },
    focus: { path: [0], offset: 9 },
  });

  restoreEditorSelection(root, {
    anchor: { path: [0], offset: 7 },
    focus: { path: [0], offset: 9 },
  });
  assert.deepEqual(readEditorSelection(root), {
    anchor: { path: [0], offset: 7 },
    focus: { path: [0], offset: 9 },
  });

  restoreEditorSelection(root, {
    anchor: { path: [99], offset: 0 },
    focus: { path: [99], offset: 0 },
  });
  assert.deepEqual(readEditorSelection(root), {
    anchor: { path: [5, 0], offset: 0 },
    focus: { path: [5, 0], offset: 0 },
  });
});
