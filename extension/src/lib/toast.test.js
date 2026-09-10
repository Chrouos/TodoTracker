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
