import type { LyricLine } from '../types.ts';

export type LyricsQuery = {
  trackName: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
};

export type LyricsResult = {
  id?: number | string;
  trackName?: string;
  artistName?: string;
  albumName?: string | null;
  duration?: number;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  instrumental?: boolean;
  source?: string;
  sourceUrl?: string;
};

export type LyricsSearchOutcome = {
  selected: LyricsResult | null;
  candidates: LyricsResult[];
  failures: string[];
};

export type LyricsProvider = {
  id: string;
  name: string;
  search(query: LyricsQuery, signal?: AbortSignal): Promise<LyricsResult[]>;
};

export type LyricsSearchOptions = {
  signal?: AbortSignal;
  geniusAccessToken?: string;
  fetcher?: typeof fetch;
  delay?: (milliseconds: number) => Promise<void>;
};

const LRCLIB = 'https://lrclib.net';
const GENIUS = 'https://api.genius.com';
const LYRIC_BODY_LIMIT = 2 * 1024 * 1024;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function parseSyncedLyrics(raw: unknown): LyricLine[] {
  if (typeof raw !== 'string') return [];
  const lines: LyricLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    const text = line.replace(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, '').trim();
    if (!text) continue;
    for (const match of stamps) {
      const minute = Number(match[1]);
      const second = Number(match[2]);
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      if (second < 60 && minute >= 0) lines.push({ time: minute * 60 + second + fraction, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function usableLyrics(value: unknown, source = 'LRCLIB'): LyricsResult[] {
  if (!Array.isArray(value)) return [];
  const seen = new Map<string, number>();
  const results: LyricsResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as LyricsResult;
    if ([candidate.trackName, candidate.artistName, candidate.albumName].some(field => field != null && typeof field !== 'string')) continue;
    if (candidate.duration != null && (!Number.isFinite(candidate.duration) || candidate.duration <= 0)) continue;
    const plainLyrics = typeof candidate.plainLyrics === 'string' && candidate.plainLyrics.trim() ? candidate.plainLyrics : null;
    const syncedLyrics = typeof candidate.syncedLyrics === 'string' && parseSyncedLyrics(candidate.syncedLyrics).length ? candidate.syncedLyrics : null;
    if (!plainLyrics && !syncedLyrics) continue;
    const result = { ...candidate, trackName: typeof candidate.trackName === 'string' ? cleanLyricsMetadata(candidate.trackName) : candidate.trackName, artistName: typeof candidate.artistName === 'string' ? cleanLyricsMetadata(candidate.artistName) : candidate.artistName, albumName: typeof candidate.albumName === 'string' ? cleanLyricsMetadata(candidate.albumName) : candidate.albumName, plainLyrics, syncedLyrics, source: candidate.source || source };
    const metadataKey = `${normalizeLyricsText(result.trackName || '')}|${normalizeLyricsText(result.artistName || '')}|${normalizeLyricsText(result.albumName || '')}|${Number.isFinite(result.duration) ? Math.round(result.duration as number) : ''}`;
    const fingerprint = metadataKey.replaceAll('|', '') ? metadataKey : String(result.id ?? 'unknown');
    const priorIndex = seen.get(fingerprint);
    if (priorIndex != null) {
      if (!results[priorIndex].syncedLyrics && result.syncedLyrics) results[priorIndex] = result;
      continue;
    }
    seen.set(fingerprint, results.length);
    results.push(result);
    if (results.length >= 20) break;
  }
  return results;
}

/** Remove common rip-site labels that are frequently embedded in local ID3 title/artist tags. */
export function cleanLyricsMetadata(value: string): string {
  return value.normalize('NFKC')
    .replace(/\s*[([【（]\s*(?:https?:\/\/)?(?:www\.)?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:\/[^)】）\]]*)?\s*[)】）\]]/giu, ' ')
    .replace(/(?:https?:\/\/)?www\.[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:\/\S*)?/giu, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Preserve Unicode letters and numbers while ignoring punctuation and casing for matching only. */
export function normalizeLyricsText(value: string): string {
  return cleanLyricsMetadata(value).toLocaleLowerCase().replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function tokenSimilarity(left: string, right: string): number {
  const a = normalizeLyricsText(left);
  const b = normalizeLyricsText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const first = new Set(a.split(' '));
  const second = new Set(b.split(' '));
  let common = 0;
  for (const token of first) if (second.has(token)) common++;
  return (2 * common) / (first.size + second.size);
}

export function scoreLyricsCandidate(query: LyricsQuery, candidate: LyricsResult): number {
  const titleScore = tokenSimilarity(query.trackName, candidate.trackName || '');
  if (titleScore < 0.45) return 0;
  let score = titleScore * 0.68;
  if (query.artistName?.trim()) {
    if (candidate.artistName?.trim()) {
      const artistScore = tokenSimilarity(query.artistName, candidate.artistName);
      if (artistScore < 0.35) return 0;
      score += artistScore * 0.26;
    } else score -= 0.12;
  }
  if (query.albumName?.trim() && candidate.albumName?.trim()) score += tokenSimilarity(query.albumName, candidate.albumName) * 0.04;
  if (Number.isFinite(query.duration) && Number.isFinite(candidate.duration)) {
    const difference = Math.abs((query.duration as number) - (candidate.duration as number));
    if (difference > 10) return 0;
    score += (difference <= 2 ? 1 : difference <= 5 ? 0.65 : 0.3) * 0.02;
  }
  if (candidate.syncedLyrics) score += 0.015;
  return Math.min(1, score);
}

export function rankLyricsCandidates(query: LyricsQuery, candidates: LyricsResult[]): LyricsResult[] {
  const unique = new Map<string, LyricsResult>();
  for (const item of usableLyrics(candidates, 'LRCLIB')) {
    const key = `${normalizeLyricsText(item.trackName || '')}|${normalizeLyricsText(item.artistName || '')}|${normalizeLyricsText(item.albumName || '')}|${Number.isFinite(item.duration) ? Math.round(item.duration as number) : ''}`;
    const prior = unique.get(key);
    if (!prior || (!prior.syncedLyrics && item.syncedLyrics)) unique.set(key, item);
  }
  return [...unique.values()]
    .map(item => ({ item, score: scoreLyricsCandidate(query, item) }))
    .filter(scored => scored.score >= 0.52)
    .sort((a, b) => b.score - a.score || Number(!!b.item.syncedLyrics) - Number(!!a.item.syncedLyrics))
    .map(scored => scored.item);
}

export function activeLyricIndex(lines: LyricLine[], position: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (lines[mid].time <= position) { found = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return found;
}

export async function requestLyrics(
  url: string, parentSignal?: AbortSignal, fetcher: typeof fetch = fetch, deadlineMs = 12000,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (parentSignal?.aborted) cancel();
  else parentSignal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, deadlineMs);
  try {
    const response = await fetcher(url, { signal: controller.signal, headers: { Accept: 'application/json', ...headers } });
    if (response.status === 404) return null;
    if (!response.ok) {
      const retryAfter = response.headers?.get('Retry-After');
      throw new Error(response.status === 429
        ? `lyrics-rate-limit${retryAfter ? `-${retryAfter}` : ''}`
        : `lyrics-http-${response.status}`);
    }
    const text = await response.text();
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (text.length > LYRIC_BODY_LIMIT) throw new Error('lyrics-too-large');
    const parsed: unknown = JSON.parse(text);
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return parsed;
  } catch (error) {
    if (timedOut) throw new Error('lyrics-timeout');
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', cancel);
  }
}

const appHeaders = { 'Lrclib-Client': 'Ritmo/1.1.2' };
const defaultDelay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const normalizedQuery = (query: LyricsQuery): LyricsQuery => ({
  trackName: cleanLyricsMetadata(query.trackName),
  artistName: cleanLyricsMetadata(query.artistName || '') || undefined,
  albumName: cleanLyricsMetadata(query.albumName || '') || undefined,
  duration: Number.isFinite(query.duration) && (query.duration as number) >= 1 && (query.duration as number) <= 3600 ? Math.round(query.duration as number) : undefined,
});

async function lrclibGet(query: LyricsQuery, signal: AbortSignal | undefined, fetcher: typeof fetch): Promise<LyricsResult | null> {
  if (!query.trackName || !query.artistName) return null;
  const params = new URLSearchParams({ track_name: query.trackName, artist_name: query.artistName });
  if (query.albumName) params.set('album_name', query.albumName);
  if (query.duration) params.set('duration', String(query.duration));
  const data = await requestLyrics(`${LRCLIB}/api/get?${params}`, signal, fetcher, 12000, appHeaders);
  return usableLyrics(data ? [data] : [])[0] || null;
}

async function lrclibSearch(params: URLSearchParams, signal: AbortSignal | undefined, fetcher: typeof fetch): Promise<LyricsResult[]> {
  const raw = await requestLyrics(`${LRCLIB}/api/search?${params}`, signal, fetcher, 12000, appHeaders);
  return usableLyrics(raw);
}

async function geniusSearch(query: LyricsQuery, token: string, signal: AbortSignal | undefined, fetcher: typeof fetch): Promise<LyricsResult[]> {
  const q = [query.trackName, query.artistName].filter(Boolean).join(' ').trim();
  if (!q) return [];
  const raw = await requestLyrics(`${GENIUS}/search?${new URLSearchParams({ q })}`, signal, fetcher, 12000, { Authorization: `Bearer ${token}` });
  if (!raw || typeof raw !== 'object') return [];
  const response = (raw as { response?: { hits?: unknown } }).response;
  if (!Array.isArray(response?.hits)) return [];
  return response.hits.flatMap(hit => {
    const song = hit && typeof hit === 'object' ? (hit as { result?: Record<string, unknown> }).result : null;
    const title = typeof song?.title === 'string' ? song.title : '';
    const artist = song?.primary_artist && typeof song.primary_artist === 'object' && typeof (song.primary_artist as { name?: unknown }).name === 'string'
      ? (song.primary_artist as { name: string }).name : '';
    const url = typeof song?.url === 'string' && /^https:\/\/genius\.com\//.test(song.url) ? song.url : undefined;
    if (!title || !artist || !url) return [];
    return [{ trackName: title, artistName: artist, source: 'Genius', sourceUrl: url }];
  }).slice(0, 5);
}

export function createLrclibProvider(fetcher: typeof fetch = fetch): LyricsProvider & { get(query: LyricsQuery, signal?: AbortSignal): Promise<LyricsResult | null> } {
  return {
    id: 'lrclib',
    name: 'LRCLIB',
    get: (query, signal) => lrclibGet(normalizedQuery(query), signal, fetcher),
    search: (query, signal) => {
      const normalized = normalizedQuery(query);
      const params = new URLSearchParams();
      if (normalized.artistName) {
        params.set('track_name', normalized.trackName);
        params.set('artist_name', normalized.artistName);
        if (normalized.albumName) params.set('album_name', normalized.albumName);
      } else params.set('q', normalized.trackName);
      return lrclibSearch(params, signal, fetcher);
    },
  };
}

export function createGeniusMetadataProvider(token: string, fetcher: typeof fetch = fetch): LyricsProvider {
  return {
    id: 'genius-metadata',
    name: 'Genius',
    search: (query, signal) => geniusSearch(query, token, signal, fetcher),
  };
}

function strongMatch(query: LyricsQuery, candidates: LyricsResult[]): LyricsResult | null {
  const ranked = rankLyricsCandidates(query, candidates);
  if (!ranked.length) return null;
  const firstScore = scoreLyricsCandidate(query, ranked[0]);
  const secondScore = ranked[1] ? scoreLyricsCandidate(query, ranked[1]) : 0;
  const minimum = query.artistName?.trim() ? 0.78 : 0.68;
  if (firstScore < minimum || (ranked.length > 1 && firstScore - secondScore < 0.09)) return null;
  if (query.artistName && scoreLyricsCandidate({ ...query, trackName: ranked[0].trackName || query.trackName }, ranked[0]) < 0.72) return null;
  return ranked[0];
}

/** LRCLIB serves full/plain or timestamped lyrics; Genius is an optional metadata-only fallback. */
export async function searchLyrics(queryInput: LyricsQuery, options: LyricsSearchOptions = {}): Promise<LyricsSearchOutcome> {
  const query = normalizedQuery(queryInput);
  const fetcher = options.fetcher || fetch;
  const lrclib = createLrclibProvider(fetcher);
  const geniusProvider = options.geniusAccessToken?.trim() ? createGeniusMetadataProvider(options.geniusAccessToken, fetcher) : null;
  const delay = options.delay || defaultDelay;
  const candidates: LyricsResult[] = [];
  const failures: string[] = [];
  let requests = 0;
  const waitBeforeRequest = async () => { if (requests++ > 0) await delay(250); };
  const checkAbort = () => { if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
  if (!query.trackName) return { selected: null, candidates: [], failures: ['missing-track-name'] };

  if (query.artistName) {
    try {
      await waitBeforeRequest();
      const exact = await lrclib.get(query, options.signal);
      checkAbort();
      if (exact) {
        const exactResult = { ...exact, source: 'LRCLIB' };
        if (scoreLyricsCandidate(query, exactResult) >= 0.72 && exactResult.syncedLyrics) return { selected: exactResult, candidates: [exactResult], failures };
        candidates.push(exactResult);
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      failures.push(`LRCLIB:${(error as Error)?.message || 'request-failed'}`);
    }
  }

  const searchVariants: URLSearchParams[] = [];
  if (query.artistName) {
    const structured = new URLSearchParams({ track_name: query.trackName, artist_name: query.artistName });
    if (query.albumName) structured.set('album_name', query.albumName);
    searchVariants.push(structured);
  }
  const fullText = [query.trackName, query.artistName].filter(Boolean).join(' ').trim();
  searchVariants.push(new URLSearchParams({ q: fullText }));
  if (query.artistName && normalizeLyricsText(query.trackName) !== normalizeLyricsText(fullText))
    searchVariants.push(new URLSearchParams({ q: query.trackName }));

  for (const params of searchVariants) {
    try {
      await waitBeforeRequest();
      const found = await lrclib.search(params.has('q')
        ? { trackName: params.get('q') || '' }
        : { trackName: params.get('track_name') || '', artistName: params.get('artist_name') || '', albumName: params.get('album_name') || undefined }, options.signal);
      checkAbort();
      candidates.push(...found.map(item => ({ ...item, source: 'LRCLIB' })));
      const selected = strongMatch(query, candidates);
      if (selected?.syncedLyrics) return { selected, candidates: rankLyricsCandidates(query, candidates), failures };
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      failures.push(`LRCLIB:${(error as Error)?.message || 'request-failed'}`);
    }
  }

  const metadataOnly: LyricsResult[] = [];
  if (geniusProvider) {
    try {
      await waitBeforeRequest();
      const geniusHits = await geniusProvider.search(query, options.signal);
      checkAbort();
      metadataOnly.push(...geniusHits);
      for (const hit of geniusHits.slice(0, 2)) {
        try {
          await waitBeforeRequest();
          const found = await lrclib.search({ trackName: hit.trackName || '', artistName: hit.artistName || '' }, options.signal);
          candidates.push(...found.map(item => ({ ...item, source: 'LRCLIB' })));
          const selected = strongMatch({ ...query, trackName: hit.trackName || query.trackName, artistName: hit.artistName || query.artistName }, candidates);
          if (selected?.syncedLyrics) return { selected, candidates: rankLyricsCandidates(query, candidates), failures };
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') throw error;
          failures.push(`LRCLIB:${(error as Error)?.message || 'request-failed'}`);
        }
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      failures.push(`Genius:${(error as Error)?.message || 'request-failed'}`);
    }
  }

  const rankedLyrics = rankLyricsCandidates(query, candidates);
  const enrichedMetadata = metadataOnly.map(hit => ({ ...hit, score: scoreLyricsCandidate(query, hit) }));
  const plausibleMetadata = enrichedMetadata.filter(hit => hit.score >= 0.52).map(({ score: _score, ...hit }) => hit);
  const combined = [...rankedLyrics, ...plausibleMetadata].slice(0, 10);
  const selected = strongMatch(query, rankedLyrics);
  return { selected, candidates: combined, failures };
}

export type LyricsCacheRecord = { schema: 1; cachedAt: number; query: LyricsQuery; result: LyricsResult };

export function readLyricsCache(storage: Pick<Storage, 'getItem'>, key: string, now = Date.now()): { record: LyricsCacheRecord; fresh: boolean } | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null') as Partial<LyricsCacheRecord> | null;
    if (!parsed || parsed.schema !== 1 || !Number.isFinite(parsed.cachedAt) || !parsed.result || !usableLyrics([parsed.result]).length) return null;
    const record = parsed as LyricsCacheRecord;
    return { record, fresh: now - record.cachedAt <= CACHE_TTL_MS };
  } catch { return null; }
}

export function writeLyricsCache(storage: Pick<Storage, 'setItem'>, key: string, query: LyricsQuery, result: LyricsResult, now = Date.now()): void {
  if (!usableLyrics([result]).length) return;
  const record: LyricsCacheRecord = { schema: 1, cachedAt: now, query, result };
  try { storage.setItem(key, JSON.stringify(record)); } catch { /* storage is best-effort */ }
}
