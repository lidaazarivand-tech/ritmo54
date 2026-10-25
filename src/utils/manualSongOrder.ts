export function reconcileManualSongOrder(saved: readonly string[], libraryIds: readonly string[]): string[] {
  const available = new Set(libraryIds);
  const seen = new Set<string>();
  const kept = saved.filter(id => available.has(id) && !seen.has(id) && !!seen.add(id));
  for (const id of libraryIds) if (!seen.has(id)) { seen.add(id); kept.push(id); }
  return kept;
}

/** Reorders visible rows while leaving filtered-out tracks in their existing slots. */
export function reorderVisibleSongs(
  order: readonly string[], visibleIds: readonly string[], moving: string, target: string,
): string[] {
  if (moving === target || !visibleIds.includes(moving) || !visibleIds.includes(target)) return [...order];
  const visible = [...visibleIds];
  const fullOrder = [...order];
  for (const id of visible) if (!fullOrder.includes(id)) fullOrder.push(id);
  const from = visible.indexOf(moving);
  visible.splice(from, 1);
  visible.splice(visible.indexOf(target), 0, moving);
  const visibleSet = new Set(visibleIds);
  let index = 0;
  return fullOrder.map(id => visibleSet.has(id) ? visible[index++] : id);
}

export function sortByManualSongOrder<T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}
