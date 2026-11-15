import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTargetIndex } from '../src/tab-positioning.js';

const tabs = [
  { id: 1, index: 0, pinned: true, active: false },
  { id: 2, index: 1, pinned: false, active: false },
  { id: 3, index: 2, pinned: false, active: true },
  { id: 4, index: 3, pinned: false, active: false }
];
const newTab = { id: 4, index: 3, pinned: false, active: false };

test('first places after pinned tabs', () => {
  assert.equal(calculateTargetIndex({ position: 'first', tab: newTab, tabs }), 1);
});

test('last places at final index', () => {
  assert.equal(calculateTargetIndex({ position: 'last', tab: newTab, tabs }), 3);
});

test('right of anchor', () => {
  assert.equal(calculateTargetIndex({ position: 'right-of-current', tab: newTab, tabs, anchorTabId: 2 }), 2);
});

test('left of anchor', () => {
  assert.equal(calculateTargetIndex({ position: 'left-of-current', tab: newTab, tabs, anchorTabId: 3 }), 2);
});

test('right of the last pinned anchor stays after pinned tabs', () => {
  assert.equal(calculateTargetIndex({
    position: 'right-of-current',
    tab: newTab,
    tabs,
    anchorTabId: 1
  }), 1);
});

test('left of the first unpinned anchor stays after pinned tabs', () => {
  assert.equal(calculateTargetIndex({
    position: 'left-of-current',
    tab: newTab,
    tabs,
    anchorTabId: 2
  }), 1);
});

test('does not position browser-default tabs', () => {
  assert.equal(calculateTargetIndex({ position: 'default', tab: newTab, tabs }), null);
});
