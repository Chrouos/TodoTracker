import test from 'node:test';
import assert from 'node:assert/strict';
import { createToast } from './toast.js';

test('shows the latest toast and cancels the previous hide timer', () => {
  const classes = new Set();
  const element = {
    textContent: '',
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
  };
  const timers = [];
  const cleared = [];
  const showToast = createToast(element, {
    duration: 1500,
    setTimer: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => cleared.push(timer),
  });

  showToast('Todo 已新增');
  showToast('Todo 已完成');

  assert.equal(classes.has('is-visible'), true);
  assert.equal(element.textContent, 'Todo 已完成');
  assert.equal(timers[1].delay, 1500);
  assert.deepEqual(cleared, [timers[0]]);

  timers[1].callback();
  assert.equal(classes.has('is-visible'), false);
  assert.equal(element.textContent, '');
});

test('toast action runs its callback once and hides the toast', () => {
  const classes = new Set();
  const appended = [];
  const element = {
    textContent: '',
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    append: (node) => appended.push(node),
  };
  const button = { addEventListener: (type, callback) => { button[type] = callback; } };
  const delays = [];
  let undone = 0;
  const showToast = createToast(element, {
    setTimer: (callback, delay) => { delays.push(delay); return {}; },
    clearTimer: () => {},
    doc: { createElement: () => button },
  });

  showToast('已刪除紀錄', { action: { label: '復原', onClick: () => { undone += 1; } } });
  assert.equal(button.textContent, '復原');
  assert.deepEqual(appended, [button]);
  assert.equal(classes.has('has-action'), true);
  assert.deepEqual(delays, [6000]);

  button.click();
  assert.equal(undone, 1);
  assert.equal(classes.has('is-visible'), false);
  assert.equal(classes.has('has-action'), false);
  assert.equal(element.textContent, '');
});
