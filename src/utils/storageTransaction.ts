const JOURNAL = 'ritmo_storage_transaction_v1';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const validKey = (key: string) =>
  /^ritmo_(favorites|playlists|recent|queue|current|volume|muted|speed|repeat|shuffle|sort|descending|manual_song_order|manual_orders|trash_days|position_.+)$/.test(key) ||
  ['lark_player_theme', 'lark_player_lang', 'lark_player_volume', 'ritmo_last_track', 'ritmo_player_skin',
    'ritmo_settings_media_v1', 'ritmo_settings_last_backup', 'ritmo_eq_gains'].includes(key);

/** Roll back an interrupted local-storage transaction before any new write. */
export function recoverStorageTransaction(storage: Store = localStorage): void {
  const raw = storage.getItem(JOURNAL);
  if (raw === null) return;
  const previous: unknown = JSON.parse(raw);
  if (!previous || typeof previous !== 'object' || Array.isArray(previous) ||
      Object.keys(previous).length > 100000 ||
      Object.entries(previous).some(([key, value]) => !validKey(key) || (value !== null && typeof value !== 'string')))
    throw new Error('ثبت ذخیره‌سازی معتبر نیست؛ داده‌ها برای بررسی حفظ شدند.');
  for (const [key, value] of Object.entries(previous)) {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value as string);
  }
  storage.removeItem(JOURNAL);
}

/** Durable rollback intent precedes all related writes. Errors are never swallowed. */
export function writeStorageTransaction(values: Record<string, string | null>, storage: Store = localStorage): void {
  if (Object.keys(values).some(key => !validKey(key))) throw new Error('کلید ذخیره‌سازی نامعتبر است.');
  recoverStorageTransaction(storage);
  const previous: Record<string, string | null> = Object.create(null);
  for (const key of Object.keys(values)) previous[key] = storage.getItem(key);
  storage.setItem(JOURNAL, JSON.stringify(previous));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    storage.removeItem(JOURNAL);
  } catch (error) {
    try { recoverStorageTransaction(storage); }
    catch (rollback) { throw new AggregateError([error, rollback], 'ذخیره و بازگرداندن کامل اطلاعات ممکن نشد؛ ثبت بازیابی حفظ شد.'); }
    throw error;
  }
}
