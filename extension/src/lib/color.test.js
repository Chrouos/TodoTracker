import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, readableTextColor } from './color.js';

test('readableTextColor picks the higher contrast option', () => {
  assert.equal(readableTextColor('#201d1d'), '#ffffff');
  assert.equal(readableTextColor('#f5d90a'), '#000000');
  assert.equal(readableTextColor('#c08a2e'), '#000000');
});

test('readableTextColor always reaches 4.5:1 for project colors', () => {
  for (const color of ['#427bba', '#5b8fd0', '#708653', '#c08a2e', '#201d1d', '#ffffff', '#ff3b30']) {
    assert.ok(contrastRatio(color, readableTextColor(color)) >= 4.5, color);
  }
});

test('readableTextColor falls back on invalid colors', () => {
  assert.equal(readableTextColor('not-a-color'), '#ffffff');
  assert.equal(readableTextColor(undefined), '#ffffff');
});
