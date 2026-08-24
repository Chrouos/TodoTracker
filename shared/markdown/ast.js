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
  assertPath(path);
  const block = blocks[path[0]];
  if (!block || block.type !== 'taskList') throw new RangeError('Path does not reference a task list block');
  let item = block.items[path[1]];
  if (!item) throw new RangeError('Path does not reference a task item');
  for (const itemIndex of path.slice(2)) {
    const childList = item.children[itemIndex];
    if (!childList || childList.type !== 'taskList') throw new RangeError('Path does not reference a nested task list');
    item = childList.items[0];
    if (!item) throw new RangeError('Path does not reference a task item');
  }
  return item;
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
  const block = next[path[0]];
  if (!block || block.type !== 'taskList') throw new RangeError('Path does not reference a task list block');
  let item = block.items[path[1]];
  if (!item) throw new RangeError('Path does not reference a task item');
  for (const itemIndex of path.slice(2)) {
    const childList = item.children[itemIndex];
    if (!childList || childList.type !== 'taskList' || !childList.items[0]) throw new RangeError('Path does not reference a nested task item');
    item = childList.items[0];
  }
  const updated = updater(item);
  if (!updated || typeof updated !== 'object') throw new TypeError('Updater must return a task item');
  if (path.length === 2) block.items[path[1]] = updated;
  else {
    let parent = block.items[path[1]];
    for (const itemIndex of path.slice(2, -1)) parent = parent.children[itemIndex].items[0];
    parent.children[path.at(-1)].items[0] = updated;
  }
  return next;
}

function cloneNode(value) {
  if (Array.isArray(value)) return value.map(cloneNode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneNode(child)]));
  return value;
}

function assertPath(path) {
  if (!Array.isArray(path) || path.length < 2 || path.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new TypeError('Path must be a non-empty array of non-negative integers');
  }
}
