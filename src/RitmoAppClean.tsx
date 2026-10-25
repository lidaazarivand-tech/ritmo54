import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Search, ArrowDownUp, Settings, Film, Music2, ListMusic, Folder, UserRound, Disc3, Play, Pause, SkipBack, SkipForward, Heart, X, ArrowRight, Trash2, ChevronUp, ChevronDown, MoreVertical, RefreshCw, Check, Palette, Shuffle, Repeat, Repeat1, ListStart } from 'lucide-react';
import { NativeMedia, NativeItem, TrashItem } from './utils/nativeMedia';
import { bindAudioAnalysis } from './utils/audioAnalysis';
import { PlayerSkins, PlayerSkin, PlayerSkinPicker, readPlayerSkin } from './components/PlayerSkins';
import NocturnePlayerSkin from './components/NocturnePlayerSkin';
import ReferencePlayerSkin, { isReferenceSkin } from './components/ReferencePlayerSkins';
import PlayerSeekBar from './components/PlayerSeekBar';
import PlaylistDetail from './components/PlaylistDetail';
import { reorderPlaylistQueue, sameOrder } from './utils/playlistOrder';
import { reconcileManualSongOrder, reorderVisibleSongs } from './utils/manualSongOrder';
import { animateVerticalReorder, captureVerticalPositions } from './utils/reorderMotion';
import { normalizeSongSort, SONG_SORT_OPTIONS, SongSortKey, sortSongs } from './utils/songSorting';
import PlayerSkinMenus, { LyricsTrackContext } from './components/PlayerSkinMenus';
import { PlaybackMode, PLAYBACK_MODES, playbackMode, playlistPlaybackMode, cyclePlaylistPlaybackMode, modeFlags, queueStep, shuffleQueue } from './utils/playbackMode';
import { Track, RepeatMode } from './types';
import appMetadata from '../package.json';
import { collectStorage, createBackup, LAST_BACKUP_KEY, normalizeBackupFileName, openBackupFile, prepareBackupSave, restoreBackup, RitmoBackup, saveBackupFile, StoredData, validateBackup } from './utils/settingsBackup';
import { PlayerSettings } from './components/PlayerSettings';
import { applyTheme, readTheme, selectTheme, ThemeId } from './utils/settingsTheme';
import { excludeMedia, MediaEntry, MediaSettings, readMediaSettings, restoreMedia, storeMediaSettings } from './utils/settingsMedia';
import { recoverStorageTransaction, writeStorageTransaction } from './utils/storageTransaction';
import { probeAudioDuration } from './utils/webAudioMetadata';

type Tab = 'videos' | 'songs' | 'playlists' | 'folders' | 'artists' | 'albums' | 'favorites';
type SortKey = SongSortKey;
type ManualOrders = Record<string, string[]>;
type Playlist = { id: string; name: string; trackIds: string[]; coverTrackId?: string; manual?: boolean };
type MediaTrack = Track & { artworkKey?: string; addedAt?: number; sizeBytes?: number; sharedIntent?: boolean };
type Route = { tab: Tab; group: string | null; playlistId: string | null };
type Picker = { kind: 'tracks' | 'cover'; playlistId: string } | { kind: 'playlists'; trackId: string } | { kind: 'queue' };
const settingsOptions = [
  'پوسته',
  'پرونده‌های پنهان',
  'اخیراً حذف‌شده',
  'پشتیبان‌گیری و بازیابی',
  'بازخورد',
  'درباره ما',
] as const;
type SettingsPage = typeof settingsOptions[number];
const native = Capacitor.isNativePlatform();
const storageReadErrors = new Set<string>();
let storageRecoveryError = '';
try { recoverStorageTransaction(); }
catch (error) { storageRecoveryError = String(error); }
const logo = '/branding/ritmo-icon.png';
const storedId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f]/.test(value);
const storedIds = (value: unknown): string[] => Array.isArray(value) ? value.filter(storedId) : [];
const storedNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const storedPlaylist = (value: unknown): value is Playlist => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const playlist = value as Record<string, unknown>;
  return storedId(playlist.id) && typeof playlist.name === 'string' && !!playlist.name.trim() &&
    playlist.name.length <= 4096 && Array.isArray(playlist.trackIds) &&
    (playlist.manual === undefined || typeof playlist.manual === 'boolean');
};
const json = <T,>(key: string, fallback: T): T => {
  const invalid = () => { storageReadErrors.add(key); return fallback; };
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    if (['ritmo_favorites', 'ritmo_recent', 'ritmo_queue', 'ritmo_manual_song_order'].includes(key)) {
      if (!Array.isArray(value) || !value.every(storedId)) return invalid();
      return storedIds(value) as T;
    }
    if (key === 'ritmo_manual_orders') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length > 10000) return invalid();
      const orders = value as Record<string, unknown>;
      if (Object.entries(orders).some(([scope, ids]) => !scope || scope.length > 2048 || Array.from(scope).some(char => char.charCodeAt(0) < 32) || !Array.isArray(ids) || !ids.every(storedId) || new Set(ids).size !== ids.length)) return invalid();
      return Object.fromEntries(Object.entries(orders).map(([scope, ids]) => [scope, storedIds(ids)])) as T;
    }
    if (key === 'ritmo_playlists') {
      if (!Array.isArray(value) || !value.every(storedPlaylist)) return invalid();
      const seen = new Set<string>();
      return value.filter(storedPlaylist).filter(playlist => {
        if (seen.has(playlist.id)) { storageReadErrors.add(key); return false; }
        if (!playlist.trackIds.every(storedId)) storageReadErrors.add(key);
        seen.add(playlist.id); return true;
      }).map(playlist => ({
        id: playlist.id, name: playlist.name, trackIds: storedIds(playlist.trackIds),
        ...(storedId(playlist.coverTrackId) ? { coverTrackId: playlist.coverTrackId } : {}),
        ...(typeof playlist.manual === 'boolean' ? { manual: playlist.manual } : {}),
      })) as T;
    }
    if (key === 'ritmo_current') return (value === null || storedId(value) ? value : invalid()) as T;
    if (key === 'ritmo_volume') return (storedNumber(value, 0, 1) ? value : invalid()) as T;
    if (key === 'ritmo_speed') return (storedNumber(value, 0.5, 2) ? value : invalid()) as T;
    if (key === 'ritmo_repeat') return (typeof value === 'string' && ['off', 'one', 'all'].includes(value) ? value : invalid()) as T;
    if (key === 'ritmo_sort') return (typeof value === 'string' && ['name', 'newest', 'artist', 'album', 'duration', 'recent', 'added', 'manual'].includes(value) ? value : invalid()) as T;
    return (typeof value === typeof fallback ? value : invalid()) as T;
  } catch {
    try { if (localStorage.getItem(key) !== null) storageReadErrors.add(key); } catch { storageReadErrors.add(key); }
    return fallback;
  }
};
const save = (key: string, value: unknown) => {
  if (storageRecoveryError || storageReadErrors.has(key)) throw new Error('اطلاعات ذخیره‌شده نیاز به بررسی دارد؛ بازنویسی نشد.');
  recoverStorageTransaction();
  localStorage.setItem(key, JSON.stringify(value));
};
const clock = (n: number) => `${Math.floor(Math.max(0, n) / 60)}:${String(Math.floor(Math.max(0, n) % 60)).padStart(2, '0')}`;
const fileSize = (bytes?: number) => {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return 'در دسترس نیست';
  const unit = bytes >= 1024 ** 3 ? 'GB' : bytes >= 1024 ** 2 ? 'MB' : 'KB';
  const value = bytes / (unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : 1024);
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`;
};
const toTrack = (x: NativeItem): MediaTrack => ({
  id: x.id, title: x.title || x.fileName, titleEn: x.title || x.fileName, artist: x.artist || 'خواننده ناشناس',
  artistEn: x.artist || 'خواننده ناشناس', album: x.album || 'آلبوم ناشناس', albumEn: x.album || 'آلبوم ناشناس',
  duration: x.duration || 0, audioSrc: '', coverArt: logo, genre: '', genreEn: '', year: 0,
  quality: x.type === 'video' ? 'ویدئو' : 'صوتی', lyrics: [], nativeUri: x.uri, mediaType: x.type,
  fileName: x.fileName, folder: x.folder, artworkKey: x.artworkKey, addedAt: x.addedAt, sizeBytes: x.sizeBytes
});
const isSharedAudioItem = (value: unknown): value is NativeItem => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<NativeItem>;
  const match = typeof item.uri === 'string'
    ? /^content:\/\/com\.adelapp\.larkplayer\.fileprovider\/shared-audio\/([0-9a-f]{32})\.[A-Za-z0-9]{1,8}$/.exec(item.uri)
    : null;
  return !!match && item.id === `shared-${match[1]}` && item.type === 'audio'
    && typeof item.title === 'string' && item.title.length <= 4096
    && typeof item.fileName === 'string' && item.fileName.length <= 4096
    && typeof item.artist === 'string' && typeof item.album === 'string'
    && typeof item.folder === 'string' && Number.isFinite(item.duration) && (item.duration || 0) >= 0
    && (item.sizeBytes === undefined || storedNumber(item.sizeBytes, 0, 1024 ** 3));
};
const readSharedAudioItems = (): NativeItem[] => {
  const key = 'ritmo_shared_audio';
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 1000 || !value.every(isSharedAudioItem)) {
      storageReadErrors.add(key);
      return [];
    }
    const seen = new Set<string>();
    return value.filter((item: NativeItem) => {
      if (seen.has(item.id)) { storageReadErrors.add(key); return false; }
      seen.add(item.id);
      return true;
    });
  } catch {
    storageReadErrors.add(key);
    return [];
  }
};
const isSharedVideoItem = (value: unknown): value is NativeItem => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<NativeItem>;
  const match = typeof item.uri === 'string'
    ? /^content:\/\/com\.adelapp\.larkplayer\.fileprovider\/shared-video\/([0-9a-f]{32})\.[A-Za-z0-9]{1,8}$/.exec(item.uri)
    : null;
  return !!match && item.id === `shared-video-${match[1]}` && item.type === 'video'
    && typeof item.title === 'string' && item.title.length <= 4096
    && typeof item.fileName === 'string' && item.fileName.length <= 4096
    && typeof item.artist === 'string' && typeof item.album === 'string'
    && typeof item.folder === 'string' && Number.isFinite(item.duration) && (item.duration || 0) >= 0
    && (item.sizeBytes === undefined || storedNumber(item.sizeBytes, 0, 1024 ** 3));
};
const readSharedVideoItems = (): NativeItem[] => {
  const key = 'ritmo_shared_video';
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 1000 || !value.every(isSharedVideoItem)) {
      storageReadErrors.add(key);
      return [];
    }
    const seen = new Set<string>();
    return value.filter((item: NativeItem) => {
      if (seen.has(item.id)) { storageReadErrors.add(key); return false; }
      seen.add(item.id);
      return true;
    });
  } catch {
    storageReadErrors.add(key);
    return [];
  }
};

// Load only visible artwork; no base64 image data or unbounded JS image cache.
const artworkCache = new Map<string, { promise: Promise<string>; users: number }>();
const pruneArtwork = () => {
  for (const [key, entry] of artworkCache) {
    if (artworkCache.size <= 128) break;
    if (!entry.users) artworkCache.delete(key);
  }
};
function Artwork({ track, className }: { track?: MediaTrack; className: string }) {
  const [source, setSource] = useState(track?.coverArt || logo);
  const image = useRef<HTMLImageElement>(null);
  const generation = useRef(0);
  const retried = useRef(false);
  useEffect(() => {
    generation.current++;
    retried.current = false;
    let alive = true;
    let acquired = false;
    setSource(track?.coverArt || logo);
    if (!native || !track?.nativeUri) return;
    const key = track.artworkKey || track.id;
    const load = () => {
      if (acquired || !alive) return;
      acquired = true;
      let entry = artworkCache.get(key);
      if (!entry) {
        entry = { users: 0, promise: NativeMedia.artwork({ uri: track.nativeUri!, key, type: track.mediaType === 'video' ? 'video' : 'audio' })
          .then(result => result.uri ? Capacitor.convertFileSrc(result.uri) : logo)
          .catch(() => { artworkCache.delete(key); return logo; }) };
        artworkCache.set(key, entry);
      }
      entry.users++; pruneArtwork();
      void entry.promise.then(uri => { if (alive) setSource(uri); });
    };
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { load(); observer?.disconnect(); }
    }, { rootMargin: '120px' });
    if (observer && image.current) observer.observe(image.current); else load();
    return () => {
      alive = false; observer?.disconnect();
      const entry = acquired ? artworkCache.get(key) : undefined;
      if (entry) entry.users = Math.max(0, entry.users - 1);
      generation.current++;
      pruneArtwork();
    };
  }, [track?.id, track?.nativeUri, track?.artworkKey, track?.coverArt]);
  return <img ref={image} src={source} alt={track?.title || 'تصویر جلد آهنگ'} className={className} loading="lazy" onError={() => {
    if (track) artworkCache.delete(track.artworkKey || track.id);
    if (source !== logo) {
      setSource(logo);
      // Disk eviction is normal: re-extract once instead of keeping a stale file URL.
      if (native && track?.nativeUri && !retried.current) {
        retried.current = true;
        const token = generation.current;
        void NativeMedia.artwork({ uri: track.nativeUri, key: track.artworkKey || track.id, type: track.mediaType === 'video' ? 'video' : 'audio' })
          .then(result => { if (token === generation.current && result.uri) setSource(Capacitor.convertFileSrc(result.uri)); })
          .catch(() => {});
      }
    }
  }} />;
}
// Video queue entries open the existing video Activity, never the audio service.
function reconcileQueue(old: string[], audioIds: string[]) {
  let index = 0;
  const next = old.flatMap(id => id.startsWith('video-') ? [id] : index < audioIds.length ? [audioIds[index++]] : []);
  next.push(...audioIds.slice(index));
  return next.length === old.length && next.every((id, i) => id === old[i]) ? old : next;
}

export default function RitmoAppClean() {
  const [rawTracks, setTracks] = useState<MediaTrack[]>(() =>
    [...readSharedAudioItems(), ...readSharedVideoItems()].map(item => ({ ...toTrack(item), sharedIntent: true })));
  const [route, setRoute] = useState<Route>({ tab: 'songs', group: null, playlistId: null });
  const { tab, group, playlistId } = route;
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => normalizeSongSort(json<string>('ritmo_sort', 'name')));
  const [descending, setDescending] = useState(() => json('ritmo_descending', false));
  const [manualSongOrder, setManualSongOrder] = useState<string[]>(() => json('ritmo_manual_song_order', []));
  const [manualOrders, setManualOrders] = useState<ManualOrders>(() => json('ritmo_manual_orders', {}));
  const [sortOpen, setSortOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  const [theme, setTheme] = useState(readTheme);
  const [themeError, setThemeError] = useState('');
  const [media, setMedia] = useState<MediaSettings>(() => {
    try { return readMediaSettings(); } catch { return { hidden: [], deleted: [] }; }
  });
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState(() => {
    try { readMediaSettings(); return ''; } catch (e) { return String(e); }
  });
  const mediaOperation = useRef(false);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const trashIds = useRef(new Set<string>());
  const [permanentToken, setPermanentToken] = useState<string | null>(null);
  const [playerSkin, setPlayerSkin] = useState<PlayerSkin>(readPlayerSkin);
  const changePlayerSkin = (skin: PlayerSkin) => {
    try { localStorage.setItem('ritmo_player_skin', skin); setPlayerSkin(skin); }
    catch { setError('ذخیره پوسته پخش‌کننده ممکن نشد؛ انتخاب قبلی حفظ شد.'); }
  };
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState('');
  const [backupFileName, setBackupFileName] = useState('Ritmo-backup');
  const [lastBackup, setLastBackup] = useState(() => {
    try { return localStorage.getItem(LAST_BACKUP_KEY) || ''; } catch { return ''; }
  });
  const [pendingBackup, setPendingBackup] = useState<RitmoBackup | null>(null);
  const backupOperation = useRef(false);
  const restoringSettings = useRef(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [armResetNonce, setArmResetNonce] = useState(0);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionSpeedOpen, setActionSpeedOpen] = useState(false);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [playlistNameOpen, setPlaylistNameOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const playlistCreatePending = useRef(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const playlistAddPending = useRef(false);
  const [notification, setNotification] = useState<Awaited<ReturnType<typeof NativeMedia.notificationStatus>> | null>(null);
  const [error, setError] = useState(storageRecoveryError);
  const [loading, setLoading] = useState(native);
  const [currentId, setCurrentId] = useState<string | null>(() => json('ritmo_current', null));
  const [queue, setQueue] = useState<string[]>(() => json('ritmo_queue', []));
  const queueCursor = useRef(0);
  const queuePlaylist = useRef<string | null>((() => {
    try { return localStorage.getItem('ritmo_queue_source'); } catch { return null; }
  })());
  const playlistMutation = useRef(false);
  const [playlistSaving, setPlaylistSaving] = useState(false);
  const webShuffleOrder = useRef<number[]>([]);
  const [favorites, setFavorites] = useState<string[]>(() => json('ritmo_favorites', []));
  const [recent, setRecent] = useState<string[]>(() => json('ritmo_recent', []));
  const [playlists, setPlaylists] = useState<Playlist[]>(() => json('ritmo_playlists', []));
  const [playing, setPlaying] = useState(false);
  const endedArmTrack = useRef<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sleepTimerDeadline, setSleepTimerDeadline] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!currentId || playing || duration <= 0 || position < duration - 0.5) return;
    if (endedArmTrack.current === currentId) return;
    endedArmTrack.current = currentId;
    setArmResetNonce(old => old + 1);
  }, [currentId, duration, playing, position]);
  useEffect(() => {
    if (playing) endedArmTrack.current = null;
  }, [playing, currentId]);
  const [volume, setVolume] = useState(() => json('ritmo_volume', 0.85));
  const [muted, setMuted] = useState(() => json('ritmo_muted', false));
  // Keep the user's volume separate from the zero output reported while muted.
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const volumeRevision = useRef(0);
  const volumePending = useRef(0);
  const speedRevision = useRef(0);
  const modesRevision = useRef(0);
  const settingsPending = useRef(0);
  const volumeCommand = useRef<Promise<void>>(Promise.resolve());
  const [speed, setSpeed] = useState(() => json('ritmo_speed', 1));
  const [repeat, setRepeat] = useState<RepeatMode>(() => json('ritmo_repeat', 'all'));
  const [shuffle, setShuffle] = useState(() => json('ritmo_shuffle', false));
  useEffect(() => {
    if (!native) webShuffleOrder.current = shuffle ? shuffleQueue(queue.length, queueCursor.current) : [];
  }, [queue, shuffle]);
  const audio = useRef<HTMLAudioElement>(null);
  const webFiles = useRef<HTMLInputElement>(null);
  const webUrls = useRef(new Set<string>());
  useEffect(() => () => { for (const uri of webUrls.current) URL.revokeObjectURL(uri); }, []);
  const importWebAudio = (files: FileList | null) => {
    if (!files) return;
    const additions: MediaTrack[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name)) {
        setError('فقط فایل صوتی انتخاب کنید.'); continue;
      }
      // Stable identity reconnects saved memberships when the same files are selected again.
      const id = `custom-${encodeURIComponent(file.name)}-${file.size}-${file.lastModified}`;
      if (rawTracks.some(track => track.id === id) || additions.some(track => track.id === id)) continue;
      const uri = URL.createObjectURL(file); webUrls.current.add(uri);
      const track = toTrack({ id, uri: '', title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name,
        artist: '', album: '', folder: 'فایل‌های انتخاب‌شده', duration: 0, type: 'audio', sizeBytes: file.size, addedAt: file.lastModified });
      additions.push({ ...track, nativeUri: undefined, audioSrc: uri, isCustom: true });
      void probeAudioDuration(uri).then(duration => {
        if (duration === null) return;
        setTracks(old => old.map(existing => existing.id === id ? { ...existing, duration } : existing));
      });
    }
    setTracks(old => [...old, ...additions]);
    if (webFiles.current) webFiles.current.value = '';
  };
  useEffect(() => {
    if (audio.current) return bindAudioAnalysis(audio.current, native);
  }, []);
  const scanInFlight = useRef(false);
  const lastObservedId = useRef('');
  const deletedIds = useRef(new Set([...media.hidden, ...media.deleted].map(item => item.id)));
  const deleteInFlight = useRef(false);
  const libraryRevision = useRef(0);
  const seekRevision = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const transportBusy = useRef(false);
  const seekCommand = useRef<Promise<unknown>>(Promise.resolve());
  const activeTab = useRef<HTMLButtonElement>(null);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  // LocalStorage IDs are the only favorite source, including unavailable files.
  const tracks = useMemo<MediaTrack[]>(() => {
    const excluded = new Set([...media.hidden, ...media.deleted].map(item => item.id).concat(trash.filter(t => t.status !== 'copying' && t.status !== 'prepared').map(t => t.id)));
    return rawTracks.filter(t => !excluded.has(t.id)).map(t => ({ ...t, isFavorite: favoriteSet.has(t.id) }));
  }, [rawTracks, favoriteSet, media, trash]);
  const current = tracks.find(t => t.id === currentId) || tracks.find(t => t.mediaType !== 'video');
  const music = useMemo(() => tracks.filter(t => t.mediaType !== 'video'), [tracks]);
  const refreshNotification = async () => {
    if (!native) return;
    try { setNotification(await NativeMedia.notificationStatus()); } catch (e) { setError(String(e)); }
  };
  const refreshTrash = async (cleanup = false) => {
    if (!native) return;
    const result = await NativeMedia.recentlyDeleted({ cleanup });
    trashIds.current = new Set(result.items.filter(t => t.status !== 'copying' && t.status !== 'prepared').map(t => t.id));
    deletedIds.current = new Set([...media.hidden, ...media.deleted].map(t => t.id).concat([...trashIds.current]));
    setTrash(result.items); setRetentionDays(result.days); save('ritmo_trash_days', result.days);
  };
  const trashRefreshRef = useRef(refreshTrash);
  trashRefreshRef.current = refreshTrash;
  useEffect(() => {
    if (!native) return;
    void trashRefreshRef.current(true).catch(e => setMediaError(String(e)));
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    void CapApp.addListener('appStateChange', state => {
      if (state.isActive && !mediaOperation.current && !deleteInFlight.current)
        void trashRefreshRef.current(true).catch(e => setMediaError(String(e)));
    }).then(h => { if (disposed) void h.remove(); else listener = h; });
    return () => { disposed = true; void listener?.remove(); };
  }, []);
  useEffect(() => {
    if (settingsPage === 'اخیراً حذف‌شده') void refreshTrash(true).catch(e => setMediaError(String(e)));
  }, [settingsPage]);

  const scan = async (includeVideo = false, requestVideoPermission = true) => {
    if (!native) { setLoading(false); return; }
    if (scanInFlight.current) return;
    scanInFlight.current = true; setLoading(true);
    try {
      const result = await NativeMedia.scan({ includeVideo, requestVideoPermission });
      const scannedIds = new Set(result.items.map(item => item.id));
      setTracks(old => [...result.items.map(toTrack), ...old.filter(t => !t.nativeUri || (!includeVideo && t.mediaType === 'video') || t.sharedIntent && !scannedIds.has(t.id))]);
      setError('');
      await refreshNotification();
    } catch (e) { setError(String(e)); } finally { scanInFlight.current = false; setLoading(false); }
  };
  // Restore granted videos/Favorites without adding a new video prompt at startup.
  useEffect(() => { void scan(true, false); if (native) { StatusBar.setStyle({ style: Style.Dark }).catch(() => {}); } }, []);
  useLayoutEffect(() => { applyTheme(theme); }, [theme]);
  const changeTheme = (next: ThemeId) => {
    if (backupOperation.current) return;
    try { selectTheme(next); setTheme(next); setThemeError(''); }
    catch { setThemeError('ذخیره پوسته ممکن نشد؛ انتخاب قبلی حفظ شد.'); }
  };
  useEffect(() => {
    if (restoringSettings.current) return;
    try {
      if (storageRecoveryError || storageReadErrors.size) throw new Error('اطلاعات ذخیره‌شده نامعتبر است؛ نسخه قبلی بازنویسی نشد.');
      writeStorageTransaction({
        ritmo_current: JSON.stringify(currentId), ritmo_queue: JSON.stringify(queue),
        ritmo_favorites: JSON.stringify(favorites), ritmo_recent: JSON.stringify(recent),
        ritmo_playlists: JSON.stringify(playlists), ritmo_volume: JSON.stringify(volume),
        ritmo_speed: JSON.stringify(speed), ritmo_repeat: JSON.stringify(repeat),
        ritmo_shuffle: JSON.stringify(shuffle), ritmo_muted: JSON.stringify(muted),
      });
    } catch (e) { setError(`ذخیره اطلاعات انجام نشد؛ تغییرات ممکن است پس از بستن برنامه از دست بروند. ${String(e)}`); }
  }, [currentId, queue, favorites, recent, playlists, volume, speed, repeat, shuffle, muted]);
  useEffect(() => {
    if (!native) return;
    let alive = true;
    let busy = false;
    const poll = async () => {
      if (busy || transportBusy.current || deleteInFlight.current || mediaOperation.current || restoringSettings.current || playlistMutation.current) return;
      busy = true;
      const revision = seekRevision.current;
      const observedVolumeRevision = volumeRevision.current;
      const observedSpeedRevision = speedRevision.current;
      const observedModesRevision = modesRevision.current;
      const library = libraryRevision.current;
      const seekWasPending = pendingSeek.current !== null;
      try {
        const s = await NativeMedia.state();
        if (!alive || transportBusy.current || deleteInFlight.current || mediaOperation.current || restoringSettings.current || playlistMutation.current || library !== libraryRevision.current) return;
        setCurrentId(s.id && !deletedIds.current.has(s.id) ? s.id : null);
        setPlaying(s.playing);
        if (!seekWasPending && revision === seekRevision.current && pendingSeek.current === null) setPosition(s.position);
        setDuration(s.duration);
        queueCursor.current = Math.max(0, s.queueIndex ?? 0);
        setQueue(old => reconcileQueue(old.filter(id => !deletedIds.current.has(id)), storedIds(s.queue).filter(id => !deletedIds.current.has(id))));
        if (!mutedRef.current && !volumePending.current && observedVolumeRevision === volumeRevision.current && storedNumber(s.volume, 0, 1)) {
          volumeRef.current = s.volume; setVolume(s.volume);
        }
        if (!settingsPending.current && observedSpeedRevision === speedRevision.current && storedNumber(s.speed, 0.5, 2)) setSpeed(s.speed);
        if (!settingsPending.current && observedModesRevision === modesRevision.current) {
          if (typeof s.shuffle === 'boolean') setShuffle(s.shuffle);
          if ([0, 1, 2].includes(s.repeat)) setRepeat(s.repeat === 1 ? 'one' : s.repeat === 2 ? 'all' : 'off');
        }
        if (s.playing && s.id && lastObservedId.current !== s.id) {
          lastObservedId.current = s.id;
          setRecent(old => [s.id, ...old.filter(id => id !== s.id)].slice(0, 100));
        }
        if (s.error) setError(s.error);
      } catch (e) { if (alive) setError(String(e)); } finally { busy = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 500);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const navigate = (next: Tab) => {
    setRoute({ tab: next, group: null, playlistId: null });
    setQuery(''); setSearchOpen(false); setSortOpen(false); setActionId(null);
    if (next === 'videos' && !tracks.some(t => t.mediaType === 'video')) void scan(true);
  };
  // Reset only Artists, including artist detail/back. Do not scroll the header
  // vertically to reveal the selected tab in its horizontal scroll container.
  useLayoutEffect(() => {
    if (tab !== 'artists') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const button = activeTab.current;
    const nav = button?.parentElement;
    if (button && nav) {
      const item = button.getBoundingClientRect();
      const container = nav.getBoundingClientRect();
      if (item.left < container.left) nav.scrollLeft += item.left - container.left;
      else if (item.right > container.right) nav.scrollLeft += item.right - container.right;
    }
  }, [tab, group]);
  const handleBack = () => {
    if (backupOperation.current) return;
    const skinDialog = document.querySelector<HTMLDialogElement>('dialog.ritmo-skin-picker[open]');
    if (skinDialog) skinDialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else if (pendingBackup) setPendingBackup(null);
    else if (deleteId) { if (!deleteInFlight.current) setDeleteId(null); }
    else if (permanentToken) { if (!mediaOperation.current) setPermanentToken(null); }
    else if (playlistNameOpen) closePlaylistName();
    else if (picker) setPicker(null);
    else if (infoId) setInfoId(null);
    else if (actionId) { setActionId(null); setActionSpeedOpen(false); }
    else if (speedOpen) setSpeedOpen(false);
    else if (sortOpen) setSortOpen(false);
    else if (full) setFull(false);
    else if (queueOpen) setQueueOpen(false);
    else if (settings) { if (settingsPage) setSettingsPage(null); else setSettings(false); }
    else if (searchOpen) { setSearchOpen(false); setQuery(''); }
    else if (group || playlistId) { setRoute(old => ({ ...old, group: null, playlistId: null })); setQuery(''); }
    else if (tab !== 'songs') navigate('songs');
    else void CapApp.exitApp();
  };
  const backRef = useRef(handleBack);
  backRef.current = handleBack;
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    void CapApp.addListener('backButton', () => backRef.current()).then(h => { if (disposed) void h.remove(); else listener = h; });
    return () => { disposed = true; void listener?.remove(); };
  }, []);
  useEffect(() => {
    if (!restoringSettings.current) try { save('ritmo_sort', sort); save('ritmo_descending', descending); }
    catch (e) { setError(`ذخیره مرتب‌سازی انجام نشد. ${String(e)}`); }
  }, [sort, descending]);
  useEffect(() => {
    if (!restoringSettings.current) try { save('ritmo_manual_song_order', manualSongOrder); }
    catch (e) { setError(`ذخیره ترتیب دستی انجام نشد. ${String(e)}`); }
  }, [manualSongOrder]);
  useEffect(() => {
    if (!restoringSettings.current) try { save('ritmo_manual_orders', manualOrders); }
    catch (e) { setError(`ذخیره ترتیب این فهرست انجام نشد. ${String(e)}`); }
  }, [manualOrders]);
  useEffect(() => {
    const ids = rawTracks.filter(t => t.mediaType !== 'video').map(t => t.id);
    // An empty initial scan is not evidence that saved IDs were deleted. Keep
    // the order until the library is populated, so startup cannot erase it.
    if (!ids.length) return;
    setManualSongOrder(old => {
      const next = reconcileManualSongOrder(old, ids);
      return sameOrder(old, next) ? old : next;
    });
  }, [rawTracks]);
  useEffect(() => {
    if (settings) void refreshNotification();
    if (!native) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    void CapApp.addListener('appStateChange', s => { if (s.isActive) void refreshNotification(); }).then(h => { if (disposed) void h.remove(); else listener = h; });
    return () => { disposed = true; void listener?.remove(); };
  }, [settings]);

  const ordered = (base: MediaTrack[], preserveOrder = false, useQuery = true, manualOrder = manualSongOrder) => {
    const q = useQuery ? query.toLocaleLowerCase().trim() : '';
    const result = base.filter(t => !q || [t.title, t.artist, t.album, t.folder, t.fileName].join(' ').toLocaleLowerCase().includes(q));
    if (preserveOrder) return result;
    return sortSongs(result, sort, preserveOrder ? result.map(t => t.id) : manualOrder, 'fa');
  };
  const favoriteBase = tracks.filter(t => t.isFavorite);
  const filtered = ordered(tracks.filter(t => tab === 'favorites' ? t.isFavorite : tab === 'videos' ? t.mediaType === 'video' : t.mediaType !== 'video'), false, true, tab === 'favorites' ? manualOrders.favorites || [] : manualSongOrder);

  const control = async (action: 'play' | 'pause' | 'stop' | 'next' | 'previous' | 'seek' | 'volume' | 'mute' | 'speed', value?: number) => {
    if (action === 'play' && current) {
      if (transportBusy.current) return;
      transportBusy.current = true;
      try {
        const prepared = native ? (await NativeMedia.state()).id === current.id
          : !!audio.current?.getAttribute('src') && currentId === current.id;
        if (!prepared) { await play(current); return; }
      } catch (e) { setError(String(e)); return; }
      finally { transportBusy.current = false; }
    }
    if (action === 'stop') setArmResetNonce(old => old + 1);
    if (!native && (action === 'next' || action === 'previous')) {
      await advanceWeb(action === 'next' ? 1 : -1); return;
    }
    const changesVolume = action === 'volume' || action === 'mute';
    if (restoringSettings.current && (changesVolume || action === 'speed')) return;
    const changesSetting = changesVolume || action === 'speed';
    if (changesSetting) settingsPending.current++;
    if (action === 'speed') speedRevision.current++;
    if (changesVolume) {
      volumeRevision.current++;
      volumePending.current++;
      if (action === 'volume') {
        volumeRef.current = value ?? volumeRef.current;
        mutedRef.current = false; setMuted(false);
      }
    }
    const revision = action === 'seek' ? ++seekRevision.current : seekRevision.current;
    const library = libraryRevision.current;
    if (action === 'seek') { pendingSeek.current = value ?? position; setPosition(pendingSeek.current); }
    if (native) {
      try {
        const command = () => NativeMedia.control({ action, value: action === 'seek' ? Math.round((value ?? position) * 1000) : action === 'volume' ? Math.round((value ?? volumeRef.current) * 1000) : action === 'speed' ? Math.round((value ?? speed) * 100) : undefined });
        if (changesVolume || action === 'speed') {
          const pending = volumeCommand.current.then(command);
          volumeCommand.current = pending.catch(() => {});
          await pending;
        } else if (action === 'seek') {
          const pending = seekCommand.current.then(command);
          seekCommand.current = pending.catch(() => {});
          await pending;
        } else await command();
        const s = await NativeMedia.state();
        if (!deleteInFlight.current && !mediaOperation.current && library === libraryRevision.current) {
          setPlaying(s.playing);
          if (revision === seekRevision.current && (action === 'seek' || pendingSeek.current === null)) setPosition(s.position);
          setDuration(s.duration); setQueue(old => reconcileQueue(old.filter(id => !deletedIds.current.has(id)), (s.queue || []).filter(id => !deletedIds.current.has(id))));
        }
        if (s.error) setError(s.error);
      } catch (e) { setError(String(e)); }
      finally { if (changesVolume) volumePending.current--; if (changesSetting) settingsPending.current--; }
    } else if (audio.current) {
      try {
        if (action === 'play') await audio.current.play(); if (action === 'pause') audio.current.pause(); if (action === 'stop') { audio.current.pause(); audio.current.currentTime = 0; }
        if (action === 'seek') audio.current.currentTime = value ?? position;
        if (action === 'speed') audio.current.playbackRate = value ?? speed;
        if (action === 'volume') audio.current.volume = value ?? volumeRef.current;
        if (action === 'mute') audio.current.volume = 0;
      } catch (e) { setError(String(e)); }
      finally { if (changesVolume) volumePending.current--; if (changesSetting) settingsPending.current--; }
    } else {
      if (changesVolume) volumePending.current--;
      if (changesSetting) settingsPending.current--;
    }
    if (action === 'seek' && revision === seekRevision.current) pendingSeek.current = null;
  };
  const toggleMute = () => {
    if (restoringSettings.current) return;
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted; setMuted(nextMuted);
    void control(nextMuted ? 'mute' : 'volume', nextMuted ? undefined : volumeRef.current);
  };
  useEffect(() => {
    if (sleepTimerDeadline === null) { setSleepTimerRemaining(null); return; }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((sleepTimerDeadline - Date.now()) / 1000));
      setSleepTimerRemaining(remaining);
      if (remaining === 0) {
        setSleepTimerDeadline(null);
        void control('pause');
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [sleepTimerDeadline]);
  const setSleepTimer = (minutes: number | null) => {
    setSleepTimerDeadline(minutes === null ? null : Date.now() + minutes * 60_000);
    setSleepTimerRemaining(minutes === null ? null : minutes * 60);
  };
  useEffect(() => {
    // A persisted mute flag must also silence the actual player on startup.
    if (mutedRef.current) void control('mute');
  }, []);
  const setModes = async (nextShuffle: boolean, nextRepeat: RepeatMode) => {
    if (restoringSettings.current) return;
    const mode = playbackMode(nextShuffle, nextRepeat);
    const normalized = modeFlags(mode);
    nextShuffle = normalized.shuffle; nextRepeat = normalized.repeat;
    modesRevision.current++;
    setShuffle(nextShuffle); setRepeat(nextRepeat);
    if (native) {
      settingsPending.current++;
      const command = async () => {
        await NativeMedia.control({ action: 'mode', value: ['normal', 'shuffle', 'song', 'queue'].indexOf(mode) });
      };
      const pending = volumeCommand.current.then(command);
      volumeCommand.current = pending.catch(() => {});
      try {
        await pending;
      } catch (e) { setError(String(e)); }
      finally { settingsPending.current--; }
    }
  };
  const play = async (track: MediaTrack, list: MediaTrack[] = music, playlistPlayback = false) => {
    if (playlistMutation.current || backupOperation.current) return;
    const rememberQueueSource = () => {
      queuePlaylist.current = playlistPlayback ? playlistId : '__library__';
      try { localStorage.setItem('ritmo_queue_source', queuePlaylist.current || ''); }
      catch { setError('منبع صف ذخیره نشد؛ ترتیب پس از راه‌اندازی مجدد نیاز به انتخاب دوباره دارد.'); }
    };
    libraryRevision.current++;
    const resumePosition = track.id === currentId ? position : 0;
    setError('');
    if (track.mediaType === 'video' && track.nativeUri) {
      if (native) {
        try {
          await NativeMedia.openVideo({ id: track.id, uri: track.nativeUri, title: track.title });
          setRecent(old => [track.id, ...old.filter(id => id !== track.id)].slice(0, 100));
        } catch (e) { setError(String(e)); }
      } else if (audio.current) {
        setError('پخش ویدئو در نسخه وب فعال نیست');
      }
      return;
    }
    setCurrentId(track.id); setPosition(resumePosition);
    if (native && track.nativeUri) {
      const audioList = list.filter(t => t.nativeUri && t.mediaType !== 'video');
      if (!audioList.some(t => t.id === track.id)) audioList.unshift(track);
      try {
        await NativeMedia.play({ items: audioList.map(t => ({ id: t.id, uri: t.nativeUri!, title: t.title, artist: t.artist })), index: audioList.findIndex(t => t.id === track.id), position: Math.round(resumePosition * 1000) });
        const s = await NativeMedia.state(); setPlaying(s.playing); setDuration(s.duration); setQueue(s.queue || []);
        rememberQueueSource();
        setRecent(old => [track.id, ...old.filter(id => id !== track.id)].slice(0, 100)); lastObservedId.current = track.id;
      } catch (e) { setPlaying(false); setError(String(e)); }
    } else if (audio.current) {
      const audioList = list.filter(t => t.mediaType !== 'video');
      if (!audioList.some(t => t.id === track.id)) audioList.unshift(track);
      setQueue(audioList.map(t => t.id)); queueCursor.current = audioList.findIndex(t => t.id === track.id);
      audio.current.src = track.audioSrc; audio.current.playbackRate = speed;
      audio.current.volume = mutedRef.current ? 0 : volumeRef.current;
      try { audio.current.currentTime = resumePosition; await audio.current.play(); setPlaying(true); rememberQueueSource(); }
      catch (e) { setError(String(e)); }
    }
  };
  const incomingMediaBusy = useRef(false);
  const consumeIncomingMedia = async () => {
    if (!native || incomingMediaBusy.current) return;
    incomingMediaBusy.current = true;
    try {
      const { item } = await NativeMedia.consumeIncomingMedia();
      if (!item) return;
      const track: MediaTrack = { ...toTrack(item), sharedIntent: true };
      setTracks(old => [...old.filter(existing => existing.id !== track.id), track]);
      try {
        const key = item.type === 'video' ? 'ritmo_shared_video' : 'ritmo_shared_audio';
        const stored = item.type === 'video' ? readSharedVideoItems() : readSharedAudioItems();
        save(key, [item, ...stored.filter(existing => existing.id !== item.id)].slice(0, 1000));
      } catch (storageError) {
        setError(`فایل دریافت شد، اما ذخیره اطلاعات آن برای اجرای بعدی ممکن نشد: ${String(storageError)}`);
      }
      setRoute({ tab: item.type === 'video' ? 'videos' : 'songs', group: null, playlistId: null });
      setQuery('');
      if (item.type === 'audio') setFull(true);
      await play(track, [track]);
    } catch (e) {
      setError(`بازکردن فایل انتخاب‌شده از برنامه دیگر ممکن نشد: ${String(e)}`);
    } finally { incomingMediaBusy.current = false; }
  };
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    const onIncoming = () => { if (!disposed) void consumeIncomingMedia(); };
    void CapApp.addListener('appUrlOpen', onIncoming).then(handle => { if (disposed) void handle.remove(); else listener = handle; });
    void consumeIncomingMedia();
    return () => { disposed = true; void listener?.remove(); };
  }, []);

  const selectQueue = async (index: number) => {
    const track = tracks.find(t => t.id === queue[index]);
    if (!track) { setError('فایل انتخاب‌شده در صف در دسترس نیست.'); return; }
    if (native && track.nativeUri && track.mediaType !== 'video') {
      const nativeIndex = queue.slice(0, index).filter(id => !id.startsWith('video-')).length;
      try { await NativeMedia.modifyQueue({ action: 'select', index: nativeIndex }); }
      catch (e) { setError(String(e)); }
      return;
    }
    if (track.mediaType === 'video') { await play(track); return; }
    queueCursor.current = index; setCurrentId(track.id); setPosition(0);
    if (audio.current) {
      audio.current.src = track.audioSrc; audio.current.playbackRate = speed;
      audio.current.volume = mutedRef.current ? 0 : volumeRef.current;
      try { await audio.current.play(); } catch (e) { setError(String(e)); }
    }
  };
  const advanceWeb = async (direction: number, ended = false) => {
    if (ended) setArmResetNonce(old => old + 1);
    if (direction < 0 && position > 3) { await control('seek', 0); return; }
    const next = queueStep(queue.length, queueCursor.current, playbackMode(shuffle, repeat), direction, ended, Math.random, shuffle ? webShuffleOrder.current : undefined);
    if (next === null) { audio.current?.pause(); setPlaying(false); return; }
    await selectQueue(next);
  };
  const addManyQueue = async (ids: string[]) => {
    const additions = ids.map(id => music.find(t => t.id === id)).filter((t): t is MediaTrack => !!t);
    if (!additions.length) return;
    try {
      if (native) {
        if (additions.some(t => !t.nativeUri)) throw new Error('فایل انتخاب‌شده در دسترس نیست.');
        await NativeMedia.modifyQueue({ action: 'addMany', items: additions.map(t => ({ id: t.id, uri: t.nativeUri!, title: t.title, artist: t.artist })) });
        const state = await NativeMedia.state(); setQueue(old => reconcileQueue(old, state.queue));
      } else setQueue(old => [...old, ...additions.map(t => t.id)]);
      setPicker(null);
    } catch (e) { setError(String(e)); }
  };
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
    try { save('ritmo_favorites', next); setFavorites(next); }
    catch (e) { setError(`مورد علاقه ذخیره نشد؛ وضعیت قبلی حفظ شد. ${String(e)}`); }
  };
  const addQueue = async (track: MediaTrack) => { if (native && track.nativeUri && track.mediaType !== 'video') { try { await NativeMedia.modifyQueue({ action: 'add', id: track.id, uri: track.nativeUri, title: track.title, artist: track.artist }); const s = await NativeMedia.state(); setQueue(old => reconcileQueue(old, s.queue || [])); } catch (e) { setError(String(e)); } } else setQueue(old => [...old, track.id]); };
  const removeQueue = async (track: MediaTrack, index: number) => {
    try {
      if (native && track.nativeUri && track.mediaType !== 'video') {
        const from = queue.slice(0, index).filter(id => !id.startsWith('video-')).length;
        await NativeMedia.modifyQueue({ action: 'remove', id: track.id, from });
        const state = await NativeMedia.state(); setQueue(old => reconcileQueue(old, state.queue));
      } else {
        setQueue(old => old.filter((_, i) => i !== index));
        if (index < queueCursor.current) queueCursor.current--;
        else if (index === queueCursor.current) { audio.current?.pause(); setPlaying(false); queueCursor.current = Math.max(0, index - 1); }
      }
    } catch (e) { setError(String(e)); }
  };
  const createPlaylist = () => {
    playlistCreatePending.current = false;
    setPicker(null);
    setPlaylistName('');
    setPlaylistNameOpen(true);
  };
  const closePlaylistName = () => {
    setPlaylistNameOpen(false);
    setPlaylistName('');
  };
  const submitPlaylist = (event: React.FormEvent) => {
    event.preventDefault();
    if (playlistCreatePending.current) return;
    const name = playlistName.trim();
    if (!name) return;
    playlistCreatePending.current = true;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setPlaylists(old => [...old, { id, name, trackIds: [] }]);
    closePlaylistName();
  };
  const deleteSong = async () => {
    const track = tracks.find(t => t.id === deleteId);
    if (!native || !track?.nativeUri || track.sharedIntent || track.mediaType === 'video' || deleteInFlight.current) return;
    deleteInFlight.current = true; setDeleting(true); setDeleteError('');
    try {
      mediaOperation.current = true; setMediaBusy(true);
      const { token } = await NativeMedia.prepareTrash({ id: track.id, uri: track.nativeUri,
        metadata: { favorite: favorites.includes(track.id), playlistIds: playlists.filter(p => p.trackIds.includes(track.id)).map(p => p.id) } });
      const result = await NativeMedia.deleteSong({ id: track.id, uri: track.nativeUri, backupToken: token });
      if (!result.deleted) { setDeleteError('حذف توسط شما لغو شد؛ فایل اصلی حفظ شد.'); return; }
      deletedIds.current.add(track.id); libraryRevision.current++;
      setTracks(old => old.filter(t => t.id !== track.id));
      if (result.state) {
        setCurrentId(result.state.id || null); setPlaying(result.state.playing);
        setPosition(result.state.position); setDuration(result.state.duration); setQueue(result.state.queue);
      }
      await refreshTrash();
      if (result.warning) setError(result.warning);
      setDeleteId(null); setInfoId(null); setActionId(null);
    } catch (e) { setDeleteError(String(e)); }
    finally {
      try { await refreshTrash(); } catch (e) { setMediaError(String(e)); }
      mediaOperation.current = false; setMediaBusy(false); deleteInFlight.current = false; setDeleting(false);
    }
  };
  const commitMedia = (next: MediaSettings) => {
    storeMediaSettings(next);
    deletedIds.current = new Set([...next.hidden, ...next.deleted].map(item => item.id).concat([...trashIds.current]));
    libraryRevision.current++;
    setMedia(next);
  };
  const excludeTrack = async (track: MediaTrack, kind: keyof MediaSettings) => {
    if (track.sharedIntent) throw new Error('فایل اشتراکی داخل ریتمو نگهداری می‌شود و از کتابخانه اصلی حذف نمی‌شود.');
    if (mediaOperation.current || backupOperation.current) throw new Error('عملیات دیگری در حال انجام است.');
    mediaOperation.current = true; setMediaBusy(true); setMediaError('');
    try {
      const previous = readMediaSettings(); // Corrupt storage is never overwritten.
      const entry: MediaEntry = { id: track.id, title: track.title, uri: track.nativeUri || '', fileName: track.fileName || track.title, folder: track.folder || '', date: new Date().toISOString() };
      const next = excludeMedia(previous, kind, entry);
      // Persist first. Never lose the recovery record on a storage failure.
      commitMedia(next);
      try {
        await NativeMedia.detachLibrarySong({ id: track.id });
      } catch (e) {
        commitMedia(previous);
        throw e;
      }
      // Detach is committed. A failed state read must not undo only half the operation.
      try {
        const state = await NativeMedia.state();
        setCurrentId(state.id && !deletedIds.current.has(state.id) ? state.id : null);
        setPlaying(state.playing); setPosition(state.position); setDuration(state.duration);
        setQueue(state.queue.filter(id => !deletedIds.current.has(id)));
      } catch (e) {
        setQueue(old => old.filter(id => id !== track.id));
        if (currentId === track.id) { setCurrentId(null); setPlaying(false); setPosition(0); }
        throw e;
      }
      // Favorites/recent/playlist memberships are retained, not reconstructed.
    } finally { mediaOperation.current = false; setMediaBusy(false); }
  };
  const showMedia = async (kind: keyof MediaSettings, id: string) => {
    if (mediaOperation.current || backupOperation.current) return;
    mediaOperation.current = true; setMediaBusy(true); setMediaError('');
    try {
      const previous = readMediaSettings();
      const item = previous[kind].find(item => item.id === id);
      if (!item) throw new Error('مورد انتخاب‌شده دیگر وجود ندارد.');
      // Re-scan and verify availability before removing the tombstone.
      const result = await NativeMedia.scan({ includeVideo: false, requestVideoPermission: false });
      const available = result.items.find(track => track.id === item.id && track.uri === item.uri);
      if (!available) throw new Error('فایل اصلی روی دستگاه در دسترس نیست. مجوز فایل‌ها و وجود آهنگ را بررسی کنید.');
      await NativeMedia.checkLibrarySong({ uri: item.uri });
      commitMedia(restoreMedia(previous, kind, id));
      setTracks(old => [...old.filter(track => track.id !== id), toTrack(available)]);
    } catch (e) { setMediaError(e instanceof Error ? e.message : 'بازیابی انجام نشد؛ داده‌ها حفظ شدند.'); }
    finally { mediaOperation.current = false; setMediaBusy(false); }
  };
  const sendFeedback = async () => {
    if (native) { await NativeMedia.sendFeedback(); return; }
    const mailto = 'mailto:azarivandadel@gmail.com?subject=' + encodeURIComponent('بازخورد Ritmo');
    window.location.assign(mailto);
  };
  const restoreTrash = async (token: string) => {
    if (mediaOperation.current || backupOperation.current) return;
    mediaOperation.current = true; setMediaBusy(true); setMediaError('');
    try {
      const item = trash.find(t => t.token === token);
      if (!item) throw new Error('مورد بازیابی موجود نیست.');
      const result = await NativeMedia.manageTrash({ action: 'restore', token });
      if (!result.id || !result.uri) throw new Error('بازیابی فایل تأیید نشد.');
      await NativeMedia.checkLibrarySong({ uri: result.uri });
      const scanResult = await NativeMedia.scan({ includeVideo: false, requestVideoPermission: false });
      // MediaStore may return external_primary for an insertion while the
      // existing scanner uses the external aggregate collection.
      const restored = scanResult.items.find(t => t.uri === result.uri || t.id === result.id);
      if (!restored) throw new Error('فایل بازیابی شد اما هنوز در کتابخانه قابل مشاهده نیست؛ نسخه امن حفظ شد.');
      const nextFavorites = favorites.includes(item.id) || item.favorite
        ? Array.from(new Set(favorites.filter(id => id !== item.id).concat(result.id))) : favorites;
      const nextPlaylists = playlists.map(p => {
        const ids = p.trackIds.map(id => id === item.id ? result.id! : id);
        if (item.playlistIds.includes(p.id) && !ids.includes(result.id!)) ids.push(result.id!);
        return { ...p, trackIds: ids,
          ...(p.coverTrackId === item.id ? { coverTrackId: result.id } : {}) };
      });
      // Persist memberships before releasing the private copy. Storage failure
      // leaves a 'restored' journal, allowing an idempotent retry.
      const nextRecent = recent.map(id => id === item.id ? result.id! : id);
      writeStorageTransaction({
        ritmo_favorites: JSON.stringify(nextFavorites),
        ritmo_playlists: JSON.stringify(nextPlaylists),
        ritmo_recent: JSON.stringify(nextRecent),
      });
      setFavorites(nextFavorites); setPlaylists(nextPlaylists);
      setRecent(nextRecent);
      await NativeMedia.manageTrash({ action: 'finishRestore', token });
      await refreshTrash();
      setTracks(old => [...old.filter(t => t.id !== item.id && t.id !== restored.id), toTrack(restored)]);
      libraryRevision.current++;
    } catch (e) { setMediaError(String(e)); }
    finally { mediaOperation.current = false; setMediaBusy(false); }
  };
  const permanentDelete = async () => {
    if (!permanentToken || mediaOperation.current || backupOperation.current) return;
    mediaOperation.current = true; setMediaBusy(true); setMediaError('');
    try {
      await NativeMedia.manageTrash({ action: 'permanent', token: permanentToken });
      await refreshTrash(); setPermanentToken(null);
    } catch (e) { setMediaError(String(e)); }
    finally { mediaOperation.current = false; setMediaBusy(false); }
  };
  const changeRetention = async (days: number) => {
    if (mediaOperation.current || backupOperation.current) return;
    mediaOperation.current = true; setMediaBusy(true); setMediaError('');
    try { await NativeMedia.manageTrash({ action: 'days', days }); await refreshTrash(true); }
    catch (e) { setMediaError(String(e)); }
    finally { mediaOperation.current = false; setMediaBusy(false); }
  };
  const openPicker = (next: Picker) => { playlistAddPending.current = false; setPickerQuery(''); setSelectedIds([]); setPicker(next); setActionId(null); };
  const addIdsToPlaylist = (id: string, ids: string[]) => setPlaylists(old => old.map(p => p.id === id ? { ...p, trackIds: Array.from(new Set([...p.trackIds, ...ids])) } : p));
  const confirmPlaylistTracks = () => {
    if (playlistAddPending.current || picker?.kind !== 'tracks' || !selectedIds.length) return;
    playlistAddPending.current = true;
    addIdsToPlaylist(picker.playlistId, selectedIds);
    setSelectedIds([]);
    setPicker(null);
  };
  const addToPlaylist = (playlist: Playlist) => openPicker({ kind: 'tracks', playlistId: playlist.id });
  const removeFromPlaylist = (playlistId: string, trackId: string) =>
    setPlaylists(old => old.map(p => p.id === playlistId ? { ...p, trackIds: p.trackIds.filter(id => id !== trackId) } : p));
  const reorderPlaylistAt = async (id: string, from: number, to: number) => {
    if (playlistMutation.current || backupOperation.current || mediaOperation.current || from === to) return;
    const playlist = playlists.find(p => p.id === id);
    if (!playlist || from < 0 || to < 0 || from >= playlist.trackIds.length || to >= playlist.trackIds.length) return;
    const nextIds = [...playlist.trackIds];
    nextIds.splice(to, 0, ...nextIds.splice(from, 1));
    if (sameOrder(nextIds, playlist.trackIds)) return;
    const available = new Set(tracks.filter(t => t.mediaType !== 'video').map(t => t.id));
    const previousQueue = [...queue];
    const oldVisible = playlist.trackIds.filter(trackId => available.has(trackId));
    const ownsQueue = queuePlaylist.current === id || queuePlaylist.current === null &&
      sameOrder(oldVisible, queue) && oldVisible.includes(currentId || '');
    const nextQueue = reorderPlaylistQueue(previousQueue, nextIds);
    const nextPlaylists = playlists.map(p => p.id === id ? { ...p, trackIds: nextIds } : p);
    playlistMutation.current = true; setPlaylistSaving(true); libraryRevision.current++;
    let queueChanged = false;
    try {
      if (ownsQueue && native) {
        await NativeMedia.modifyQueue({ action: 'reorder', order: nextQueue, expected: previousQueue });
        queueChanged = true;
      }
      if (storageRecoveryError || storageReadErrors.size) throw new Error('اطلاعات ذخیره‌شده نیاز به بررسی دارد؛ ترتیب قبلی حفظ شد.');
      writeStorageTransaction({ ritmo_playlists: JSON.stringify(nextPlaylists), ...(ownsQueue ? { ritmo_queue: JSON.stringify(nextQueue) } : {}) });
      setPlaylists(nextPlaylists);
      if (ownsQueue) { queuePlaylist.current = id; queueCursor.current = Math.max(0, nextQueue.indexOf(currentId || '')); setQueue(nextQueue); }
    } catch (e) {
      if (queueChanged && native) try { await NativeMedia.modifyQueue({ action: 'reorder', order: previousQueue, expected: nextQueue }); }
      catch (rollback) { setError(`بازیابی ترتیب صف ناموفق بود: ${String(rollback)}`); }
      setError(`ترتیب لیست پخش ذخیره نشد؛ ترتیب قبلی حفظ شد. ${String(e)}`);
    } finally { playlistMutation.current = false; setPlaylistSaving(false); }
  };
  const observedSort = useRef({ sort, descending, manualSongOrder });
  useEffect(() => {
    if (observedSort.current.sort === sort && observedSort.current.descending === descending && observedSort.current.manualSongOrder === manualSongOrder) return;
    observedSort.current = { sort, descending, manualSongOrder };
    // A library sort must never overwrite a manually saved playlist.
    if (queuePlaylist.current !== '__library__' || playlistMutation.current || restoringSettings.current) return;
    const queueTracks = queue.map(id => tracks.find(t => t.id === id)).filter((t): t is MediaTrack => !!t);
    if (queueTracks.length !== queue.length || new Set(queue).size !== queue.length) return;
    const desired = ordered(queueTracks, false, false).map(t => t.id);
    if (sameOrder(desired, queue)) return;
    playlistMutation.current = true; libraryRevision.current++;
    void (async () => {
      try {
        if (native) await NativeMedia.modifyQueue({ action: 'reorder', order: desired, expected: queue });
        queueCursor.current = Math.max(0, desired.indexOf(currentId || ''));
        setQueue(desired);
      } catch (e) { setError(`همگام‌سازی ترتیب صف انجام نشد؛ ترتیب قبلی صف حفظ شد. ${String(e)}`); }
      finally { playlistMutation.current = false; }
    })();
  }, [sort, descending, manualSongOrder]);
  const groups = (field: 'folder' | 'artist' | 'album') => Array.from(new Set(music.map(t => String(t[field] || 'ناشناخته')))).filter(g => !query || g.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.localeCompare(b, 'fa'));
  const groupSortScope = group && ['artists', 'albums', 'folders'].includes(tab) ? `${tab}:${group}` : '';
  const groupTrackBase = group && groupSortScope ? music.filter(t => (t[tab === 'artists' ? 'artist' : tab === 'albums' ? 'album' : 'folder'] || 'ناشناخته') === group) : [];
  const groupTracks = groupSortScope ? ordered(groupTrackBase, false, true, manualOrders[groupSortScope] || []) : [];
  const activePlaylist = playlists.find(p => p.id === playlistId);
  const playlistEntries = (activePlaylist?.trackIds || []).flatMap((id, orderIndex) => { const track = tracks.find(t => t.id === id); return track ? [{ track, orderIndex }] : []; });
  const playlistTracks = playlistEntries.map(entry => entry.track);
  const adoptPlaylistQueue = () => {
    queuePlaylist.current = playlistId;
    try { localStorage.setItem('ritmo_queue_source', playlistId || ''); }
    catch { setError('منبع صف ذخیره نشد؛ لیست پخش را پس از بازکردن دوباره انتخاب کنید.'); }
  };
  const playlistManual = activePlaylist?.manual ?? sort === 'manual';
  const list = tab === 'playlists' ? ordered(playlistTracks, playlistManual) : group ? groupTracks : filtered;
  const activePlaylistMode = playlistPlaybackMode(shuffle, repeat);
  const playlistQueueMatches = sameOrder(queue, list.filter(t => t.mediaType !== 'video').map(t => t.id));
  const playlistPlaybackActive = !!activePlaylist && (queuePlaylist.current === activePlaylist.id || playlistQueueMatches) && queue.includes(currentId || '');
  const playlistVisibleIndexes = playlistEntries.filter(({ track }) => { const q = query.toLocaleLowerCase().trim(); return !q || [track.title, track.artist, track.album, track.folder, track.fileName].join(' ').toLocaleLowerCase().includes(q); }).map(entry => entry.orderIndex);
  const actionTrack = tracks.find(t => t.id === actionId);
  const infoTrack = tracks.find(t => t.id === infoId);
  const deleteTrack = tracks.find(t => t.id === deleteId);
  const pickerPlaylist = picker && (picker.kind === 'tracks' || picker.kind === 'cover') ? playlists.find(p => p.id === picker.playlistId) : undefined;
  const pickerTracks = picker?.kind === 'cover' ? (pickerPlaylist?.trackIds || []).map(id => tracks.find(t => t.id === id)).filter((t): t is MediaTrack => !!t) : music.filter(t => !pickerPlaylist?.trackIds.includes(t.id));
  const candidates = pickerTracks.filter(t => !pickerQuery || `${t.title} ${t.artist}`.toLowerCase().includes(pickerQuery.toLowerCase()));
  const settingsSnapshot = (): StoredData => ({
    ...collectStorage(),
    ritmo_favorites: JSON.stringify(favorites),
    ritmo_playlists: JSON.stringify(playlists),
    ritmo_recent: JSON.stringify(recent),
    ritmo_volume: JSON.stringify(volumeRef.current),
    ritmo_speed: JSON.stringify(speed),
    ritmo_repeat: JSON.stringify(repeat),
    ritmo_shuffle: JSON.stringify(shuffle),
    ritmo_muted: JSON.stringify(mutedRef.current),
    ritmo_sort: JSON.stringify(sort),
    ritmo_descending: JSON.stringify(descending),
    ritmo_manual_song_order: JSON.stringify(manualSongOrder),
    ritmo_manual_orders: JSON.stringify(manualOrders),
    ritmo_trash_days: JSON.stringify(retentionDays),
  });
  const runBackupOperation = async (operation: () => Promise<void>) => {
    if (backupOperation.current || mediaOperation.current) return;
    backupOperation.current = true; setBackupBusy(true); setBackupMessage(''); setBackupError('');
    try { await operation(); }
    catch (e) { setBackupError(e instanceof Error ? e.message : 'عملیات پشتیبان انجام نشد. دوباره تلاش کنید.'); }
    finally { backupOperation.current = false; setBackupBusy(false); }
  };
  const exportBackup = () => runBackupOperation(async () => {
    // Open browser picker while the original click still has user activation.
    const safeBackupName = normalizeBackupFileName(backupFileName);
    const destination = await prepareBackupSave(native, safeBackupName);
    if (!destination) return;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const backup = await createBackup(notification?.version || appMetadata.version, settingsSnapshot());
    if (!await saveBackupFile(backup, destination, safeBackupName)) return;
    const stamp = new Date().toISOString();
    setLastBackup(stamp);
    try {
      localStorage.setItem(LAST_BACKUP_KEY, stamp);
      setBackupMessage('پشتیبان با موفقیت ایجاد شد.');
    } catch {
      setBackupMessage('پشتیبان با موفقیت ایجاد شد.');
      setBackupError('فایل ذخیره شد، اما ذخیره تاریخ آخرین پشتیبان در برنامه ممکن نشد.');
    }
  });
  const importBackup = () => runBackupOperation(async () => {
    const backup = await openBackupFile(native);
    if (backup) setPendingBackup(backup);
  });
  const confirmBackupRestore = () => runBackupOperation(async () => {
    if (!pendingBackup) return;
    const backup = await validateBackup(JSON.stringify(pendingBackup));
    const read = <T,>(storage: StoredData, key: string, fallback: T): T =>
      key in storage ? JSON.parse(storage[key]) as T : fallback;
    const preparePlayback = (storage: StoredData) => {
      const nextVolume = read(storage, 'ritmo_volume', 0.85);
      const nextSpeed = read(storage, 'ritmo_speed', 1);
      const nextShuffle = read(storage, 'ritmo_shuffle', false);
      const nextRepeat = read<RepeatMode>(storage, 'ritmo_repeat', 'all');
      const nextDays = read<number>(storage, 'ritmo_trash_days', retentionDays);
      const nextMuted = read<boolean>(storage, 'ritmo_muted', false);
      if (!storedNumber(nextVolume, 0, 1) || !storedNumber(nextSpeed, 0.5, 2) ||
        typeof nextShuffle !== 'boolean' || typeof nextMuted !== 'boolean' || typeof nextRepeat !== 'string' ||
        !['off', 'one', 'all'].includes(nextRepeat) || ![7, 30, 60, 90].includes(nextDays)) throw new Error('تنظیمات پخش پشتیبان معتبر نیست.');
      const flags = modeFlags(playbackMode(nextShuffle, nextRepeat));
      return { nextVolume, nextSpeed, nextShuffle: flags.shuffle, nextRepeat: flags.repeat, nextDays, nextMuted };
    };
    const restoredPlayback = preparePlayback(backup.payload.storage);
    restoringSettings.current = true;
    libraryRevision.current++;
    try {
      await volumeCommand.current;
      const previousPlayback = settingsSnapshot();
      if (native) {
        const state = await NativeMedia.state();
        if (!storedNumber(state.volume, 0, 1) || !storedNumber(state.speed, 0.5, 2) ||
          typeof state.shuffle !== 'boolean' || ![0, 1, 2].includes(state.repeat)) {
          throw new Error('خواندن وضعیت معتبر پخش قبل از بازیابی ممکن نشد.');
        }
        previousPlayback.ritmo_volume = JSON.stringify(state.volume);
        previousPlayback.ritmo_speed = JSON.stringify(state.speed);
        previousPlayback.ritmo_shuffle = JSON.stringify(state.shuffle);
        previousPlayback.ritmo_repeat = JSON.stringify(state.repeat === 1 ? 'one' : state.repeat === 2 ? 'all' : 'off');
      } else if (audio.current) {
        previousPlayback.ritmo_volume = JSON.stringify(audio.current.volume);
        previousPlayback.ritmo_speed = JSON.stringify(audio.current.playbackRate);
      }
      const rollbackPlayback = preparePlayback(previousPlayback);
      const applyPlayback = async (_storage: StoredData, rollback = false) => {
        const { nextVolume, nextSpeed, nextShuffle, nextRepeat, nextDays, nextMuted } = rollback ? rollbackPlayback : restoredPlayback;
        const outputVolume = nextMuted ? 0 : nextVolume;
        if (native) {
          await NativeMedia.control({ action: 'volume', value: Math.round(outputVolume * 1000) });
          await NativeMedia.control({ action: 'speed', value: Math.round(nextSpeed * 100) });
          await NativeMedia.control({ action: 'mode', value: ['normal', 'shuffle', 'song', 'queue'].indexOf(playbackMode(nextShuffle, nextRepeat)) });
          // Do not expire anything as part of backup restore. Only update the
          // preference; cleanup happens on the normal application lifecycle.
          await NativeMedia.manageTrash({ action: 'days', days: nextDays });
        } else if (audio.current) {
          audio.current.volume = outputVolume;
          audio.current.playbackRate = nextSpeed;
        }
      };
      await restoreBackup(backup, applyPlayback, previousPlayback);
      for (const key of storageReadErrors)
        if (key in backup.payload.storage || localStorage.getItem(key) === null) storageReadErrors.delete(key);
      const storage = backup.payload.storage;
      setFavorites(read(storage, 'ritmo_favorites', [] as string[]));
      setPlaylists(read(storage, 'ritmo_playlists', [] as Playlist[]));
      setRecent(read(storage, 'ritmo_recent', [] as string[]));
      volumeRef.current = read(storage, 'ritmo_volume', 0.85);
      setVolume(volumeRef.current);
      mutedRef.current = restoredPlayback.nextMuted;
      setMuted(restoredPlayback.nextMuted);
      setSpeed(read(storage, 'ritmo_speed', 1));
      setShuffle(restoredPlayback.nextShuffle);
      setRepeat(restoredPlayback.nextRepeat);
      setSort(normalizeSongSort(read<string>(storage, 'ritmo_sort', 'name')));
      setDescending(read(storage, 'ritmo_descending', false));
      setManualSongOrder(read(storage, 'ritmo_manual_song_order', [] as string[]));
      setManualOrders(read(storage, 'ritmo_manual_orders', {} as ManualOrders));
      // Theme is already covered by the existing backup key/validator.
      setTheme(readTheme());
      setPlayerSkin(readPlayerSkin());
      setRetentionDays(restoredPlayback.nextDays);
      // Notify mounted player controls (notably the equalizer) to re-read restored preferences.
      window.dispatchEvent(new Event('ritmo-settings-restored'));
      setPendingBackup(null);
      setBackupMessage('پشتیبان با موفقیت بازیابی شد.');
    } finally {
      restoringSettings.current = false;
      libraryRevision.current++;
    }
  });
  const moveQueue = async (from: number) => {
    const to = from - 1; const next = [...queue]; [next[from], next[to]] = [next[to], next[from]];
    try {
      if (native && !queue[from].startsWith('video-') && !queue[to].startsWith('video-')) {
        const nativeFrom = queue.slice(0, from).filter(id => !id.startsWith('video-')).length;
        await NativeMedia.modifyQueue({ action: 'move', from: nativeFrom, to: nativeFrom - 1 });
      }
      if (!native) {
        if (queueCursor.current === from) queueCursor.current = to;
        else if (queueCursor.current === to) queueCursor.current = from;
      }
      setQueue(next);
    } catch (e) { setError(String(e)); }
  };
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [{ id: 'videos', label: 'ویدئوها', icon: <Film size={16} /> }, { id: 'songs', label: 'آهنگ‌ها', icon: <Music2 size={16} /> }, { id: 'playlists', label: 'لیست‌های پخش', icon: <ListMusic size={16} /> }, { id: 'folders', label: 'پوشه‌ها', icon: <Folder size={16} /> }, { id: 'artists', label: 'خواننده‌ها', icon: <UserRound size={16} /> }, { id: 'albums', label: 'آلبوم‌ها', icon: <Disc3 size={16} /> }, { id: 'favorites', label: 'مورد علاقه‌ها', icon: <Heart size={16} /> }];

  return <div className="min-h-screen bg-[#0a0c13] text-slate-100 pb-24" dir="rtl">
    <audio ref={audio} onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)} onLoadedMetadata={() => {
      const duration = audio.current?.duration;
      setDuration(duration && Number.isFinite(duration) ? duration : 0);
    }} onError={() => { setPlaying(false); setError('فایل انتخاب‌شده قابل پخش نیست؛ فایل دیگری انتخاب کنید.'); }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => void advanceWeb(1, true)} />
    {!native && <input ref={webFiles} type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus" multiple hidden onChange={e => importWebAudio(e.currentTarget.files)} />}
    <header className="sticky top-0 z-30 bg-[#0a0c13] border-b border-white/10"><div className="max-w-5xl mx-auto h-16 px-4 flex items-center gap-3">
      {searchOpen ? <div className="ritmo-search-box flex-1 flex gap-2 items-center"><Search className="text-amber-400 shrink-0" /><input autoFocus aria-label="جستجوی موسیقی" value={query} onChange={e => setQuery(e.target.value)} placeholder="جستجوی موسیقی..." className="flex-1 min-w-0 bg-transparent outline-none" /><button onClick={() => { setQuery(''); setSearchOpen(false); }} aria-label="بستن جستجو"><X /></button></div>
        : <><img src={logo} alt="Ritmo" className="w-9 h-9 rounded-lg" /><b className="text-lg">Ritmo</b><div className="flex-1" /><button onClick={() => setSearchOpen(true)} className="p-2" aria-label="جستجو"><Search size={19} /></button><div className="relative"><button onClick={() => setSortOpen(!sortOpen)} className="p-2" aria-label="مرتب‌سازی"><ArrowDownUp size={19} /></button>
          {sortOpen && <div className="ritmo-sort-menu absolute top-full end-0 w-44 bg-[#171923] border border-white/10 rounded-xl p-2" role="menu">{SONG_SORT_OPTIONS.map(option => <button key={option.key} aria-pressed={sort === option.key} onClick={() => { setSort(option.key); setDescending(option.key === 'newest'); setSortOpen(false); }} className={`flex justify-between w-full text-start p-2 text-sm rounded-lg ${sort === option.key ? 'bg-amber-400/15 text-amber-400' : ''}`}>{option.label}{sort === option.key && <Check size={16} />}</button>)}</div>}</div><button onClick={() => setSettings(true)} className="p-2" aria-label="تنظیمات"><Settings size={19} /></button></>}</div>
      <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">{tabs.map(t => <button key={t.id} ref={tab === t.id ? activeTab : undefined} onClick={() => navigate(t.id)} className={`shrink-0 flex items-center gap-2 px-3 py-3 text-sm border-b-2 ${tab === t.id ? 'text-amber-400 border-amber-400' : 'text-slate-400 border-transparent'}`}>{t.icon}{t.label}</button>)}</nav></header>
    {error && <div className="ritmo-status ritmo-status-error" role="alert">{error}</div>}
    <main className="max-w-5xl mx-auto px-4 py-5">{loading ? <p className="ritmo-status ritmo-status-loading" role="status">در حال اسکن رسانه‌های دستگاه...</p> : <>
      {!native && <button className="ritmo-option text-amber-400 text-sm mb-3" onClick={() => webFiles.current?.click()}>+ انتخاب فایل صوتی</button>}
      {tab === 'playlists' && <section className={`ritmo-playlist-options ${activePlaylist ? 'ritmo-playlist-detail' : 'ritmo-playlist-collection'}`}>{!activePlaylist && <div className="ritmo-playlist-collection-heading"><h1>لیست‌های پخش</h1><button onClick={createPlaylist} className="ritmo-option text-amber-400 text-sm">+ افزودن</button></div>}
        {!playlistId && <div className="ritmo-playlist-grid">{playlists.filter(p => !query.trim() || p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(p => <button key={p.id} onClick={() => { setRoute({ tab: 'playlists', playlistId: p.id, group: null }); setQuery(''); }} className="ritmo-playlist-card"><Artwork track={tracks.find(t => t.id === (p.coverTrackId || p.trackIds[0]))} className="ritmo-playlist-card-cover" /><b dir="auto">{p.name}</b><span>{p.trackIds.length.toLocaleString('fa-IR')} آهنگ</span></button>)}{!playlists.length && <p>هنوز لیست پخشی نساخته‌اید.</p>}</div>}
        {activePlaylist && <PlaylistDetail key={activePlaylist.id} id={activePlaylist.id} name={activePlaylist.name}
          tracks={playlistTracks} visibleTracks={list} visibleTrackIndexes={playlistVisibleIndexes} manual={playlistManual} cover={tracks.find(t => t.id === (activePlaylist.coverTrackId || activePlaylist.trackIds[0]))}
          currentId={currentId} playing={playing && playlistPlaybackActive} artwork={(track, className) => <Artwork track={track} className={className} />}
          back={() => { setRoute({ tab: 'playlists', group: null, playlistId: null }); setQuery(''); }}
          add={() => addToPlaylist(activePlaylist)} chooseCover={() => openPicker({ kind: 'cover', playlistId: activePlaylist.id })}
          manualMode={playlistManual}
          toggleManualMode={() => setPlaylists(old => old.map(p => p.id === activePlaylist.id ? { ...p, manual: !playlistManual } : p))}
          playbackMode={activePlaylistMode}
          cyclePlaybackMode={() => {
            const next = cyclePlaylistPlaybackMode(activePlaylistMode);
            void setModes(next === 'shuffle', next === 'repeat' ? 'all' : 'off');
          }}
          playAll={() => { if (playlistPlaybackActive && list.some(t => t.id === currentId)) { adoptPlaylistQueue(); void control(playing ? 'pause' : 'play'); } else if (list[0]) { void (async () => { await setModes(activePlaylistMode === 'shuffle', activePlaylistMode === 'repeat' ? 'all' : 'off'); await play(list[0], list, true); })().catch(e => setError(String(e))); } }}
          playTrack={t => { if (currentId === t.id && playlistPlaybackActive) { adoptPlaylistQueue(); void control(playing ? 'pause' : 'play'); } else { void (async () => { await setModes(activePlaylistMode === 'shuffle', activePlaylistMode === 'repeat' ? 'all' : 'off'); await play(t, list, true); })().catch(e => setError(String(e))); } }}
          moreTrack={t => { setActionSpeedOpen(false); setActionId(t.id); }}
          reorderTrack={(from, to) => void reorderPlaylistAt(activePlaylist.id, from, to)} saving={playlistSaving}
          error={error}
          removeTrack={id => removeFromPlaylist(activePlaylist.id, id)}
          deletePlaylist={() => { setPlaylists(old => old.filter(p => p.id !== activePlaylist.id)); setRoute({ tab: 'playlists', group: null, playlistId: null }); }}
        />}</section>}
      {(tab === 'folders' || tab === 'artists' || tab === 'albums') && !group && <section className={tab === 'artists' ? 'ritmo-artists' : undefined}>{groups(tab === 'artists' ? 'artist' : tab === 'albums' ? 'album' : 'folder').map(g => <button key={g} onClick={() => { setRoute({ tab, group: g, playlistId: null }); setQuery(''); }} className="flex w-full items-center gap-3 py-4 border-b border-white/10 text-start"><Folder size={18} className="text-amber-400" />{g}</button>)}{!groups(tab === 'artists' ? 'artist' : tab === 'albums' ? 'album' : 'folder').length && <p className="text-center text-slate-500 py-16">موردی پیدا نشد.</p>}</section>}
      {group && ['folders', 'artists', 'albums'].includes(tab) && <section className={tab === 'artists' ? 'ritmo-artists' : undefined}><button onClick={() => { setRoute(old => ({ ...old, group: null })); setQuery(''); }} className="text-amber-400 text-sm mb-3">‹ بازگشت</button><h2 className="mb-3">{group}</h2>{groupTracks.map(t => <Row key={t.id} track={t} current={currentId === t.id} playing={playing} manual={sort === 'manual'} onReorder={(moving, target) => setManualOrders(old => ({ ...old, [groupSortScope]: reorderVisibleSongs(old[groupSortScope] || groupTrackBase.map(item => item.id), groupTracks.map(item => item.id), moving, target) }))} onPlay={() => { setFull(true); if (currentId === t.id) void control(playing ? 'pause' : 'play'); else void play(t, groupTracks); }} onFavorite={() => toggleFavorite(t.id)} onMore={() => { setActionSpeedOpen(false); setActionId(t.id); }} />)}</section>}
      {['songs', 'videos', 'favorites'].includes(tab) && <section data-song-list><div className="flex justify-between mb-3 text-sm text-slate-400"><span>{list.length} مورد</span><button onClick={() => { if (list[0]) { setFull(true); void play(list[0], list); } }} className="text-amber-400 flex gap-2"><Play size={16} />پخش همه</button></div>{list.map(t => <Row key={t.id} track={t} current={currentId === t.id} playing={playing} manual={sort === 'manual' && (tab === 'songs' || tab === 'favorites')} onReorder={(moving, target) => {
        const visibleIds = list.map(item => item.id);
        if (tab === 'songs') setManualSongOrder(old => reorderVisibleSongs(old, visibleIds, moving, target));
        else if (tab === 'favorites') setManualOrders(old => ({ ...old, favorites: reorderVisibleSongs(old.favorites || favoriteBase.map(item => item.id), visibleIds, moving, target) }));
      }} onPlay={() => { setFull(true); if (currentId === t.id) void control(playing ? 'pause' : 'play'); else void play(t, list); }} onFavorite={() => toggleFavorite(t.id)} onMore={() => { setActionSpeedOpen(false); setActionId(t.id); }} />)}{!list.length && <p className="text-center text-slate-500 py-16">{tab === 'favorites' ? 'هنوز رسانه‌ای به مورد علاقه‌ها اضافه نکرده‌اید.' : 'رسانه‌ای پیدا نشد.'}</p>}</section>}
    </>}</main>
    {current && <div className="fixed bottom-0 inset-x-0 z-40 bg-[#11131c] border-t border-white/10"><div className="h-1 bg-white/10"><div className="h-full bg-amber-400" style={{ width: `${duration ? position / duration * 100 : 0}%` }} /></div><div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3"><button onClick={() => setFull(true)} className="flex-1 flex gap-3 min-w-0 text-start"><Artwork track={current} className="ritmo-mini-artwork w-10 h-10 rounded-lg object-cover shrink-0" /><span className="min-w-0"><b className="block truncate">{current.title}</b><small className="block truncate text-slate-400">{current.artist}</small></span></button><button onClick={() => void control(playing ? 'pause' : 'play')} className="bg-amber-400 text-slate-950 rounded-full p-2">{playing ? <Pause size={18} /> : <Play size={18} />}</button><button onClick={() => void control('next')} className="p-2"><SkipForward /></button></div></div>}
    {full && current && <Player track={current} playing={playing} position={position} duration={duration} sleepTimer={setSleepTimer} sleepTimerRemaining={sleepTimerRemaining} equalizerChange={gains => { if (native) void NativeMedia.setEqualizer({ gains }).catch(e => setError(String(e))); }} speed={speed} volume={muted ? 0 : volume} volumeChange={v => { if (restoringSettings.current) return; volumeRef.current = v; setVolume(v); mutedRef.current = false; setMuted(false); void control('volume', v); }} speedOpen={speedOpen} armResetNonce={armResetNonce} setSpeedOpen={setSpeedOpen} mode={playbackMode(shuffle, repeat)} skin={playerSkin} skinChange={changePlayerSkin} modeChange={mode => { const flags = modeFlags(mode); void setModes(flags.shuffle, flags.repeat); }} close={() => { setFull(false); setSpeedOpen(false); }} play={() => void control(playing ? 'pause' : 'play')} prev={() => void control('previous')} next={() => void control('next')} seek={v => { setPosition(v); void control('seek', v); }} speedChange={v => { if (restoringSettings.current) return; setSpeed(v); void control('speed', v); }} queue={() => { setFull(false); setSpeedOpen(false); setQueueOpen(true); }} favorite={() => toggleFavorite(current.id)} more={() => { setSpeedOpen(false); setActionSpeedOpen(false); setActionId(current.id); }} />}
    {queueOpen && <div className="fixed inset-0 z-50 bg-[#0a0c13] p-5 overflow-y-auto">
      <div className="max-w-3xl mx-auto flex justify-between mb-5 gap-2 flex-wrap"><h2>صف پخش</h2><div className="flex gap-4">
        <button onClick={() => openPicker({ kind: 'queue' })}>افزودن آهنگ‌ها</button>
        <button onClick={async () => { try { if (native) await NativeMedia.modifyQueue({ action: 'clear' }); else { audio.current?.pause(); setPlaying(false); } setQueue([]); queueCursor.current = 0; } catch (e) { setError(String(e)); } }}>پاک‌سازی</button>
        <button onClick={() => setQueueOpen(false)} aria-label="بستن"><X /></button></div></div>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <div className="max-w-3xl mx-auto">{queue.map((id, i) => {
        const t = tracks.find(x => x.id === id);
        return t && <div key={`${id}-${i}`} className="flex gap-2 border-b border-white/10 py-3">
          <button className="flex flex-1 items-center gap-3 min-w-0 text-start" onClick={() => { void selectQueue(i); setQueueOpen(false); }}><Artwork track={t} className="w-12 h-12 rounded-lg object-cover shrink-0" /><span className="truncate">{t.title}</span></button>
          <button disabled={!i} aria-label="انتقال به بالا" onClick={() => void moveQueue(i)}><ChevronUp size={17} /></button>
          <button onClick={() => void removeQueue(t, i)} aria-label="حذف از صف"><Trash2 size={17} /></button></div>;
      })}{!queue.length && <p className="text-slate-400">صف پخش خالی است.</p>}</div></div>}
    {settings && <PlayerSettings
      options={settingsOptions} page={settingsPage}
      onPage={page => setSettingsPage(page as SettingsPage | null)}
      onBack={() => { if (backupOperation.current) return; if (settingsPage) setSettingsPage(null); else setSettings(false); }}
      theme={theme} onTheme={changeTheme} themeError={themeError}
      playerSkin={playerSkin} onPlayerSkin={changePlayerSkin}
      playerArtwork={<Artwork track={current} className="ritmo-player-cover" />}
      media={media} mediaBusy={mediaBusy} mediaError={mediaError}
      trash={trash} retentionDays={retentionDays} onRetention={days => void changeRetention(days)}
      onRestoreTrash={token => void restoreTrash(token)} onPermanentTrash={setPermanentToken}
      renderTrashArtwork={item => <img alt="" src={item.coverUri ? Capacitor.convertFileSrc(item.coverUri) : logo} className="ps-trash-art" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = logo; }} />}
      onRestoreMedia={(kind, id) => void showMedia(kind, id)} onFeedback={sendFeedback}
      backupBusy={backupBusy} backupMessage={backupMessage} backupError={backupError} lastBackup={lastBackup}
      backupFileName={backupFileName} onBackupFileNameChange={setBackupFileName}
      onExport={() => void exportBackup()} onImport={() => void importBackup()}
      version={notification?.version || appMetadata.version}
    />}
    {pendingBackup && <AppDialog title="بازیابی پشتیبان" close={() => { if (!backupOperation.current) setPendingBackup(null); }}>
      <p className="text-sm leading-7">اطلاعات ذخیره‌شده فعلی با اطلاعات موجود در این پشتیبان جایگزین خواهد شد. آیا ادامه می‌دهید؟</p>
      {backupError && <p role="alert" className="text-sm text-rose-300 mt-3">{backupError}</p>}
      <div className="ritmo-dialog-actions"><button disabled={backupBusy} className="ritmo-option" onClick={() => setPendingBackup(null)}>انصراف</button><button disabled={backupBusy} className="ritmo-option text-amber-400" onClick={() => void confirmBackupRestore()}>بازیابی</button></div>
    </AppDialog>}
    {actionTrack && <AppDialog sheet title={actionTrack.title} close={() => { setActionId(null); setActionSpeedOpen(false); }}><div className="space-y-2">{[
      { title: 'پخش', run: () => void play(actionTrack, list, tab === 'playlists') },
      { title: 'افزودن به صف پخش', run: () => void addQueue(actionTrack) },
      { title: 'افزودن به لیست پخش', run: () => openPicker({ kind: 'playlists', trackId: actionTrack.id }) },
      { title: actionTrack.isFavorite ? 'حذف از مورد علاقه‌ها' : 'افزودن به مورد علاقه‌ها', run: () => toggleFavorite(actionTrack.id) },
      { title: 'جزئیات فایل', run: () => setInfoId(actionTrack.id) },
      ...(native && actionTrack.nativeUri && !actionTrack.sharedIntent && actionTrack.mediaType !== 'video' ? [{ title: 'پنهان‌کردن در ریتمو', run: () => void excludeTrack(actionTrack, 'hidden').catch(e => { setMediaError(String(e)); setError(String(e)); }) }] : []),
      ...(native && actionTrack.nativeUri && !actionTrack.sharedIntent && actionTrack.mediaType !== 'video' ? [{ title: 'حذف آهنگ', run: () => { setDeleteError(''); setDeleteId(actionTrack.id); } }] : [])
    ].map(a => <button key={a.title} className={`block w-full text-start p-3 rounded-lg bg-white/5 ${a.title === 'حذف آهنگ' ? 'text-rose-300' : ''}`} onClick={() => { setActionId(null); a.run(); }}>{a.title}</button>)}<button className="block w-full text-start p-3 rounded-lg bg-white/5" aria-expanded={actionSpeedOpen} onClick={() => setActionSpeedOpen(open => !open)}>سرعت پخش <span dir="ltr" className="float-left text-slate-400">{speed}x</span></button>{actionSpeedOpen && <div className="grid grid-cols-4 gap-2 rounded-lg bg-white/5 p-3" dir="ltr">{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => <button key={rate} className={`rounded-md p-2 text-sm ${speed === rate ? 'bg-amber-400 text-slate-950' : 'bg-white/10'}`} aria-pressed={speed === rate} onClick={() => { if (!restoringSettings.current) { setSpeed(rate); void control('speed', rate); } setActionId(null); setActionSpeedOpen(false); }}>{rate}x</button>)}</div>}{activePlaylist && <button className="block w-full text-start p-3 text-rose-300" onClick={() => { removeFromPlaylist(activePlaylist.id, actionTrack.id); setActionId(null); }}>حذف از لیست پخش</button>}</div></AppDialog>}
    {infoTrack && <AppDialog title="جزئیات فایل" close={() => setInfoId(null)}><div className="space-y-3 text-sm break-all"><p>{infoTrack.title}</p><p>خواننده: {infoTrack.artist}</p><p>آلبوم: {infoTrack.album}</p><p>مدت: {clock(infoTrack.duration)}</p><p>حجم فایل: <bdi>{fileSize(infoTrack.sizeBytes)}</bdi></p><p>نوع: {infoTrack.mediaType === 'video' ? 'ویدئو' : 'صوتی'}</p><p>نام فایل: {infoTrack.fileName || 'نامشخص'}</p><p>پوشه: {infoTrack.folder || 'نامشخص'}</p><p dir="ltr">{infoTrack.nativeUri || infoTrack.audioSrc}</p></div><button className="ritmo-option ritmo-dialog-close" onClick={() => setInfoId(null)}>بستن</button></AppDialog>}
    {deleteTrack && <AppDialog title="حذف آهنگ" close={() => { if (!deleteInFlight.current) setDeleteId(null); }}><p className="text-sm leading-7 break-words">فایل «{deleteTrack.fileName || deleteTrack.title}» پس از ایجاد نسخه امن بازیابی، با تأیید اندروید از محل اصلی حذف می‌شود. تا {retentionDays} روز در «اخیراً حذف‌شده» قابل بازیابی است؛ مورد علاقه و عضویت در لیست‌های پخش حفظ می‌شود.</p>{deleteError && <p role="alert" className="text-rose-300 text-sm mt-3">{deleteError}</p>}<div className="ritmo-dialog-actions"><button disabled={deleting} className="ritmo-option text-rose-300" onClick={() => void deleteSong()}>{deleting ? 'در حال حذف...' : 'حذف آهنگ'}</button><button disabled={deleting} className="ritmo-option" onClick={() => setDeleteId(null)}>لغو</button></div></AppDialog>}
    {permanentToken && <AppDialog title="حذف دائمی" close={() => { if (!mediaOperation.current) setPermanentToken(null); }}><p>نسخه بازیابی این آهنگ برای همیشه حذف می‌شود و دیگر قابل بازیابی نیست.</p>{mediaError && <p role="alert" className="text-rose-300">{mediaError}</p>}<div className="ritmo-dialog-actions"><button disabled={mediaBusy} className="ritmo-option text-rose-300" onClick={() => void permanentDelete()}>حذف دائمی</button><button disabled={mediaBusy} className="ritmo-option" onClick={() => setPermanentToken(null)}>انصراف</button></div></AppDialog>}
    {picker && <Overlay title={picker.kind === 'cover' ? 'انتخاب کاور از آهنگ‌های لیست' : picker.kind === 'playlists' ? 'انتخاب لیست پخش' : 'انتخاب آهنگ‌ها'} close={() => setPicker(null)}>
      {picker.kind === 'playlists' ? <><button onClick={createPlaylist} className="ritmo-option text-amber-400 mb-3">+ افزودن لیست پخش</button>{playlists.map(p => <button key={p.id} disabled={p.trackIds.includes(picker.trackId)} className="ritmo-option block w-full text-start mb-2 disabled:text-slate-500" onClick={() => { addIdsToPlaylist(p.id, [picker.trackId]); setPicker(null); }}>{p.name}{p.trackIds.includes(picker.trackId) ? ' (قبلاً اضافه شده)' : ''}</button>)}</>
        : <><input aria-label="جستجوی آهنگ برای انتخاب" value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} placeholder="جستجوی آهنگ..." className="ritmo-search-input w-full p-3 mb-3 outline-none" />
          {(picker.kind === 'queue' || picker.kind === 'tracks') && <button disabled={!selectedIds.length} className="ritmo-option text-amber-400 mb-3 disabled:text-slate-500" onClick={() => void addManyQueue(selectedIds)}>افزودن {selectedIds.length} آهنگ به صف پخش</button>}
          {picker.kind === 'cover' && <button className="ritmo-option text-amber-400 mb-3" onClick={() => { setPlaylists(old => old.map(p => p.id === picker.playlistId ? { ...p, coverTrackId: undefined } : p)); setPicker(null); }}>کاور خودکار</button>}
          {candidates.map(t => <button key={t.id} className={`flex w-full items-center gap-3 py-3 border-b border-white/10 text-start ${selectedIds.includes(t.id) || picker.kind === 'cover' && pickerPlaylist?.coverTrackId === t.id ? 'text-amber-400' : ''}`} onClick={() => {
            if (picker.kind === 'cover') { setPlaylists(old => old.map(p => p.id === picker.playlistId ? { ...p, coverTrackId: t.id } : p)); setPicker(null); }
            else setSelectedIds(old => old.includes(t.id) ? old.filter(id => id !== t.id) : [...old, t.id]);
          }}><Artwork track={t} className="w-12 h-12 rounded-lg" /><span className="flex-1 min-w-0"><b className="block truncate">{t.title}</b><small className="text-slate-400">{t.artist}</small></span>{(selectedIds.includes(t.id) || picker.kind === 'cover' && pickerPlaylist?.coverTrackId === t.id) && <Check size={18} />}</button>)}
          {!candidates.length && <p className="text-slate-500 py-6">{picker.kind === 'cover' ? 'ابتدا آهنگی دارای کاور به لیست اضافه کنید.' : 'آهنگ جدیدی برای افزودن پیدا نشد.'}</p>}
          {picker.kind === 'tracks' && <div className="ritmo-picker-sticky-footer"><button disabled={!selectedIds.length || playlistAddPending.current} className="ritmo-option text-amber-400 disabled:text-slate-500" onClick={confirmPlaylistTracks}>تأیید افزودن {selectedIds.length} آهنگ</button></div>}</>}
    </Overlay>}
    {playlistNameOpen && <AppDialog title="افزودن لیست پخش" className="ritmo-dialog-playlist-name" close={closePlaylistName}><form onSubmit={submitPlaylist}><label htmlFor="ritmo-playlist-name" className="block text-sm mb-3">نام لیست پخش</label><input id="ritmo-playlist-name" autoFocus enterKeyHint="done" value={playlistName} onChange={e => setPlaylistName(e.target.value)} placeholder="نام لیست پخش را بنویسید" className="ritmo-name-input" /><div className="ritmo-dialog-actions"><button type="submit" className="ritmo-option text-amber-400" disabled={!playlistName.trim()}>تأیید</button><button type="button" className="ritmo-option" onClick={closePlaylistName}>لغو</button></div></form></AppDialog>}
  </div>;
}

function AppDialog({ title, close, children, sheet = false, className = '' }: { title: string; close: () => void; children: React.ReactNode; sheet?: boolean; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; if (focused?.isConnected) focused.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} dir="rtl" aria-label={title} className={`ritmo-dialog ${sheet ? 'ritmo-bottom-sheet' : 'ritmo-centered-dialog'} ${className}`} onCancel={e => { e.preventDefault(); close(); }} onClick={e => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close();
  }}>{sheet && <div className="ritmo-sheet-handle" />}<div className="flex items-center justify-between gap-3 mb-4"><h2 className="truncate">{title}</h2><button className="ritmo-dialog-dismiss" onClick={close} aria-label="بستن"><X size={20} /></button></div>{children}</dialog>;
}

function Overlay({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const width = title === 'تنظیمات' ? 'max-w-lg' : 'max-w-3xl';
  return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 bg-[#0a0c13] p-5 overflow-y-auto" dir="rtl"><div className={`${width} mx-auto flex justify-between gap-3 mb-5`}><h2 className="truncate">{title}</h2><button onClick={close} aria-label="بستن"><X /></button></div><div className={`${width} mx-auto`}>{children}</div></div>;
}
function Row({ track, current, playing, onPlay, onFavorite, onMore, manual = false, onReorder }: { track: MediaTrack; current: boolean; playing: boolean; onPlay: () => void; onFavorite: () => void; onMore: () => void; manual?: boolean; onReorder?: (moving: string, target: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const timer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const point = useRef<{ x: number; y: number } | null>(null);
  const target = useRef<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const before = useRef<ReturnType<typeof captureVerticalPositions>>(new Map());
  const dragScrollStart = useRef(0);
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-manual-track-id]'));
  const clearPreview = () => {
    for (const row of rows()) {
      row.classList.remove('ritmo-manual-dragging','ritmo-manual-drop-target','ritmo-manual-shift-up','ritmo-manual-shift-down');
      row.style.removeProperty('--ritmo-drag-y');
      row.style.removeProperty('--ritmo-shift-y');
      row.style.removeProperty('transform');
    }
  };
  const findTarget = (_x: number, y: number) => {
    const scrollDelta=window.scrollY-dragScrollStart.current;
    const source=rowRef.current;
    const sourceTop=before.current.get(track.id);
    if(source&&sourceTop!==undefined&&y>=sourceTop-scrollDelta&&y<sourceTop-scrollDelta+source.offsetHeight) return source;
    const all=rows().filter(row=>row.dataset.manualTrackId!==track.id);
    return all.find(row=>{const originalTop=before.current.get(row.dataset.manualTrackId || '');const top=originalTop===undefined?row.getBoundingClientRect().top:originalTop-scrollDelta;return y<top+row.offsetHeight;}) || all.at(-1) || null;
  };
  const paintPreview = (x: number, y: number) => {
    const all=rows(), source=rowRef.current, destination=findTarget(x,y);
    if(!source || !destination) return;
    const from=all.indexOf(source), to=all.indexOf(destination), distance=y-(start.current?.y ?? y);
    source.classList.add('ritmo-manual-dragging');
    source.classList.remove('ritmo-manual-drop-target');
    source.style.setProperty('--ritmo-drag-y',`${distance}px`);
    const sourceTransform=`translate3d(0,${distance}px,0) scale(1.025)`;
    if(source.style.transform!==sourceTransform) source.style.transform=sourceTransform;
    target.current=destination.dataset.manualTrackId || null;
    const shift=from>=0&&to>=0&&from!==to ? (from<to?-Math.max(48,source.offsetHeight):Math.max(48,source.offsetHeight)) : 0;
    all.forEach((row,index)=>{
      if(row===source) return;
      const inPath=shift!==0&&index>=Math.min(from,to)&&index<=Math.max(from,to);
      row.classList.toggle('ritmo-manual-drop-target',row===destination);
      row.classList.toggle('ritmo-manual-shift-up',inPath&&shift<0);
      row.classList.toggle('ritmo-manual-shift-down',inPath&&shift>0);
      const transform=inPath?`translate3d(0,${shift}px,0)`:'';
      if(row.style.transform!==transform) row.style.transform=transform;
      if(inPath) row.style.setProperty('--ritmo-shift-y',`${shift}px`);
      else row.style.removeProperty('--ritmo-shift-y');
    });
  };
  const endDrag = (commit:boolean) => {
    if(timer.current!==null) window.clearTimeout(timer.current);
    if(frame.current!==null) window.cancelAnimationFrame(frame.current);
    timer.current=null; frame.current=null;
    const movingTarget=target.current;
    clearPreview();
    if(commit && draggingRef.current && movingTarget && movingTarget!==track.id){
      const container=document.querySelector<HTMLElement>('[data-song-list]');
      onReorder?.(track.id,movingTarget);
      window.requestAnimationFrame(()=>animateVerticalReorder(container,before.current,'[data-manual-track-id]','manualTrackId'));
    }
    draggingRef.current=false; start.current=null; point.current=null; target.current=null; before.current=new Map(); setDragging(false);
  };
  const pointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!manual || !event.isPrimary || event.pointerType!=='touch' && event.button!==0) return;
    const handle=event.currentTarget;
    const row=handle.closest<HTMLDivElement>('[data-manual-track-id]');
    if(!row) return;
    rowRef.current=row;
    start.current={x:event.clientX,y:event.clientY}; point.current={x:event.clientX,y:event.clientY}; target.current=track.id;
    before.current=captureVerticalPositions(document.querySelector('[data-song-list]'),'[data-manual-track-id]','manualTrackId');
    dragScrollStart.current=window.scrollY;
    timer.current=window.setTimeout(()=>{
      if(!start.current) return;
      draggingRef.current=true; setDragging(true);
      try { if(typeof navigator!=='undefined' && 'vibrate' in navigator) navigator.vibrate(8); } catch { /* Haptics are optional. */ }
      paintPreview(point.current?.x ?? event.clientX,point.current?.y ?? event.clientY);
      const autoScroll=()=>{
        const current=point.current;
        if(!draggingRef.current || !current) return;
        const edge=64;
        const speed=current.y<edge ? -Math.min(12,(edge-current.y)/5) : current.y>window.innerHeight-edge ? Math.min(12,(current.y-window.innerHeight+edge)/5) : 0;
        if(speed) window.scrollBy(0,speed);
        paintPreview(current.x,current.y);
        frame.current=window.requestAnimationFrame(autoScroll);
      };
      frame.current=window.requestAnimationFrame(autoScroll);
    },420);
    const move=(e:PointerEvent)=>{
      point.current={x:e.clientX,y:e.clientY};
      if(!start.current) return;
      if(!draggingRef.current && Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>9){
        if(timer.current!==null) window.clearTimeout(timer.current);
        timer.current=null; start.current=null; point.current=null; return;
      }
    };
    const cleanupListeners=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);};
    const up=()=>{cleanupListeners();endDrag(true);};
    const cancel=()=>{cleanupListeners();endDrag(false);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',cancel,{once:true});
  };
  useEffect(()=>()=>{if(timer.current!==null)window.clearTimeout(timer.current);if(frame.current!==null)window.cancelAnimationFrame(frame.current);clearPreview();},[]);
  return <div ref={rowRef} data-manual-track-id={manual?track.id:undefined} className={`ritmo-song-row flex items-center gap-3 py-2 border-b border-white/[0.06] ${current?'text-amber-400':''} ${dragging?'opacity-95':''}`}><button onClick={onPlay} className="relative"><Artwork track={track} className="w-12 h-12 rounded-lg" />{current&&<span className="absolute inset-0 grid place-items-center bg-black/50 rounded-lg">{playing?<Pause size={17}/>:<Play size={17}/>}</span>}</button><button onClick={onPlay} className="flex-1 min-w-0 text-start"><b className="block truncate text-sm">{track.title}</b><span className="block truncate text-xs text-slate-400">{track.artist} · {track.album}</span></button><span className="text-xs text-slate-500">{clock(track.duration)}</span>{manual&&<button type="button" aria-label={`جابجایی آهنگ: ${track.title}`} title="لمس طولانی و کشیدن برای جابه‌جایی" className="ritmo-song-drag-handle" onPointerDown={pointerDown}>⠿</button>}<button onClick={onFavorite} aria-label={`${track.isFavorite?'حذف از':'افزودن به'} مورد علاقه‌ها: ${track.title}`} aria-pressed={!!track.isFavorite}><Heart size={17} className={track.isFavorite?'fill-rose-400 text-rose-400':''}/></button><button onClick={onMore} aria-label={`عملیات: ${track.title}`}><MoreVertical size={18}/></button></div>;
}

type PlayerProps = {
  track: MediaTrack; playing: boolean; position: number; duration: number; speed: number; speedOpen: boolean;
  sleepTimer: (minutes: number | null) => void; sleepTimerRemaining: number | null;
  volume: number; volumeChange: (value: number) => void;
  armResetNonce: number;
  setSpeedOpen: (value: boolean) => void; mode: PlaybackMode; modeChange: (mode: PlaybackMode) => void; skin: PlayerSkin; skinChange: (skin: PlayerSkin) => void;
  close: () => void; play: () => void; prev: () => void; next: () => void; seek: (value: number) => void;
  speedChange: (value: number) => void; queue: () => void; favorite: () => void; more: () => void; equalizerChange: (gains: number[]) => void;
};
function Player(props: PlayerProps) {
  return <LyricsTrackContext.Provider value={{ id: props.track.id, uri: props.track.nativeUri, album: props.track.album, duration: props.duration || props.track.duration }}>
    <PlayerContent {...props} />
  </LyricsTrackContext.Provider>;
}
function PlayerContent({ track, playing, position, duration, speed, volume, volumeChange, speedOpen, armResetNonce, setSpeedOpen, mode, modeChange, skin, skinChange, close, play, prev, next, seek, speedChange, queue, favorite, more, sleepTimer, sleepTimerRemaining, equalizerChange }: PlayerProps) {
  const [skinOpen, setSkinOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const progress = duration > 0 ? Math.max(0, Math.min(100, position / duration * 100)) : 0;
  const ModeIcon = mode === 'shuffle' ? Shuffle : mode === 'song' ? Repeat1 : mode === 'queue' ? Repeat : ListStart;
  const modeLabel = PLAYBACK_MODES.find(m => m.id === mode)!.label;
  const cycleMode = () => modeChange(PLAYBACK_MODES[(PLAYBACK_MODES.findIndex(m => m.id === mode) + 1) % PLAYBACK_MODES.length].id);
  const leave = () => { if (closing) return; setClosing(true); window.setTimeout(close, 180); };
  if (isReferenceSkin(skin)) return <div className={`ritmo-player ritmo-player-reference ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="پخش‌کننده ریتمو" dir="rtl"><div className="ritmo-player-shell">
    <ReferencePlayerSkin skin={skin} artwork={<Artwork track={track} className="ritmo-player-cover" />} title={track.title} artist={track.artist} genre={track.genre} year={track.year} lyrics={track.lyrics} playing={playing} position={position} duration={duration}
      controls={{ play, prev, next, seek, favorite, queue, cycleMode, isFavorite: !!track.isFavorite, mode, modeLabel, close: leave, more, sleepTimer, sleepTimerRemaining, equalizerChange,
        chooseSkin: () => { setSkinOpen(true); setSpeedOpen(false); }, skinOpen, volume, volumeChange, speed, speedChange,
        setShuffle: () => modeChange(mode === 'shuffle' ? 'normal' : 'shuffle'),
        setRepeat: () => modeChange(mode === 'song' ? 'queue' : mode === 'queue' ? 'normal' : 'song') }} />
    </div>{skinOpen && <PlayerSkinPicker selected={skin} onSelect={value => { skinChange(value); setSkinOpen(false); }} artwork={<Artwork track={track} className="ritmo-player-cover" />} title={track.title} artist={track.artist} onClose={() => setSkinOpen(false)} />}</div>;
  return <div className={`ritmo-player ${skin === 'nocturne' ? 'ritmo-player-nocturne' : ''} ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="پخش‌کننده ریتمو" dir="rtl"><div className="ritmo-player-shell">
    {skin !== 'nocturne' && <div className="ritmo-player-toolbar"><button onClick={leave} aria-label="بازگشت از Player"><ArrowRight /></button><div className="ritmo-player-left-actions" dir="ltr"><button onClick={more} aria-label={`عملیات: ${track.title}`} aria-haspopup="dialog"><MoreVertical size={21} /></button><button aria-label="پوسته Player" aria-haspopup="dialog" aria-expanded={skinOpen} onClick={() => { setSkinOpen(true); setSpeedOpen(false); }}><Palette size={20} /></button></div>
    </div>}
    {skin === 'nocturne' ? <NocturnePlayerSkin artwork={<Artwork track={track} className="ritmo-player-cover" />} title={track.title} artist={track.artist} lyrics={track.lyrics} playing={playing} position={position} duration={duration} controls={{ play, prev, next, seek, favorite, queue, cycleMode, isFavorite: !!track.isFavorite, mode, modeLabel, close: leave, more, sleepTimer, sleepTimerRemaining, equalizerChange, chooseSkin: () => { setSkinOpen(true); setSpeedOpen(false); }, skinOpen, volume, volumeChange, speed, speedChange }} /> : <>
    <PlayerSkins skin={skin} playing={playing} armReset={armResetNonce} trackId={track.id} position={position} duration={duration} playbackRate={speed} artwork={<Artwork track={track} className="ritmo-player-cover" />} title={track.title} artist={track.artist} />
    <div className="ritmo-player-track-heading"><div className="ritmo-player-copy"><h1>{track.title}</h1><p>{track.artist}</p></div><button onClick={favorite} aria-label={track.isFavorite ? 'حذف از مورد علاقه‌ها' : 'افزودن به مورد علاقه‌ها'} aria-pressed={!!track.isFavorite}><Heart className={track.isFavorite ? 'fill-rose-400 text-rose-400' : ''} /></button></div>
    <div className="flex items-center gap-3 text-xs text-slate-400" dir="ltr"><span className="shrink-0">{clock(position)}</span><PlayerSeekBar position={position} duration={duration} progress={progress} seek={seek} /><span className="shrink-0">{clock(duration)}</span></div>
    <div className="ritmo-player-transport" dir="ltr"><button className="ritmo-transport-utility" onClick={queue} aria-label="صف پخش"><ListMusic size={21} /></button><button onClick={prev} aria-label="قبلی"><SkipBack /></button><button onClick={play} aria-label={playing ? 'توقف موقت' : 'پخش'} className="ritmo-play-button">{playing ? <Pause /> : <Play />}</button><button onClick={next} aria-label="بعدی"><SkipForward /></button><button className="ritmo-transport-utility" data-mode={mode} onClick={cycleMode} aria-label={`حالت پخش: ${modeLabel}؛ لمس برای تغییر`} title={modeLabel}><ModeIcon size={21} /></button><span className="ritmo-mode-status" role="status" aria-live="polite">{modeLabel}</span></div>
    <div className="ritmo-player-navigation" aria-hidden="true" />
    <PlayerSkinMenus slot="top" controls={{ play, prev, next, seek, favorite, queue, cycleMode, isFavorite: !!track.isFavorite, mode, modeLabel, close: leave, more, sleepTimer, sleepTimerRemaining, equalizerChange, chooseSkin: () => { setSkinOpen(true); setSpeedOpen(false); }, skinOpen, volume, volumeChange, speed, speedChange }} title={track.title} artist={track.artist} />
    <PlayerSkinMenus slot="bottom" controls={{ play, prev, next, seek, favorite, queue, cycleMode, isFavorite: !!track.isFavorite, mode, modeLabel, close: leave, more, sleepTimer, sleepTimerRemaining, equalizerChange, chooseSkin: () => { setSkinOpen(true); setSpeedOpen(false); }, skinOpen, volume, volumeChange, speed, speedChange }} lyrics={track.lyrics} position={position} title={track.title} artist={track.artist} />
    </>}
  </div>{skinOpen && <PlayerSkinPicker selected={skin} onSelect={value => { skinChange(value); setSkinOpen(false); }} artwork={<Artwork track={track} className="ritmo-player-cover" />} title={track.title} artist={track.artist} onClose={() => setSkinOpen(false)} />}</div>;
}
