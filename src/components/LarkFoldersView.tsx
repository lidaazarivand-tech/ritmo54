import React, { useState } from 'react';
import { UploadCloud, Folder, FileAudio, Play, RefreshCw, Film } from 'lucide-react';
import { Track, ThemeType, Language } from '../types';
import { OfflineToolsPanel } from './OfflineToolsPanel';

interface LarkFoldersViewProps {
  tracks: Track[];
  recentTracks: Track[];
  onSelectTrack: (track: Track) => void;
  onOpenUpload: () => void;
  onRescan: () => void;
  scanError: string;
  selectedTrack?: Track;
  onMessage: (message: string) => void;
  toolMessage: string;
  theme: ThemeType;
  lang: Language;
}

export const LarkFoldersView: React.FC<LarkFoldersViewProps> = ({
  tracks,
  recentTracks,
  onSelectTrack,
  onOpenUpload,
  onRescan,
  scanError,
  selectedTrack,
  onMessage,
  toolMessage,
  theme,
  lang,
}) => {
  const customTracks = tracks.filter((t) => t.isCustom || t.nativeUri);
  const [view, setView] = useState<'all' | 'video' | 'folder' | 'artist' | 'album'>('all');
  const [group, setGroup] = useState('');
  const category = view === 'folder' ? 'folder' : view === 'artist' ? 'artist' : 'album';
  const groups = Array.from(new Set(customTracks.map(t => t[category] || (lang === 'fa' ? 'نامشخص' : 'Unknown'))));
  const visibleTracks = customTracks.filter(t =>
    view === 'video' ? t.mediaType === 'video'
      : view === 'all' ? true : !group || (t[category] || (lang === 'fa' ? 'نامشخص' : 'Unknown')) === group);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 space-y-5">
      <button onClick={onRescan} className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300">
        <RefreshCw className="w-4 h-4" />{lang === 'fa' ? 'اسکن مجدد رسانه‌ها' : 'Rescan media'}
      </button>
      {scanError && <p className="text-xs text-rose-400">{scanError}</p>}
      {toolMessage && <p className="text-xs text-emerald-300">{toolMessage}</p>}
      <OfflineToolsPanel track={selectedTrack} lang={lang} onMessage={onMessage} />
      {recentTracks.length > 0 && (
        <div className="text-xs text-slate-400">
          <div className="mb-2">{lang === 'fa' ? 'اخیراً پخش‌شده' : 'Recently played'}</div>
          <div className="flex gap-2 overflow-x-auto">
            {recentTracks.slice(0, 5).map(track => (
              <button key={track.id} onClick={() => onSelectTrack(track)}
                className="shrink-0 px-3 py-2 bg-white/[0.04] rounded-xl text-slate-200">{track.title}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto text-xs">
        {([
          ['all', lang === 'fa' ? 'همه' : 'All'],
          ['video', lang === 'fa' ? 'ویدیوها' : 'Videos'],
          ['folder', lang === 'fa' ? 'پوشه‌ها' : 'Folders'],
          ['artist', lang === 'fa' ? 'هنرمندان' : 'Artists'],
          ['album', lang === 'fa' ? 'آلبوم‌ها' : 'Albums']
        ] as const).map(([key, label]) =>
          <button key={key} onClick={() => { setView(key); setGroup(''); }}
            className={`shrink-0 px-3 py-2 rounded-full ${view === key ? 'bg-amber-400 text-slate-950' : 'bg-white/[0.06] text-slate-300'}`}>{label}</button>)}
      </div>
      {(view === 'folder' || view === 'artist' || view === 'album') && (
        <select value={group} onChange={e => setGroup(e.target.value)}
          className="bg-[#11131c] text-slate-200 text-xs rounded-xl p-2 border border-white/10">
          <option value="">{lang === 'fa' ? 'همه' : 'All'}</option>
          {groups.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      )}
      {/* Upload Banner */}
      <div
        onClick={onOpenUpload}
        className="cursor-pointer border-2 border-dashed border-amber-400/40 bg-amber-400/5 hover:bg-amber-400/10 rounded-3xl p-6 text-center transition-all group"
      >
        <div className="w-12 h-12 rounded-2xl bg-amber-400/20 text-amber-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
          <UploadCloud className="w-6 h-6" />
        </div>
        <h3 className="text-sm sm:text-base font-bold text-white mb-1">
          {lang === 'fa' ? 'افزودن فایل صوتی' : 'Import Audio File'}
        </h3>
        <p className="text-xs text-slate-400">
          {lang === 'fa'
            ? 'فایل‌های صوتی خود را انتخاب یا درگ اند دراپ کنید (MP3, WAV, FLAC, OGG)'
            : 'Select or drag & drop your audio files (MP3, WAV, FLAC, OGG)'}
        </p>
      </div>

      {/* Uploaded Files Section */}
      <div>
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Folder className="w-4 h-4 text-amber-400" />
            <span>{lang === 'fa' ? 'رسانه‌های دستگاه' : 'Device Media'}</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {customTracks.length} {lang === 'fa' ? 'فایل' : 'Files'}
          </span>
        </div>

        {customTracks.length > 0 ? (
          <div className="space-y-1.5">
            {visibleTracks.map((track) => (
              <div
                key={track.id}
                onClick={() => onSelectTrack(track)}
                className="cursor-pointer flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400/10 text-amber-400 flex items-center justify-center">
                    {track.mediaType === 'video' ? <Film className="w-5 h-5" /> : <FileAudio className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-white">
                      {track.title}
                    </h4>
                    <p className="text-[11px] text-slate-400">{track.artist}</p>
                  </div>
                </div>

                <div className="p-2 rounded-full bg-white/10 text-white">
                  <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-slate-500 text-xs">
            {lang === 'fa'
              ? 'رسانه‌ای پیدا نشد. مجوز دسترسی را بررسی کنید یا فایلی اضافه کنید.'
              : 'No media found. Check permissions or add a file.'}
          </div>
        )}
      </div>
    </div>
  );
};
