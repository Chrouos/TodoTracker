/**
 * Clone a JSON-serializable Markdown block tree.
 * @param {import('./index.d.ts').Block[]} blocks
 * @returns {import('./index.d.ts').Block[]}
 */
export function cloneBlocks(blocks) {
  return blocks.map(cloneNode);
}

/**
 * Find a task item by a path of block index followed by one item index per
 * nested task-list level.
 * @param {import('./index.d.ts').Block[]} blocks
 * @param {number[]} path
 * @returns {import('./index.d.ts').TaskItem}
 */
export function pathToItem(blocks, path) {
  return resolveLocation(blocks, path).list[resolveLocation(blocks, path).index];
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
  if (!block || block.type !== 'taskList') throw new RangeError('Path does not reference a task list block');
  let list = block.items;
  let item = list[path[1]];
  if (!item) throw new RangeError('Path does not reference a task item');
  for (const itemIndex of path.slice(2)) {
    const childList = item.children.find((child) => child.type === 'taskList');
    if (!childList) throw new RangeError('Path does not reference a nested task list');
    list = childList.items;
    item = list[itemIndex];
    if (!item) throw new RangeError('Path does not reference a task item');
  }
  return { list, index: path.at(-1) };
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
