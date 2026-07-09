import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueueWindow } from '../../src/lib/playback/playbackSnapshot';

test('keeps short queues unchanged', () => {
  const queue = Array.from({ length: 6 }, (_, index) => `song-${index}`);
  const window = createQueueWindow(queue, 4, 100);

  assert.deepEqual(window.items, queue);
  assert.equal(window.index, 4);
  assert.equal(window.start, 0);
});

test('keeps the active track inside a long queue snapshot', () => {
  const queue = Array.from({ length: 180 }, (_, index) => `song-${index}`);
  const window = createQueueWindow(queue, 140, 100);

  assert.equal(window.items.length, 100);
  assert.equal(window.items[window.index], 'song-140');
  assert.equal(window.start + window.index, 140);
});

test('handles long-queue boundaries without losing the active track', () => {
  const queue = Array.from({ length: 180 }, (_, index) => `song-${index}`);

  const start = createQueueWindow(queue, 2, 100);
  assert.equal(start.start, 0);
  assert.equal(start.items[start.index], 'song-2');

  const end = createQueueWindow(queue, 178, 100);
  assert.equal(end.start, 80);
  assert.equal(end.items[end.index], 'song-178');
});
