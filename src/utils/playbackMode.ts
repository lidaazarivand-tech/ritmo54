export type PlaybackMode = 'normal' | 'shuffle' | 'song' | 'queue';
export type PlaylistPlaybackMode = 'sequence' | 'shuffle' | 'repeat';
export function cyclePlaylistPlaybackMode(mode: PlaylistPlaybackMode): PlaylistPlaybackMode {
  return mode === 'sequence' ? 'shuffle' : mode === 'shuffle' ? 'repeat' : 'sequence';
}
export function playlistPlaybackMode(shuffle: boolean, repeat: string): PlaylistPlaybackMode {
  return shuffle ? 'shuffle' : repeat === 'all' ? 'repeat' : 'sequence';
}
export const PLAYBACK_MODES: { id: PlaybackMode; label: string }[] = [
  { id: 'normal', label: 'پخش عادی' }, { id: 'shuffle', label: 'پخش تصادفی' },
  { id: 'song', label: 'تکرار آهنگ' }, { id: 'queue', label: 'تکرار صف پخش' },
];
export function modeFlags(mode: PlaybackMode) {
  return { shuffle: mode === 'shuffle', repeat: mode === 'song' ? 'one' as const : mode === 'queue' ? 'all' as const : 'off' as const };
}
export function playbackMode(shuffle: boolean, repeat: string): PlaybackMode {
  return shuffle ? 'shuffle' : repeat === 'one' ? 'song' : repeat === 'all' ? 'queue' : 'normal';
}
// The queue is ordered data, not a playback mode. Shuffle chooses a different
// entry without rewriting it; only repeat-queue wraps at the boundary.
export function shuffleQueue(length: number, current: number, random = Math.random): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter(i => i !== current);
  for (let i = rest.length - 1; i > 0; i--) {
    const to = Math.floor(random() * (i + 1));
    [rest[i], rest[to]] = [rest[to], rest[i]];
  }
  return length ? [Math.max(0, Math.min(current, length - 1)), ...rest] : [];
}
export function queueStep(length: number, index: number, mode: PlaybackMode, direction: number, ended = false, random = Math.random, shuffleOrder?: number[]): number | null {
  if (!length) return null;
  if (ended && mode === 'song') return Math.max(0, index);
  if (mode === 'shuffle' && shuffleOrder) {
    const next = shuffleOrder.indexOf(index) + direction;
    return next >= 0 && next < shuffleOrder.length ? shuffleOrder[next] : null;
  }
  if (mode === 'shuffle' && length > 1) {
    const candidate = Math.floor(random() * (length - 1));
    return candidate >= index ? candidate + 1 : candidate;
  }
  const next = index + direction;
  if (next >= 0 && next < length) return next;
  return mode === 'queue' ? (next + length) % length : null;
}
