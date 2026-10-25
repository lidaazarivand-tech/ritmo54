import test from 'node:test';
import assert from 'node:assert/strict';
import { modeFlags, playbackMode, playlistPlaybackMode, cyclePlaylistPlaybackMode, queueStep, shuffleQueue, PLAYBACK_MODES } from '../src/utils/playbackMode.ts';

test('exactly four exclusive modes map to existing player flags', () => {
  assert.equal(PLAYBACK_MODES.length, 4);
  for (const { id } of PLAYBACK_MODES) {
    const flags = modeFlags(id);
    assert.equal(playbackMode(flags.shuffle, flags.repeat), id);
    assert.ok(!flags.shuffle || flags.repeat === 'off');
  }
});
test('normal queue respects boundaries and does not loop', () => {
  assert.equal(queueStep(3, 0, 'normal', 1), 1);
  assert.equal(queueStep(3, 2, 'normal', 1), null);
  assert.equal(queueStep(3, 0, 'normal', -1), null);
});
test('repeat song loops only on completion, not manual next', () => {
  assert.equal(queueStep(3, 1, 'song', 1, true), 1);
  assert.equal(queueStep(3, 1, 'song', 1), 2);
});
test('repeat queue wraps forward and backward', () => {
  assert.equal(queueStep(3, 2, 'queue', 1), 0);
  assert.equal(queueStep(3, 0, 'queue', -1), 2);
});
test('empty and single-entry queues have defined behavior', () => {
  for (const { id } of PLAYBACK_MODES) assert.equal(queueStep(0, 0, id, 1), null);
  assert.equal(queueStep(1, 0, 'normal', 1, true), null);
  assert.equal(queueStep(1, 0, 'shuffle', 1, true), null);
  assert.equal(queueStep(1, 0, 'song', 1, true), 0);
  assert.equal(queueStep(1, 0, 'queue', 1, true), 0);
});
test('shuffle does not repeat current item or mutate ordered queue', () => {
  const queue = ['a', 'b', 'c'], before = [...queue];
  for (const index of [0, 1, 2]) for (const random of [() => 0, () => .99]) {
    const next = queueStep(queue.length, index, 'shuffle', 1, false, random);
    assert.notEqual(next, index); assert.ok(next >= 0 && next < queue.length);
  }
  assert.deepEqual(queue, before);
});
test('legacy combined flags migrate to one displayed mode', () => {
  assert.deepEqual(modeFlags(playbackMode(true, 'all')), { shuffle: true, repeat: 'off' });
});
test('playlist control cycles sequence, shuffle, repeat-list and maps each mode to the existing engine', () => {
  const sequence = playlistPlaybackMode(false, 'off');
  const shuffle = cyclePlaylistPlaybackMode(sequence);
  const repeat = cyclePlaylistPlaybackMode(shuffle);
  assert.equal(sequence, 'sequence');
  assert.equal(shuffle, 'shuffle');
  assert.equal(repeat, 'repeat');
  assert.equal(cyclePlaylistPlaybackMode(repeat), 'sequence');
  assert.deepEqual(modeFlags('shuffle'), { shuffle: true, repeat: 'off' });
  assert.deepEqual(modeFlags('queue'), { shuffle: false, repeat: 'all' });
  assert.equal(playlistPlaybackMode(true, 'all'), 'shuffle');
  assert.equal(playlistPlaybackMode(false, 'all'), 'repeat');
});
test('stable shuffle traversal visits each entry once and stops, without rewriting queue', () => {
  const order = shuffleQueue(4, 2, () => .3);
  assert.equal(order[0], 2);
  assert.equal(new Set(order).size, 4);
  let index = 2;
  for (let i = 1; i < 4; i++) {
    index = queueStep(4, index, 'shuffle', 1, true, Math.random, order);
    assert.equal(index, order[i]);
  }
  assert.equal(queueStep(4, index, 'shuffle', 1, true, Math.random, order), null);
  assert.equal(queueStep(4, order[1], 'shuffle', -1, false, Math.random, order), 2);
});
