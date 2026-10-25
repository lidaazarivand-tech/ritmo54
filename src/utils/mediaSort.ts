export type MediaSortKey = 'name' | 'artist' | 'album' | 'duration' | 'recent' | 'added';

export type MediaSortOptions = {
  sort: MediaSortKey;
  descending: boolean;
  recentIds?: readonly string[];
  locale?: string;
};

const UNKNOWN_MEDIA_LABELS = new Set(['unknown', 'unknown artist', 'unknown album', 'n/a', 'na', 'ناشناخته', 'خواننده ناشناس', 'آلبوم ناشناس', 'نامشخص']);

type SortableMedia = {
  id: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  duration?: number | null;
  addedAt?: number | null;
};

/** Sort a copy, keeping missing metadata last in either direction and ties deterministic. */
export function sortMedia<T extends SortableMedia>(items: readonly T[], options: MediaSortOptions): T[] {
  const { sort, descending, recentIds = [], locale = 'fa' } = options;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base', usage: 'sort' });
  const recentRank = new Map<string, number>();
  recentIds.forEach((id, index) => { if (!recentRank.has(id)) recentRank.set(id, index); });
  const textValue = (item: T): string => {
    const value = sort === 'artist' ? item.artist : sort === 'album' ? item.album : item.title;
    return typeof value === 'string' ? value.trim() : '';
  };
  const isMetadataValue = (value: string | null | undefined): boolean => {
    if (typeof value !== 'string' || !value.trim()) return false;
    const normalized = value.normalize('NFKC').toLocaleLowerCase().trim();
    return !UNKNOWN_MEDIA_LABELS.has(normalized);
  };
  const numberValue = (item: T): number | null => {
    if (sort === 'added') return typeof item.addedAt === 'number' && Number.isFinite(item.addedAt) && item.addedAt > 0 ? item.addedAt : null;
    if (sort === 'duration') return typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration > 0 ? item.duration : null;
    return null;
  };
  const known = (item: T): boolean => {
    if (sort === 'artist') return isMetadataValue(item.artist);
    if (sort === 'album') return isMetadataValue(item.album);
    if (sort === 'name') return typeof item.title === 'string' && !!item.title.trim();
    if (sort === 'recent') return recentRank.has(item.id);
    return numberValue(item) !== null;
  };
  const secondaryText = (a: T, b: T) => collator.compare(a.title.trim(), b.title.trim()) || a.id.localeCompare(b.id);
  return [...items].sort((a, b) => {
    const aKnown = known(a), bKnown = known(b);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (!aKnown) return secondaryText(a, b);
    let comparison = 0;
    if (sort === 'recent') comparison = (recentRank.get(a.id)! - recentRank.get(b.id)!);
    else if (sort === 'added' || sort === 'duration') comparison = numberValue(a)! - numberValue(b)!;
    else comparison = collator.compare(textValue(a), textValue(b));
    if (comparison) return descending ? -comparison : comparison;
    return secondaryText(a, b);
  });
}
