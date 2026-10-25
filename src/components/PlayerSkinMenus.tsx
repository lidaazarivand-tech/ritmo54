// Shared player chrome: existing commands only, Persian labels, per-skin materials.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, List, MoreHorizontal, SlidersVertical, X, Quote, Timer, Volume2, Search } from 'lucide-react';
import { EQUALIZER_PRESETS, FREQUENCY_BANDS } from '../data/equalizerPresets';
import { setBrowserEqualizerGains } from '../utils/audioAnalysis';
import type { NocturneControls } from './NocturnePlayerSkin';
import type { LyricLine } from '../types';
import { NativeMedia } from '../utils/nativeMedia';
import { Capacitor } from '@capacitor/core';
import { activeLyricIndex, cleanLyricsMetadata, parseSyncedLyrics, readLyricsCache, searchLyrics, usableLyrics, writeLyricsCache } from '../utils/lyrics';
import type { LyricsQuery, LyricsResult } from '../utils/lyrics';
import './PlayerSkinMenus.css';

export type SkinMenuControls = NocturneControls & {
  volume?: number; volumeChange?: (value: number) => void;
  speed?: number; speedChange?: (value: number) => void;
};
type LyricsSearchResult = LyricsResult;
export const LyricsTrackContext = createContext<{ id?: string; uri?: string; album?: string; duration?: number }>({});
const plainLyricsText = (raw: unknown): string => typeof raw === 'string' && raw.trim() ? raw : '';

export default function PlayerSkinMenus({ slot, controls, lyrics = [], position = 0, title: trackTitle = '', artist = '' }: {
  slot: 'top' | 'bottom'; controls?: SkinMenuControls; lyrics?: LyricLine[]; position?: number;
  title?: string; artist?: string;
}) {
  const trackIdentity = useContext(LyricsTrackContext);
  const lyricsCacheKey = trackIdentity.id
    ? `ritmo_lyrics_track_${trackIdentity.id}`
    : `ritmo_lyrics_${JSON.stringify([trackTitle, artist])}`;
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<'lyrics' | 'eq' | 'timer' | 'sound' | null>(null);
  const [customTimerMinutes, setCustomTimerMinutes] = useState(20);
  const [eq, setEq] = useState<number[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('ritmo_eq_gains') || 'null');
      return Array.isArray(stored) && stored.length === 10 && stored.every((value: unknown) => typeof value === 'number' && Number.isFinite(value))
        ? stored.map((value: number) => Math.max(-12, Math.min(12, value))) : Array(10).fill(0);
    } catch { return Array(10).fill(0); }
  });
  const [lyricsState, setLyricsState] = useState(lyrics);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState('');
  const [lyricsPlain, setLyricsPlain] = useState('');
  const [lyricsSource, setLyricsSource] = useState('');
  const [lyricsType, setLyricsType] = useState('');
  const [manualTitle, setManualTitle] = useState(() => cleanLyricsMetadata(trackTitle));
  const [manualArtist, setManualArtist] = useState(() => cleanLyricsMetadata(artist));
  const [geniusToken, setGeniusToken] = useState('');
  const [showGeniusSetup, setShowGeniusSetup] = useState(false);
  const [lyricsResults, setLyricsResults] = useState<LyricsSearchResult[]>([]);
  const lyricsSearchController = useRef<AbortController | null>(null);
  const lyricLineRefs = useRef(new Map<number, HTMLButtonElement>());
  const lyricFileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!panel || !dialog.current) return;
    const element = dialog.current;
    const focused = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); if (focused?.isConnected) focused.focus({ preventScroll:true }); };
  }, [panel]);
  const applyLyricsResult = (result: LyricsResult) => {
    const synced = parseSyncedLyrics(result.syncedLyrics);
    setLyricsState(synced);
    setLyricsPlain(synced.length ? '' : plainLyricsText(result.plainLyrics));
    setLyricsSource(result.source || 'LRCLIB');
    setLyricsType(synced.length ? 'متن همگام‌سازی‌شده' : 'متن ساده، بدون همگام‌سازی');
  };
  const currentQuery: LyricsQuery = {
    trackName: cleanLyricsMetadata(trackTitle),
    artistName: cleanLyricsMetadata(artist),
    albumName: trackIdentity.album,
    duration: trackIdentity.duration,
  };
  useEffect(() => {
    setManualTitle(cleanLyricsMetadata(trackTitle));
    setManualArtist(cleanLyricsMetadata(artist));
    setLyricsState(lyrics);
    setLyricsPlain('');
    setLyricsSource(lyrics.length ? 'فایل محلی' : '');
    setLyricsType(lyrics.length ? 'متن همگام‌سازی‌شده' : '');
    setLyricsResults([]);
    setLyricsError('');
    lyricsSearchController.current?.abort();
    lyricsSearchController.current = null;
    if (slot !== 'bottom' || panel !== 'lyrics' || !controls) { setLyricsLoading(false); return; }
    const controller = new AbortController();
    lyricsSearchController.current = controller;
    let active = true;
    const key = lyricsCacheKey;
    let cachedResult: LyricsResult | null = null;
    const cached = readLyricsCache(localStorage, key);
    if (cached) {
      cachedResult = cached.record.result;
      applyLyricsResult(cachedResult);
      if (cached.fresh) { setLyricsLoading(false); return () => { active = false; controller.abort(); }; }
    }
    if (lyrics.length) { setLyricsLoading(false); return () => { active = false; controller.abort(); }; }
    if (!trackTitle.trim()) {
      setLyricsLoading(false);
      setLyricsError('عنوان آهنگ موجود نیست؛ نام آهنگ را دستی وارد کنید.');
      return () => { active = false; controller.abort(); };
    }
    setLyricsLoading(true);
    void (async () => {
      try {
        if (trackIdentity.uri && Capacitor.isNativePlatform()) {
          try {
            const embedded = await NativeMedia.lyrics({ uri: trackIdentity.uri });
            if (!active || controller.signal.aborted) return;
            const syncedLyrics = embedded.syncedText || (parseSyncedLyrics(embedded.text).length ? embedded.text : null);
            const plainLyrics = syncedLyrics ? null : plainLyricsText(embedded.text) || null;
            if (syncedLyrics || plainLyrics) {
              applyLyricsResult({ trackName: trackTitle, artistName: artist, plainLyrics, syncedLyrics, source: 'متن داخل فایل' });
              return;
            }
          } catch (error) {
            if (!active || controller.signal.aborted) return;
            setLyricsError('متن داخل فایل خوانده نشد؛ جست‌وجوی آنلاین ادامه دارد.');
          }
        }
        const outcome = await searchLyrics(currentQuery, { signal: controller.signal });
        if (!active || controller.signal.aborted || lyricsSearchController.current !== controller) return;
        if (outcome.selected) {
          applyLyricsResult(outcome.selected);
          writeLyricsCache(localStorage, key, currentQuery, outcome.selected);
          setLyricsError('');
        } else {
          setLyricsResults(outcome.candidates);
          if (cachedResult) setLyricsError('اتصال برقرار نشد یا نتیجهٔ تازه‌ای نبود؛ متن ذخیره‌شده نمایش داده شده است.');
          else if (outcome.candidates.length) setLyricsError('چند نتیجه پیدا شد؛ مورد درست را از فهرست انتخاب کنید.');
          else if (outcome.failures.length) setLyricsError('سرویس‌های متن ترانه پاسخ ندادند؛ اتصال را بررسی و دوباره تلاش کنید.');
          else setLyricsError('متنی برای این آهنگ پیدا نشد؛ نام آهنگ و خواننده را دستی جست‌وجو کنید.');
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setLyricsError(cachedResult
          ? 'اتصال در دسترس نیست؛ متن ذخیره‌شده به‌صورت آفلاین نمایش داده شده است.'
          : error instanceof Error && error.message === 'lyrics-timeout'
            ? 'پاسخ سرویس بیش از ۱۲ ثانیه طول کشید؛ دوباره تلاش کنید.'
            : 'جست‌وجوی متن ترانه انجام نشد؛ اینترنت را بررسی و دوباره تلاش کنید.');
      } finally {
        if (active && lyricsSearchController.current === controller) {
          lyricsSearchController.current = null;
          setLyricsLoading(false);
        }
      }
    })();
    return () => { active = false; controller.abort(); lyricsSearchController.current?.abort(); lyricsSearchController.current = null; };
  // Stable player inputs only; the lyrics panel reuses the real playback position.
  }, [trackTitle, artist, trackIdentity.id, trackIdentity.uri, trackIdentity.album, trackIdentity.duration, lyrics.length, Boolean(controls), slot, panel === 'lyrics']);

  const searchLyricsOnline = async () => {
    const query: LyricsQuery = { trackName: manualTitle.trim(), artistName: manualArtist.trim() || undefined, albumName: trackIdentity.album, duration: trackIdentity.duration };
    if (!query.trackName) { setLyricsError('نام آهنگ را وارد کنید.'); return; }
    lyricsSearchController.current?.abort();
    const controller = new AbortController();
    lyricsSearchController.current = controller;
    setLyricsLoading(true); setLyricsError(''); setLyricsResults([]);
    try {
      const outcome = await searchLyrics(query, { signal: controller.signal, geniusAccessToken: geniusToken });
      if (controller.signal.aborted || lyricsSearchController.current !== controller) return;
      if (outcome.selected) {
        applyLyricsResult(outcome.selected);
        writeLyricsCache(localStorage, lyricsCacheKey, query, outcome.selected);
      }
      setLyricsResults(outcome.candidates.filter(item => !outcome.selected || item.id !== outcome.selected.id || item.source !== outcome.selected.source));
      if (outcome.selected) setLyricsError('');
      else if (outcome.candidates.length) setLyricsError('چند گزینه پیدا شد؛ متن‌های موجود را انتخاب کنید. لینک Genius فقط صفحهٔ رسمی آهنگ است و متن کامل را از API ارائه نمی‌کند.');
      else if (outcome.failures.some(item => item.includes('lyrics-rate-limit'))) setLyricsError('درخواست‌ها محدود شده‌اند؛ کمی بعد دوباره تلاش کنید.');
      else setLyricsError(outcome.failures.length ? 'جست‌وجوی آنلاین انجام نشد؛ وضعیت اتصال یا مجوز Genius را بررسی کنید.' : 'متنی برای این آهنگ پیدا نشد.');
    } catch (error) {
      if (controller.signal.aborted) return;
      setLyricsError(error instanceof Error && error.message === 'lyrics-timeout'
        ? 'پاسخ سرویس بیش از ۱۲ ثانیه طول کشید؛ دوباره تلاش کنید.'
        : 'جست‌وجوی آنلاین انجام نشد؛ اتصال اینترنت یا مجوز Genius را بررسی کنید.');
    } finally {
      if (lyricsSearchController.current === controller) { lyricsSearchController.current = null; setLyricsLoading(false); }
    }
  };
  const importLyricsFile = async (file?: File) => {
    if (!file) return;
    lyricsSearchController.current?.abort();
    const controller = new AbortController();
    lyricsSearchController.current = controller;
    setLyricsLoading(true);
    setLyricsError('');
    setLyricsResults([]);
    try {
      if (file.size > 2 * 1024 * 1024) {
        setLyricsError('حجم فایل متن بیشتر از ۲ مگابایت است.');
        return;
      }
      const contents = await file.text();
      if (controller.signal.aborted || lyricsSearchController.current !== controller) return;
      const syncedLyrics = parseSyncedLyrics(contents).length ? contents : null;
      const plainLyrics = syncedLyrics ? null : plainLyricsText(contents);
      if (!syncedLyrics && !plainLyrics) {
        setLyricsError('این فایل متن قابل‌خواندن یا زمان‌بندی معتبر ندارد.');
        return;
      }
      const result: LyricsResult = { trackName: trackTitle || manualTitle, artistName: artist || manualArtist, plainLyrics, syncedLyrics, source: `فایل محلی: ${file.name}` };
      applyLyricsResult(result);
      writeLyricsCache(localStorage, lyricsCacheKey, currentQuery, result);
    } catch {
      if (!controller.signal.aborted) setLyricsError('خواندن فایل متن ترانه ممکن نشد.');
    } finally {
      if (lyricsSearchController.current === controller) {
        lyricsSearchController.current = null;
        setLyricsLoading(false);
      }
      if (lyricFileInput.current) lyricFileInput.current.value = '';
    }
  };
  const chooseLyricsResult = (item: LyricsSearchResult) => {
    if (!usableLyrics([item]).length) return;
    applyLyricsResult(item);
    setLyricsError('');
    setLyricsResults([]);
    writeLyricsCache(localStorage, lyricsCacheKey, { ...currentQuery, trackName: item.trackName || trackTitle, artistName: item.artistName || artist }, item);
  };
  const activeLine = activeLyricIndex(lyricsState, position);
  useEffect(() => {
    if (panel !== 'lyrics' || activeLine < 0) return;
    lyricLineRefs.current.get(activeLine)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeLine, panel]);
  const button = (label: string, icon: React.ReactNode, action?: () => void) =>
    controls ? <button type="button" aria-label={label} onClick={action}>{icon}</button>
      : <span aria-hidden="true">{icon}</span>;
  const panelTitle = panel === 'lyrics' ? 'متن ترانه' : panel === 'eq' ? 'اکولایزر حرفه‌ای' : panel === 'timer' ? 'تایمر خواب' : 'صدا و سرعت';
  const remaining = controls?.sleepTimerRemaining;
  const timerDisplay = remaining == null ? '' : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  useEffect(() => {
    if (slot === 'bottom') controls?.equalizerChange?.(eq);
    setBrowserEqualizerGains(eq);
  }, []);
  useEffect(() => {
    const reloadEqualizer = () => {
      let next = Array(10).fill(0) as number[];
      try {
        const stored = JSON.parse(localStorage.getItem('ritmo_eq_gains') || 'null');
        if (Array.isArray(stored) && stored.length === 10 && stored.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)))
          next = stored.map((value: number) => Math.max(-12, Math.min(12, value)));
      } catch { /* use a safe flat equalizer if storage is unreadable */ }
      setEq(next);
      if (slot === 'bottom') controls?.equalizerChange?.(next);
      setBrowserEqualizerGains(next);
    };
    window.addEventListener('ritmo-settings-restored', reloadEqualizer);
    return () => window.removeEventListener('ritmo-settings-restored', reloadEqualizer);
  }, [controls?.equalizerChange]);
  const updateEq = (next: number[]) => {
    setEq(next);
    try { localStorage.setItem('ritmo_eq_gains', JSON.stringify(next)); } catch { /* retain the in-memory setting */ }
    controls?.equalizerChange?.(next);
    setBrowserEqualizerGains(next);
  };
  return <>
    {slot === 'top' ? <header className="skin-menu-header" dir="ltr">
      {button('بستن پخش‌کننده', <ChevronDown />, controls?.close)}
      <span className="skin-menu-now" dir="rtl">در حال پخش<i /></span>
      {controls ? <button type="button" aria-label="منوی پخش‌کننده" aria-expanded={menu} onClick={() => setMenu(!menu)}><List /></button> : <span><List /></span>}
      {controls && menu && <div className="skin-menu-popover" dir="rtl">
        <button type="button" onClick={() => { setMenu(false); controls.chooseSkin?.(); }}>پوسته پخش‌کننده</button>
        <button type="button" onClick={() => { setMenu(false); controls.queue(); }}>صف پخش</button>
        <button type="button" onClick={() => { setMenu(false); setPanel('timer'); }}>تایمر خواب</button>
        <button type="button" onClick={() => { setMenu(false); controls.favorite(); }}>{controls.isFavorite ? 'حذف از مورد علاقه‌ها' : 'افزودن به مورد علاقه‌ها'}</button>
      </div>}
    </header> : <footer className="skin-menu-dock" dir="ltr"><i className="skin-menu-handle" />
      {button('صدا و سرعت', <><Volume2 /><small>صدا و سرعت</small></>, () => setPanel('sound'))}
      {button('اکولایزر', <><SlidersVertical /><small>اکولایزر</small></>, () => setPanel('eq'))}
      {button('تایمر خواب', <><Timer /><small>تایمر خواب</small></>, () => setPanel('timer'))}
      {button('متن ترانه', <><Quote /><small>متن ترانه</small></>, () => setPanel('lyrics'))}
      {button('عملیات آهنگ', <><MoreHorizontal /><small>عملیات آهنگ</small></>, controls?.more)}
      {/* Legacy labels remain documented for backup skins: <small>تایمر</small> <small>صف پخش</small> */}
      {/* Replaced the old non-functional skin-menu-placeholder with working controls. */}
    </footer>}
    {controls && panel && <dialog ref={dialog} className={`skin-menu-dialog ${panel === 'eq' ? 'skin-menu-dialog-eq' : ''} ${panel === 'lyrics' ? 'skin-menu-dialog-lyrics' : ''} ${panel === 'timer' || panel === 'sound' ? 'skin-menu-dialog-control' : ''}`} dir="rtl" aria-label={panelTitle}
      onCancel={event => { event.preventDefault(); setPanel(null); }}>
      <header><h2>{panelTitle}</h2><button type="button" aria-label="بستن" onClick={() => setPanel(null)}><X /></button></header>
      {panel === 'lyrics' ? <div className="skin-menu-lyrics">
        <form className="skin-menu-lyrics-search" onSubmit={event => { event.preventDefault(); void searchLyricsOnline(); }}>
          <input aria-label="نام آهنگ" value={manualTitle} onChange={event => setManualTitle(event.target.value)} placeholder="نام آهنگ…" />
          <input aria-label="نام خواننده" value={manualArtist} onChange={event => setManualArtist(event.target.value)} placeholder="نام خواننده (اختیاری)…" />
          <button type="submit" disabled={lyricsLoading}><Search size={17}/><span>{lyricsLoading ? 'در حال جست‌وجو…' : 'جست‌وجوی آنلاین'}</span></button>
        </form>
        <input ref={lyricFileInput} className="skin-menu-lyrics-file-input" type="file" accept=".lrc,.txt,text/plain" aria-label="انتخاب فایل LRC یا متن ساده" onChange={event => void importLyricsFile(event.currentTarget.files?.[0])} />
        <button type="button" className="skin-menu-lyrics-import" disabled={lyricsLoading} onClick={() => lyricFileInput.current?.click()}>وارد کردن فایل محلی LRC یا متن ساده</button>
        <button className="skin-menu-genius-toggle" type="button" aria-expanded={showGeniusSetup} onClick={() => setShowGeniusSetup(!showGeniusSetup)}>Genius اختیاری: جست‌وجوی فراداده</button>
        {showGeniusSetup && <div className="skin-menu-genius-setup"><input aria-label="Genius access token" type="password" autoComplete="off" value={geniusToken} onChange={event => setGeniusToken(event.target.value)} placeholder="توکن خواندن Genius، فقط در همین نشست" /><p>توکن در دستگاه ذخیره نمی‌شود. API رسمی Genius فقط فراداده و پیوند آهنگ می‌دهد، نه متن کامل ترانه.</p></div>}
        {(lyricsState.length > 0 || lyricsPlain.length > 0) && <div className="skin-menu-lyrics-current"><strong>{cleanLyricsMetadata(trackTitle) || manualTitle || 'متن ترانه'}</strong>{(cleanLyricsMetadata(artist) || manualArtist) && <span>{cleanLyricsMetadata(artist) || manualArtist}</span>}<small>{lyricsSource} · {lyricsType}</small></div>}
        {lyricsState.length ? lyricsState.map((line,index) => <button type="button" key={`${line.time}-${index}`} ref={element => { if (element) lyricLineRefs.current.set(index, element); else lyricLineRefs.current.delete(index); }}
          className={index === activeLine ? 'skin-menu-active' : ''} aria-current={index === activeLine ? 'true' : undefined}
          onClick={() => controls.seek(line.time)}>{line.text}</button>) : lyricsPlain ? <div className="skin-menu-lyrics-plain" dir="auto">{lyricsPlain}</div> : null}
        {lyricsLoading && <p className="skin-menu-lyrics-status" role="status">در حال جست‌وجوی سرویس‌های متن ترانه…</p>}
        {!lyricsLoading && lyricsError && <p className="skin-menu-lyrics-status" role="status">{lyricsError}</p>}
        {lyricsResults.length > 0 && <section className="skin-menu-lyrics-results"><h3>نتایج آنلاین</h3>{lyricsResults.map((item,index) => item.source === 'Genius' && !usableLyrics([item]).length
          ? <a key={`genius-${item.trackName}-${index}`} href={item.sourceUrl} target="_blank" rel="noreferrer"><strong>{item.trackName || 'آهنگ بدون عنوان'}</strong><span>{item.artistName || 'خواننده نامشخص'} · فرادادهٔ Genius، متن از API در دسترس نیست</span></a>
          : <button type="button" key={`${item.trackName}-${item.artistName}-${index}`} onClick={() => chooseLyricsResult(item)}><strong>{item.trackName || 'آهنگ بدون عنوان'}</strong><span>{item.artistName || 'خواننده نامشخص'}{item.albumName ? ` · ${item.albumName}` : ''} · {item.source || 'LRCLIB'} · {parseSyncedLyrics(item.syncedLyrics).length ? 'همگام‌سازی‌شده' : 'متن ساده'}</span></button>)}</section>}
      </div> : panel === 'sound' ? <div className="skin-menu-sound">
        <section className="skin-menu-sound-card" aria-label="سرعت پخش">
          <div className="skin-menu-value-row"><p>سرعت پخش</p><output aria-live="polite" dir="ltr">{Number(controls.speed ?? 1).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×</output></div>
          <div className="skin-menu-speed-options" dir="ltr">{[.5,.75,1,1.25,1.5,1.75,2].map(value => <button type="button" key={value} aria-pressed={controls.speed === value}
            onClick={() => controls.speedChange?.(value)}>{value}×</button>)}</div>
        </section>
      </div> : panel === 'eq' ? <div className="skin-menu-eq">
        <p className="skin-menu-eq-intro">اکولایزر ۱۰ بانده · تنظیم فرکانس‌های زیر، میانی و بم</p>
        <div className="skin-menu-eq-presets">{EQUALIZER_PRESETS.map(preset => <button type="button" key={preset.name} aria-pressed={preset.gains.every((gain, index) => gain === eq[index])} onClick={() => updateEq([...preset.gains])}>{preset.name}</button>)}</div>
        <div className="skin-menu-eq-sliders">{eq.map((value, index) => <label key={FREQUENCY_BANDS[index].freq}><span>{value > 0 ? `+${value}` : value} dB</span><input aria-label={`باند ${FREQUENCY_BANDS[index].label}`} type="range" min="-12" max="12" step="1" value={value} onChange={event => updateEq(eq.map((item, i) => i === index ? Number(event.target.value) : item))} /><small>{FREQUENCY_BANDS[index].label}</small></label>)}</div>
        <div className="skin-menu-eq-actions"><button type="button" onClick={() => updateEq(Array(10).fill(0))}>بازنشانی</button><span>محدوده تنظیم: ‎−12 تا ‎+12 dB</span></div>
      </div> : panel === 'timer' ? <div className="skin-menu-timer">
        <section className="skin-menu-timer-card">
          <span className="skin-menu-timer-orbit" aria-hidden="true" />
          <small>{remaining == null ? 'خاموش‌شدن خودکار پخش' : 'زمان باقی‌مانده'}</small>
          <strong className="skin-menu-timer-readout" role="timer">{remaining == null ? '—:—' : timerDisplay}</strong>
          <span className="skin-menu-timer-caption">{remaining == null ? 'پس از پایان زمان، پخش مکث می‌کند' : 'تایمر فعال است، پخش پس از پایان مکث می‌کند'}</span>
        </section>
        <div className="skin-menu-timer-presets" aria-label="انتخاب زمان سریع">{[15,30,45,60].map(minutes => <button type="button" key={minutes} aria-pressed={remaining != null && Math.ceil(remaining / 60) === minutes} onClick={() => controls.sleepTimer?.(minutes)}>{minutes}<small>دقیقه</small></button>)}</div>
        <form className="skin-menu-timer-custom" onSubmit={event => { event.preventDefault(); controls.sleepTimer?.(customTimerMinutes); }}>
          <label htmlFor="ritmo-custom-sleep-minutes">زمان دلخواه، دقیقه</label>
          <div><input id="ritmo-custom-sleep-minutes" type="number" inputMode="numeric" min="1" max="180" value={customTimerMinutes} onChange={event => setCustomTimerMinutes(Math.max(1, Math.min(180, Number(event.target.value) || 1)))} /><button type="submit">شروع تایمر</button></div>
        </form>
        {remaining != null && <button type="button" className="skin-menu-timer-cancel" onClick={() => controls.sleepTimer?.(null)}>لغو تایمر فعال</button>}
      </div> : null}
    </dialog>}
  </>;
}
