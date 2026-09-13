import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeLyricIndex,
  activeLyricWordIndex,
  parseLrc,
} from '../../src/lib/lyrics';

test('parses normal line-synced LRC', () => {
  const lines = parseLrc('[00:01.00]Hello world\n[00:03.50]Second line');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].time, 1);
  assert.equal(lines[0].text, 'Hello world');
  assert.equal(lines[0].words, undefined);
  assert.equal(activeLyricIndex(lines, 3.6), 1);
});

test('parses enhanced LRC word timestamps', () => {
  const lines = parseLrc('[00:10.00]<00:10.00>Hello <00:10.40>beautiful <00:11.10>world');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'Hello beautiful world');
  assert.deepEqual(
    lines[0].words?.map((word) => ({ time: word.time, text: word.text })),
    [
      { time: 10, text: 'Hello ' },
      { time: 10.4, text: 'beautiful ' },
      { time: 11.1, text: 'world' },
    ]
  );
  assert.equal(activeLyricWordIndex(lines[0], 10.2), 0);
  assert.equal(activeLyricWordIndex(lines[0], 10.8), 1);
  assert.equal(activeLyricWordIndex(lines[0], 11.2), 2);
});
