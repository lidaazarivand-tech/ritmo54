import { sortMedia } from './mediaSort.ts';

export type SongSortKey = 'name' | 'newest' | 'duration' | 'manual';
export const SONG_SORT_OPTIONS: ReadonlyArray<{ key: SongSortKey; label: string }> = [
  { key: 'name', label: 'نام' },
  { key: 'newest', label: 'جدیدترین' },
  { key: 'duration', label: 'مدت' },
  { key: 'manual', label: 'ترتیب دستی' },
];

export function normalizeSongSort(value: unknown): SongSortKey {
  if (value === 'newest' || value === 'added') return 'newest';
  if (value === 'duration' || value === 'manual' || value === 'name') return value;
  // Retired artist/album/recent modes map to the default name mode.
  return 'name';
}

export function sortSongs<T extends { id: string; title: string; artist?: string | null; album?: string | null; duration?: number | null; addedAt?: number | null }>(
  items: readonly T[], sort: SongSortKey, manualOrder: readonly string[], locale = 'fa',
): T[] {
  if (sort === 'manual') {
    const rank = new Map(manualOrder.map((id, index) => [id, index]));
    return [...items].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  return sortMedia(items, { sort: sort === 'newest' ? 'added' : sort, descending: sort === 'newest', locale });
}
