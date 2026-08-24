/**
 * Clone a JSON-serializable Markdown block tree.
 * @param {import('./index.d.ts').Block[]} blocks
 * @returns {import('./index.d.ts').Block[]}
 */
export function cloneBlocks(blocks) {
  return blocks.map(cloneNode);
}

/**
 * Find a task item by a numeric path. The first index selects a top-level
 * block; list indexes select items and quote indexes select quote blocks.
 * @param {import('./index.d.ts').Block[]} blocks
 * @param {number[]} path
 * @returns {import('./index.d.ts').TaskItem}
 */
export function pathToItem(blocks, path) {
  const location = resolveLocation(blocks, path);
  return location.list[location.index];
}

/**
 * Apply an immutable update to the task item selected by a nested path.
 * @param {import('./index.d.ts').Block[]} blocks
 * @param {number[]} path
 * @param {(item: import('./index.d.ts').TaskItem) => import('./index.d.ts').TaskItem} updater
 * @returns {import('./index.d.ts').Block[]}
 */
export function updateAtPath(blocks, path, updater) {
  assertPath(path);
  const next = cloneBlocks(blocks);
  const location = resolveLocation(next, path);
  const item = location.list[location.index];
  const updated = updater(item);
  if (!updated || typeof updated !== 'object') throw new TypeError('Updater must return a task item');
  location.list[location.index] = updated;
  return next;
}

function resolveLocation(blocks, path) {
  assertPath(path);
  const block = blocks[path[0]];
  if (!block) throw new RangeError('Path does not reference a Markdown block');
  return resolveBlock(block, path.slice(1));
}

function resolveBlock(block, path) {
  if (block.type === 'taskList') return resolveTaskList(block.items, path);
  if (block.type === 'list') return resolveList(block.items, path);
  if (block.type === 'quote') {
    const [blockIndex, ...nestedPath] = path;
    const child = block.blocks?.[blockIndex];
    if (!child || !nestedPath.length) throw new RangeError('Path does not reference a quoted task block');
    return resolveBlock(child, nestedPath);
  }
  throw new RangeError('Path does not reference a task list block');
}

function resolveTaskList(list, path) {
  const index = path[0];
  const item = list[index];
  if (!item) throw new RangeError('Path does not reference a task item');
  if (path.length === 1) return { list, index };
  return resolveChildBlock(item.children, path.slice(1));
}

function resolveList(list, path) {
  const item = list[path[0]];
  if (!item || path.length === 1) throw new RangeError('Path does not reference a nested task list');
  return resolveChildBlock(item.children, path.slice(1));
}

function resolveChildBlock(children, path) {
  const child = children.find((block) => ['list', 'quote', 'taskList'].includes(block.type));
  if (!child) throw new RangeError('Path does not reference a nested task list');
  return resolveBlock(child, path);
}

function cloneNode(value) {
  if (Array.isArray(value)) return value.map(cloneNode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneNode(child)]));
  return value;
}

function assertPath(path) {
  if (!Array.isArray(path) || path.length < 2 || path.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new TypeError('Path must contain at least two non-negative integer indexes');
  }
}
