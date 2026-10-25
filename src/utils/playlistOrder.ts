export function reorderIds(ids: readonly string[], moving: string, target: string): string[] {
  const from = ids.indexOf(moving), to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
/** Keep manually queued extras in their slots and preserve repeated occurrences. */
export function reorderPlaylistQueue(queue: readonly string[], playlist: readonly string[]): string[] {
  const members = new Set(playlist);
  const counts = new Map<string, number>();
  for (const id of queue) if (members.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
  const ordered = playlist.flatMap(id => Array(counts.get(id) || 0).fill(id) as string[]);
  let index = 0;
  return queue.map(id => members.has(id) ? ordered[index++] : id);
}
