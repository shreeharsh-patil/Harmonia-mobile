import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQueueWindow,
  shouldPersistPlaybackSnapshot,
} from '../../src/lib/playback/playbackSnapshot';

test('snapshot persists immediately on queue changes', () => {
  assert.equal(
    shouldPersistPlaybackSnapshot({ queueChanged: true, playingChanged: false, elapsedSeconds: 0 }),
    true
  );
});

test('snapshot persists immediately on play/pause transitions', () => {
  assert.equal(
    shouldPersistPlaybackSnapshot({ queueChanged: false, playingChanged: true, elapsedSeconds: 0 }),
    true
  );
});

test('snapshot write storm regression: paused position ticks do not persist', () => {
  // While paused the position never advances, so the 500ms status tick
  // produces elapsedSeconds of 0 forever. This is exactly the case the old
  // "only throttle while playing" guard mishandled: it wrote the whole queue
  // JSON every tick. It must never persist below the throttle window.
  for (let tick = 0; tick < 60; tick += 1) {
    assert.equal(
      shouldPersistPlaybackSnapshot({ queueChanged: false, playingChanged: false, elapsedSeconds: 0 }),
      false,
      `tick ${tick}: paused no-op tick must not persist`
    );
  }
});

test('position-only updates within the throttle window do not persist', () => {
  assert.equal(
    shouldPersistPlaybackSnapshot({ queueChanged: false, playingChanged: false, elapsedSeconds: 29 }),
    false
  );
});

test('position-only updates at the throttle window boundary persist', () => {
  assert.equal(
    shouldPersistPlaybackSnapshot({ queueChanged: false, playingChanged: false, elapsedSeconds: 30 }),
    true
  );
  assert.equal(
    shouldPersistPlaybackSnapshot({ queueChanged: false, playingChanged: false, elapsedSeconds: 90 }),
    true
  );
});

test('playing state does not bypass the position throttle', () => {
  // The bug being pinned: elapsedSeconds under the window must not persist
  // just because playback is active. The decision input has no playing field
  // at all — that is the fix, and this test keeps it that way.
  const input = { queueChanged: false, playingChanged: false, elapsedSeconds: 5 };
  assert.equal(shouldPersistPlaybackSnapshot(input), false);
  assert.equal('playing' in input, false);
});

test('custom throttle windows are honored', () => {
  const input = { queueChanged: false, playingChanged: false, elapsedSeconds: 9 };
  assert.equal(shouldPersistPlaybackSnapshot({ ...input, positionThrottleSeconds: 10 }), false);
  assert.equal(shouldPersistPlaybackSnapshot({ ...input, positionThrottleSeconds: 8 }), true);
});

test('createQueueWindow keeps short queues intact', () => {
  const queue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const window = createQueueWindow(queue, 1, 100);
  assert.deepEqual(window.items, queue);
  assert.equal(window.index, 1);
  assert.equal(window.start, 0);
});

test('createQueueWindow centers large queues on the active index', () => {
  const queue = Array.from({ length: 250 }, (_, i) => ({ id: `song-${i}` }));
  const window = createQueueWindow(queue, 200, 100);
  assert.equal(window.items.length, 100);
  assert.equal(window.start, 150);
  assert.equal(window.index, 50);
  assert.equal(window.items[50].id, 'song-200');
});

test('createQueueWindow clamps out-of-range indices', () => {
  const queue = [{ id: 'a' }, { id: 'b' }];
  assert.equal(createQueueWindow(queue, -5, 100).index, 0);
  assert.equal(createQueueWindow(queue, 99, 100).index, 1);
  assert.deepEqual(createQueueWindow([], 0, 100), { items: [], index: -1, start: 0 });
});
