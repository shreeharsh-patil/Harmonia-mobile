import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artistNames,
  normalizeSong,
} from '../../src/lib/song';
import type { Song } from '../../src/types';

/**
 * Regression tests for single-pass HTML entity decoding.
 *
 * The decoder replaced a 5-pass regex chain; these cases pin the edge
 * behaviors the original chain handled: case-insensitive named entities and
 * arbitrarily zero-padded numeric apostrophes.
 */

test('decode handles case-insensitive named entities', () => {
  const song = normalizeSong({
    id: 'entity-case',
    name: 'A &AMP; B',
    artist: 'DJ &APOS; Mix',
  } as any);
  assert.equal(song.name, 'A & B');
  assert.equal(artistNames(song), 'DJ \' Mix');
});

test('decode handles zero-padded numeric apostrophes', () => {
  const song = normalizeSong({
    id: 'entity-pad',
    name: 'Track &#39; X',
    artist: 'Band &#039; Y',
  } as any);
  assert.equal(song.name, 'Track \' X');
  assert.equal(artistNames(song), 'Band \' Y');
});

test('decode handles heavily zero-padded apostrophe entities', () => {
  const song = normalizeSong({
    id: 'entity-heavy-pad',
    name: 'Song &#000039; Title',
  } as any);
  assert.equal(song.name, 'Song \' Title');
});

test('decode handles nbsp and quot variants', () => {
  const song = normalizeSong({
    id: 'entity-mixed',
    name: 'Word&nbsp;Gap &QUOT;Quote&QUOT;',
    artist: 'Echo&nbsp;&amp; Bina',
  } as any);
  assert.equal(song.name, 'Word Gap "Quote"');
  assert.equal(artistNames(song), 'Echo & Bina');
});

test('decode leaves unknown entities untouched and trims whitespace', () => {
  const song = normalizeSong({
    id: 'entity-unknown',
    name: '  Cactus &amp; Flower &copy;  ',
  } as any);
  assert.equal(song.name, 'Cactus & Flower &copy;');
});

test('decoded entities in artist objects survive normalizeSong', () => {
  const song = normalizeSong({
    id: 'entity-object-artists',
    name: 'Plain Name',
    artists: {
      primary: [
        { name: 'Singer &AMP; Writer' },
        { name: 'Bean&nbsp;Counter' },
      ],
    },
  } as any) as Song;
  assert.equal(artistNames(song), 'Singer & Writer, Bean Counter');
});

test('decode skips the regex entirely for entity-free strings', () => {
  // No '&': the fast path must trim without touching the regex.
  const song = normalizeSong({
    id: 'entity-fast-path',
    name: '  Plain Song  ',
  } as any);
  assert.equal(song.name, 'Plain Song');
});
