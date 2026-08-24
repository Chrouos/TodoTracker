import { cloneBlocks } from './ast.js';

export function detectMarkdownShortcut(value) {
  if (typeof value !== 'string' || !/^.* $/.test(value)) return null;
  if (/^#{1,6} $/.test(value)) return { type: 'heading', level: value.length - 1 };
  if (/^[-+*] \[ \] $/.test(value)) return { type: 'task', checked: false };
  if (/^[-+*] \[[xX]\] $/.test(value)) return { type: 'task', checked: true };
  if (/^[-+*] $/.test(value)) return { type: 'list', ordered: false };
  if (/^\d+[.)] $/.test(value)) return { type: 'list', ordered: true };
  return null;
}

export function continueBlock(blocks, path) {
  const next = cloneBlocks(blocks);
  const location = resolve(next, path);
  const source = location.list[location.index];
  location.list.splice(location.index + 1, 0, emptyItem(source));
  return next;
}

export function exitEmptyBlock(blocks, path) {
  const next = cloneBlocks(blocks);
  const location = resolve(next, path);
  if (!isEmptyItem(location.item)) return next;
  location.list.splice(location.index, 1);
  const paragraph = { type: 'paragraph', inlines: [] };
  location.container.splice(location.containerIndex + 1, 0, paragraph);
  if (!location.list.length) location.container.splice(location.containerIndex, 1);
  return next;
}

export function indentListItem(blocks, path, direction) {
  const next = cloneBlocks(blocks);
  const location = resolve(next, path);
  if (direction === 'in') {
    if (location.index === 0) return next;
    const previous = location.list[location.index - 1];
    const child = previous.children.find((block) => block.type === location.block.type);
    const nested = child ?? { type: location.block.type, ...(location.block.type === 'list' ? { ordered: location.block.ordered } : {}), items: [] };
    if (!child) previous.children.push(nested);
    nested.items.push(location.list.splice(location.index, 1)[0]);
    return next;
  }
  if (direction === 'out' && location.parent) {
    const parentIndex = location.parent.index;
    const parentItem = location.parent.list[parentIndex];
    location.list.splice(location.index, 1);
    location.parent.list.splice(parentIndex + 1, 0, location.item);
    if (!location.list.length) parentItem.children.splice(location.blockIndex, 1);
  }
  return next;
}

export function toggleTaskItem(blocks, path) {
  const next = cloneBlocks(blocks);
  const location = resolve(next, path);
  if (location.block.type !== 'taskList') return next;
  location.item.checked = !location.item.checked;
  return next;
}

function emptyItem(item) {
  return item.checked === undefined ? { inlines: [], children: [] } : { checked: false, inlines: [], children: [] };
}

function isEmptyItem(item) {
  return item.children.length === 0 && item.inlines.every((inline) => {
    if (inline.type === 'text' || inline.type === 'code') return !inline.inlines && !inline.value;
    return Array.isArray(inline.inlines) && inline.inlines.length === 0;
  });
}

function resolve(blocks, path) {
  if (!Array.isArray(path) || path.length < 2) throw new TypeError('Path must contain at least two indexes');
  return descend(blocks, path[0], path.slice(1), null);
}

function descend(container, blockIndex, path, parent) {
  const block = container[blockIndex];
  if (block?.type === 'quote') {
    const quotedIndex = path[0];
    if (!block.blocks?.[quotedIndex]) throw new RangeError('Path does not reference a quoted block');
    // A quote is a container boundary: outdent may not cross it into an
    // ancestor list that happens to contain the quote block.
    return descendBlock(block.blocks[quotedIndex], block.blocks, quotedIndex, path.slice(1), null);
  }
  return descendBlock(block, container, blockIndex, path, parent);
}

function descendBlock(block, container, blockIndex, path, parent) {
  if (!block || !['list', 'taskList'].includes(block.type)) throw new RangeError('Path does not reference a list block');
  const index = path[0];
  const item = block.items[index];
  if (!item) throw new RangeError('Path does not reference a list item');
  if (path.length === 1) return { list: block.items, index, item, block, container, containerIndex: blockIndex, parent, blockIndex };
  const childIndex = item.children.findIndex((child) => ['list', 'taskList', 'quote'].includes(child.type));
  if (childIndex < 0) throw new RangeError('Path does not reference a nested list');
  return descend(item.children, childIndex, path.slice(1), { list: block.items, index, item, block, container: item.children, blockIndex: childIndex });
}
