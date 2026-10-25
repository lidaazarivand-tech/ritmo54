// App-library exclusions only. Never delete, move or rename the original media.
export const MEDIA_SETTINGS_KEY = 'ritmo_settings_media_v1';
export type MediaEntry = {
  id: string; title: string; uri: string; fileName: string; folder: string; date: string;
};
export type MediaSettings = { hidden: MediaEntry[]; deleted: MediaEntry[] };
const validEntry = (value: unknown): value is MediaEntry => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return ['id', 'title', 'uri', 'fileName', 'folder', 'date'].every(key =>
    typeof v[key] === 'string' && (v[key] as string).length <= 4096) &&
    /^audio-[1-9][0-9]*$/.test(v.id as string) &&
    /^content:\/\/media\/(?:external|external_primary)\/audio\/media\/[1-9][0-9]*$/.test(v.uri as string) &&
    (v.uri as string).endsWith('/' + (v.id as string).slice(6)) &&
    Number.isFinite(Date.parse(v.date as string));
};
export function readMediaSettings(storage: Pick<Storage, 'getItem'> = localStorage): MediaSettings {
  const raw = storage.getItem(MEDIA_SETTINGS_KEY);
  if (!raw) return { hidden: [], deleted: [] };
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.hidden) || !Array.isArray(value.deleted) ||
      value.hidden.length + value.deleted.length > 100000 ||
      ![...value.hidden, ...value.deleted].every(validEntry) ||
      new Set([...value.hidden, ...value.deleted].map(v => v.id)).size !== value.hidden.length + value.deleted.length)
    throw new Error('اطلاعات پرونده‌های پنهان یا اخیراً حذف‌شده معتبر نیست؛ برای حفظ داده‌ها تغییری انجام نشد.');
  return value;
}
export function storeMediaSettings(value: MediaSettings, storage: Pick<Storage, 'setItem'> = localStorage) {
  // One atomic localStorage write. A quota/storage failure must not update the UI.
  storage.setItem(MEDIA_SETTINGS_KEY, JSON.stringify(value));
}
export function excludeMedia(value: MediaSettings, kind: keyof MediaSettings, entry: MediaEntry): MediaSettings {
  if (!validEntry(entry)) throw new Error('اطلاعات آهنگ معتبر نیست.');
  return {
    hidden: value.hidden.filter(v => v.id !== entry.id).concat(kind === 'hidden' ? [entry] : []),
    deleted: value.deleted.filter(v => v.id !== entry.id).concat(kind === 'deleted' ? [entry] : []),
  };
}
export function restoreMedia(value: MediaSettings, kind: keyof MediaSettings, id: string): MediaSettings {
  if (!value[kind].some(v => v.id === id)) throw new Error('این مورد دیگر در فهرست وجود ندارد.');
  return { ...value, [kind]: value[kind].filter(v => v.id !== id) };
}
