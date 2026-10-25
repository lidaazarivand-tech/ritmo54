import { recoverStorageTransaction, writeStorageTransaction } from './storageTransaction.ts';
import { loadNativePlugin } from './pluginBridge.ts';

// Pure backup validation remains usable without loading a native bridge.
// Platform/bridge dependencies are loaded only when actually needed.
async function nativePlatform(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  return (await import('@capacitor/core')).Capacitor.isNativePlatform();
}
async function nativeFiles(): Promise<{ plugin: SettingsBackupPlugin }> {
  return loadNativePlugin<SettingsBackupPlugin>('SettingsBackup');
}

// Only Ritmo user data is exported. Never enumerate unrelated origin storage.
const diagnostic = (stage: string) => console.info(`[RitmoBackup] ${stage}`);
export const BACKUP_KEYS = [
  'ritmo_favorites', 'ritmo_playlists', 'ritmo_recent',
  'ritmo_volume', 'ritmo_speed', 'ritmo_repeat',
  'ritmo_shuffle', 'ritmo_muted', 'ritmo_sort', 'ritmo_descending', 'ritmo_manual_song_order', 'ritmo_manual_orders',
  'lark_player_theme', 'lark_player_lang', 'lark_player_volume', 'ritmo_last_track',
  'ritmo_player_skin', 'ritmo_trash_days', 'ritmo_eq_gains',
] as const;
export const LAST_BACKUP_KEY = 'ritmo_settings_last_backup';
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
export type StoredData = Record<string, string>;
type Preference = { type: 'string' | 'long' | 'float' | 'int' | 'boolean'; value: string | number | boolean };
export type NativePreferences = Record<string, Record<string, Preference>>;
export type BackupPayload = { storage: StoredData; preferences: NativePreferences };
export type RitmoBackup = {
  app: 'Ritmo'; format: 'ritmo-user-backup'; version: 1;
  appVersion: string; createdAt: string; payload: BackupPayload; checksum: string;
};
interface SettingsBackupPlugin {
  recoverSettings(): Promise<void>;
  exportPreferences(): Promise<{ preferences: NativePreferences }>;
  restorePreferences(options: { preferences: NativePreferences }): Promise<void>;
  saveFile(options: { name: string; content: string }): Promise<{ cancelled: boolean }>;
  openFile(): Promise<{ cancelled: boolean; content?: string }>;
}
let operationActive = false;
async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (operationActive) throw new Error('عملیات پشتیبان دیگری در حال اجرا است؛ منتظر پایان آن بمانید.');
  operationActive = true;
  try { return await work(); }
  finally { operationActive = false; }
}
const invalid = () => new Error('فایل انتخاب‌شده پشتیبان معتبر Ritmo نیست یا خراب شده است.');
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const id = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
  !/[\u0000-\u001f]/.test(value);
const ids = (value: unknown): value is string[] => Array.isArray(value) &&
  value.length <= 100000 && value.every(id);
export const isBackupKey = (key: string) =>
  (BACKUP_KEYS as readonly string[]).includes(key) ||
  key.startsWith('ritmo_position_') && id(key.slice('ritmo_position_'.length));

function validateStorage(storage: unknown): asserts storage is StoredData {
  if (!record(storage) || Object.keys(storage).length > 100000) throw invalid();
  for (const [key, raw] of Object.entries(storage)) {
    if (!isBackupKey(key) || typeof raw !== 'string' || raw.length > MAX_BACKUP_BYTES) throw invalid();
    if (key === 'lark_player_theme') {
      if (!['obsidian', 'cyber', 'emerald', 'velvet', 'platinum', 'amber', 'burgundy', 'bronze'].includes(raw)) throw invalid();
      continue;
    }
    if (key === 'lark_player_lang') { if (!['fa', 'en'].includes(raw)) throw invalid(); continue; }
    if (key === 'ritmo_player_skin') { if (!['cassette', 'vinyl', 'music-ring', 'sleeve-wave', 'nocturne', 'studio-cassette', 'midnight-orbit', 'silent-architecture', 'soft-light', 'cover', 'circular', 'glow', 'waveform'].includes(raw)) throw invalid(); continue; }
    if (key === 'ritmo_last_track') { if (!id(raw)) throw invalid(); continue; }
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw invalid(); }
    if (key === 'ritmo_eq_gains') {
      if (!Array.isArray(value) || value.length !== 10 || !value.every(gain => finite(gain, -12, 12))) throw invalid();
    } else if (['ritmo_favorites', 'ritmo_recent', 'ritmo_manual_song_order'].includes(key)) {
      if (!ids(value)) throw invalid();
    } else if (key === 'ritmo_manual_orders') {
      if (!record(value) || Object.keys(value).length > 10000 || Object.entries(value).some(([scope, order]) => !scope || scope.length > 2048 || Array.from(scope).some(char => char.charCodeAt(0) < 32) || !ids(order) || new Set(order).size !== order.length)) throw invalid();
    } else if (key === 'ritmo_playlists') {
      if (!Array.isArray(value) || value.length > 10000) throw invalid();
      const seen = new Set<string>();
      for (const playlist of value) {
        if (!record(playlist) ||
          Object.keys(playlist).some(k => !['id', 'name', 'trackIds', 'coverTrackId', 'manual'].includes(k)) ||
          !id(playlist.id) || seen.has(playlist.id) ||
          typeof playlist.name !== 'string' || !playlist.name.trim() || playlist.name.length > 4096 ||
          !ids(playlist.trackIds) ||
          playlist.manual !== undefined && typeof playlist.manual !== 'boolean' ||
          playlist.coverTrackId !== undefined && !id(playlist.coverTrackId)) throw invalid();
        seen.add(playlist.id);
      }
    } else if (key === 'ritmo_volume' || key === 'lark_player_volume') { if (!finite(value, 0, 1)) throw invalid(); }
    else if (key === 'ritmo_speed') { if (!finite(value, 0.5, 2)) throw invalid(); }
    else if (key === 'ritmo_trash_days') { if (![7, 30, 60, 90].includes(value as number)) throw invalid(); }
    else if (key === 'ritmo_repeat') { if (typeof value !== 'string' || !['off', 'one', 'all'].includes(value)) throw invalid(); }
    else if (key === 'ritmo_shuffle' || key === 'ritmo_muted' || key === 'ritmo_descending') { if (typeof value !== 'boolean') throw invalid(); }
    else if (key === 'ritmo_sort') { if (typeof value !== 'string' || !['name', 'newest', 'artist', 'album', 'duration', 'recent', 'added', 'manual'].includes(value)) throw invalid(); }
    else if (key.startsWith('ritmo_position_')) { if (!finite(value, 0, Number.MAX_SAFE_INTEGER)) throw invalid(); }
    else throw invalid();
  }
}

function validatePreferences(preferences: unknown): asserts preferences is NativePreferences {
  if (!record(preferences)) throw invalid();
  for (const [group, values] of Object.entries(preferences)) {
    if (!['ritmo_bookmarks', 'ritmo_playback', 'ritmo_playback_state'].includes(group) ||
      !record(values) || Object.keys(values).length > 100000) throw invalid();
    for (const [key, entry] of Object.entries(values)) {
      if (!record(entry) || Object.keys(entry).sort().join(',') !== 'type,value') throw invalid();
      const { type, value } = entry;
      if (group === 'ritmo_bookmarks') {
        if (!id(key) || type !== 'long' || !finite(value, 0, Number.MAX_SAFE_INTEGER) || !Number.isInteger(value)) throw invalid();
      } else if (group === 'ritmo_playback') {
        if (key !== 'mode' || type !== 'string' || typeof value !== 'string' || !['focus', 'sleep', 'workout'].includes(value)) throw invalid();
      } else {
        if (key === 'volume') { if (type !== 'float' || !finite(value, 0, 1)) throw invalid(); }
        else if (key === 'speed') { if (type !== 'float' || !finite(value, 0.5, 2)) throw invalid(); }
        else if (key === 'shuffle') { if (type !== 'boolean' || typeof value !== 'boolean') throw invalid(); }
        else if (key === 'repeat') { if (type !== 'int' || !finite(value, 0, 2) || !Number.isInteger(value)) throw invalid(); }
        else throw invalid();
      }
    }
  }
}
function validatePayload(payload: unknown): asserts payload is BackupPayload {
  if (!record(payload) || Object.keys(payload).sort().join(',') !== 'preferences,storage') throw invalid();
  validateStorage(payload.storage);
  validatePreferences(payload.preferences);
}
function utf8Size(text: string) { return new TextEncoder().encode(text).length; }
const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const aborted = (error: unknown) => !!error && typeof error === 'object' &&
  'name' in error && error.name === 'AbortError';
// Only time out read-only operations. Never race restore/write operations:
// a late mutation after rollback could silently corrupt restored settings.
async function readWithTimeout<T>(operation: Promise<T>, stage = 'خواندن تنظیمات اندروید'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${stage} بیش از ۲۰ ثانیه طول کشید. عملیات قبلی را دوباره پشت سر هم اجرا نکنید؛ یک بار صفحه را ببندید و باز کنید و دوباره امتحان کنید.`)), 20000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function digest(text: string) {
  if (!globalThis.crypto?.subtle) throw new Error('اعتبارسنجی امن پشتیبان در این محیط در دسترس نیست.');
  const bytes = await readWithTimeout(globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)), 'اعتبارسنجی رمزنگاری فایل پشتیبان');
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function signedContent(backup: Omit<RitmoBackup, 'checksum'>) {
  return JSON.stringify({
    app: backup.app, format: backup.format, version: backup.version,
    appVersion: backup.appVersion, createdAt: backup.createdAt, payload: backup.payload,
  });
}
export function collectStorage(storage: Storage = localStorage): StoredData {
  recoverStorageTransaction(storage);
  const result: StoredData = Object.create(null);
  let size = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isBackupKey(key)) {
      const raw = storage.getItem(key);
      if (raw !== null) {
        size += key.length + raw.length;
        if (size > MAX_BACKUP_BYTES) throw new Error('حجم اطلاعات پشتیبان بیش از حد مجاز است.');
        result[key] = raw;
      }
    }
  }
  return { ...result };
}
export async function createBackup(appVersion: string, snapshot: StoredData, platform?: boolean): Promise<RitmoBackup> {
  return exclusive(() => createBackupInternal(appVersion, snapshot, platform));
}
async function createBackupInternal(appVersion: string, snapshot: StoredData, platform?: boolean): Promise<RitmoBackup> {
  if (typeof appVersion !== 'string' || !appVersion || appVersion.length > 128) throw invalid();
  validateStorage(snapshot);
  // Own a stable snapshot before any native await or UI yield.
  const storage = { ...snapshot };
  diagnostic('web snapshot validated');
  await yieldToUI();
  diagnostic('native snapshot requested when applicable');
  const preferences = (platform ?? await nativePlatform())
    ? (await readWithTimeout((async () => (await nativeFiles()).plugin.exportPreferences())(), 'خواندن تنظیمات اندروید برای پشتیبان‌گیری')).preferences : {};
  const payload = { storage, preferences };
  validatePayload(payload);
  diagnostic('combined payload validated');
  const backup: Omit<RitmoBackup, 'checksum'> = {
    app: 'Ritmo', format: 'ritmo-user-backup', version: 1,
    appVersion, createdAt: new Date().toISOString(), payload,
  };
  const content = signedContent(backup);
  if (utf8Size(content) > MAX_BACKUP_BYTES - 128) throw new Error('حجم اطلاعات پشتیبان بیش از حد مجاز است.');
  return { ...backup, checksum: await digest(content) };
}
export async function validateBackup(content: string): Promise<RitmoBackup> {
  if (typeof content !== 'string' || content.length > MAX_BACKUP_BYTES || utf8Size(content) > MAX_BACKUP_BYTES) throw invalid();
  await yieldToUI();
  let value: unknown;
  try { value = JSON.parse(content.replace(/^\uFEFF/, '')); } catch { throw invalid(); }
  if (!record(value) || value.app !== 'Ritmo' || value.format !== 'ritmo-user-backup') throw invalid();
  if (value.version !== 1) throw new Error('نسخه این پشتیبان پشتیبانی نمی‌شود.');
  if (Object.keys(value).sort().join(',') !== 'app,appVersion,checksum,createdAt,format,payload,version' ||
    typeof value.appVersion !== 'string' || !value.appVersion || value.appVersion.length > 128 ||
    typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(value.checksum)) throw invalid();
  validatePayload(value.payload);
  const backup = value as unknown as RitmoBackup;
  if (await digest(signedContent(backup)) !== backup.checksum) throw invalid();
  return backup;
}

type BrowserPicker = Window & {
  showSaveFilePicker?: (options: unknown) => Promise<SaveHandle>;
  showOpenFilePicker?: (options: unknown) => Promise<{ getFile(): Promise<File> }[]>;
};
const pickerTypes = [{ description: 'Ritmo Backup', accept: { 'application/json': ['.json'] } }];
type SaveHandle = {
  createWritable(): Promise<{ write(content: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
  getFile(): Promise<File>;
};
export type BackupSaveTarget = { native: true } | { native: false; handle: SaveHandle };
export function normalizeBackupFileName(input: string, fallback = 'Ritmo-backup'): string {
  const base = (input || '').trim().replace(/\.json$/i, '')
    .replace(/[^\p{L}\p{N} _().-]/gu, '').replace(/^[. ]+/g, '').replace(/[. ]+$/g, '').trim().slice(0, 80);
  return `${base || fallback}.json`;
}
/** Call directly in the click handler, before hashing/exporting loses user activation. */
export async function prepareBackupSave(platform: boolean, requestedName = 'Ritmo-backup'): Promise<BackupSaveTarget | null> {
  const name = normalizeBackupFileName(requestedName);
  if (platform) return { native: true };
  const picker = (window as BrowserPicker).showSaveFilePicker;
  if (!picker) throw new Error('انتخاب محل ذخیره در این مرورگر پشتیبانی نمی‌شود. از نسخه اندروید یا مرورگر دارای انتخابگر فایل استفاده کنید.');
  try {
    const handle = await picker.call(window, { suggestedName: name, types: pickerTypes });
    return { native: false, handle };
  } catch (error) {
    if (aborted(error)) return null;
    throw new Error('انتخاب محل ذخیره پشتیبان انجام نشد. دوباره تلاش کنید.');
  }
}
export async function saveBackupFile(backup: RitmoBackup, target?: BackupSaveTarget, requestedName?: string): Promise<boolean> {
  return exclusive(() => saveBackupFileInternal(backup, target, requestedName));
}
async function saveBackupFileInternal(backup: RitmoBackup, target?: BackupSaveTarget, requestedName?: string): Promise<boolean> {
  const content = JSON.stringify(backup);
  await validateBackup(content);
  diagnostic('backup file write requested');
  const name = normalizeBackupFileName(requestedName || `Ritmo-backup-${backup.createdAt.replace(/[:.]/g, '-')}`);
  const destination = target ?? await prepareBackupSave(await nativePlatform(), name);
  if (!destination) return false;
  if (destination.native === true) return !(await (await nativeFiles()).plugin.saveFile({ name, content })).cancelled;
  try {
    const writable = await destination.handle.createWritable();
    try { await writable.write(content); await writable.close(); }
    catch (error) { await writable.abort().catch(() => {}); throw error; }
    const written = await destination.handle.getFile();
    if (written.size > MAX_BACKUP_BYTES || await written.text() !== content)
      throw new Error('اعتبارسنجی فایل ذخیره‌شده انجام نشد.');
    await validateBackup(await written.text());
    diagnostic('browser backup file read-back verified');
    return true;
  } catch (error) {
    if (aborted(error)) return false;
    throw new Error('ذخیره پشتیبان انجام نشد. دوباره تلاش کنید.');
  }
}
export async function openBackupFile(platform?: boolean): Promise<RitmoBackup | null> {
  return exclusive(() => openBackupFileInternal(platform));
}
async function openBackupFileInternal(platform?: boolean): Promise<RitmoBackup | null> {
  let content: string;
  if (platform ?? await nativePlatform()) {
    const result = await (await nativeFiles()).plugin.openFile();
    if (result.cancelled) return null;
    if (typeof result.content !== 'string') throw invalid();
    content = result.content;
  } else {
    const picker = (window as BrowserPicker).showOpenFilePicker;
    if (!picker) throw new Error('انتخابگر فایل در این مرورگر پشتیبانی نمی‌شود. از نسخه اندروید یا مرورگر دارای انتخابگر فایل استفاده کنید.');
    try {
      const [handle] = await picker.call(window, { multiple: false, types: pickerTypes });
      const file = await handle.getFile();
      if (file.size > MAX_BACKUP_BYTES) throw invalid();
      content = await file.text();
    } catch (error) {
      if (aborted(error)) return null;
      throw error;
    }
  }
  return validateBackup(content);
}

// Rollback on failure across local storage, native preferences and live settings.
// This is best-effort across two stores, not a crash-safe database transaction.
export async function restoreBackup(
  backup: RitmoBackup,
  applyPlayback: (storage: StoredData, rollback?: boolean) => Promise<void>,
  previousPlayback: StoredData,
  storage: Storage = localStorage,
  platform?: boolean,
): Promise<void> {
  return exclusive(() => restoreBackupInternal(backup, applyPlayback, previousPlayback, storage, platform));
}
async function restoreBackupInternal(
  backup: RitmoBackup,
  applyPlayback: (storage: StoredData, rollback?: boolean) => Promise<void>,
  previousPlayback: StoredData,
  storage: Storage,
  platform?: boolean,
): Promise<void> {
  const valid = await validateBackup(JSON.stringify(backup));
  diagnostic('restore payload validated');
  const previous = collectStorage(storage);
  const Files = (platform ?? await nativePlatform()) ? (await nativeFiles()).plugin : null;
  if (Files) await Files.recoverSettings();
  const oldNative = Files ? (await readWithTimeout(Files.exportPreferences(), 'خواندن وضعیت قبلی اندروید پیش از بازیابی')).preferences : {};
  // Prepare a complete replacement before touching either store.
  const next = { ...valid.payload.storage };
  const removed = Object.keys(previous).filter(key => !(key in next));
  const entries = Object.entries(next);
  let nativeAttempted = false;
  let playbackAttempted = false;
  const replace = (target: StoredData) => {
    const existing = collectStorage(storage);
    const changes: Record<string, string | null> = { ...target };
    for (const key of Object.keys(existing)) if (!(key in target)) changes[key] = null;
    // Journal rollback as well: interruption during recovery can be repaired on next startup.
    writeStorageTransaction(changes, storage);
    const actual = collectStorage(storage);
    if (Object.keys(actual).length !== Object.keys(target).length ||
      Object.entries(target).some(([key, value]) => actual[key] !== value))
      throw new Error('بررسی بازگرداندن تنظیمات وب ناموفق بود.');
  };
  try {
    writeStorageTransaction(Object.fromEntries([
      ...entries, ...removed.map(key => [key, null] as const),
    ]), storage);
    if (Files) {
      nativeAttempted = true;
      await Files.restorePreferences({ preferences: valid.payload.preferences });
      const readback = (await readWithTimeout(Files.exportPreferences(), 'بررسی تنظیمات بازیابی‌شده')).preferences;
      if (!samePreferences(readback, valid.payload.preferences)) throw new Error('تنظیمات اندروید تأیید نشد.');
    }
    playbackAttempted = true;
    await applyPlayback(next);
    const readback = collectStorage(storage);
    if (Object.keys(readback).length !== Object.keys(next).length ||
        Object.entries(next).some(([key, value]) => readback[key] !== value))
      throw new Error('تنظیمات وب تأیید نشد.');
    diagnostic('restore read-back verified');
  } catch {
    diagnostic('restore failed; rollback started');
    const failures: unknown[] = [];
    if (playbackAttempted) try { await applyPlayback(previousPlayback, true); } catch (e) { failures.push(e); }
    // Live controls persist their settings; restore the exact native snapshot last.
    if (nativeAttempted && Files) try {
      await Files.restorePreferences({ preferences: oldNative });
      const actual = (await readWithTimeout(Files.exportPreferences(), 'بررسی بازگرداندن تنظیمات اندروید')).preferences;
      if (!samePreferences(actual, oldNative)) throw new Error('بازگرداندن تنظیمات اندروید تأیید نشد.');
    } catch (e) { failures.push(e); }
    try { replace(previous); } catch (e) { failures.push(e); }
    throw new Error(failures.length
      ? 'بازیابی ناموفق بود و بازگرداندن کامل وضعیت قبلی ممکن نشد. پشتیبان اصلی را نگه دارید.'
      : 'بازیابی انجام نشد؛ اطلاعات قبلی حفظ شد.');
  }
}

function samePreferences(a: NativePreferences, b: NativePreferences): boolean {
  return ['ritmo_bookmarks', 'ritmo_playback', 'ritmo_playback_state'].every(group => {
    const left = a[group] || {}, right = b[group] || {};
    return Object.keys(left).length === Object.keys(right).length &&
      Object.entries(right).every(([key, entry]) => left[key]?.type === entry.type &&
        (entry.type === 'float' ? Math.fround(Number(left[key]?.value)) === Math.fround(Number(entry.value)) : left[key]?.value === entry.value));
  });
}
