import React, { useState } from 'react';
import { Search, Heart, Play, Pause, Trash2, Music2, Sparkles, PlusCircle } from 'lucide-react';
import { Track, ThemeType, Language } from '../types';

interface QueueDrawerProps {
  tracks: Track[];
  currentTrack: Track;
  isPlaying: boolean;
  onSelectTrack: (track: Track) => void;
  onTogglePlay: () => void;
  onToggleFavorite: (trackId: string) => void;
  onDeleteTrack?: (trackId: string) => void;
  onOpenUpload: () => void;
  theme: ThemeType;
  lang: Language;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  tracks,
  currentTrack,
  isPlaying,
  onSelectTrack,
  onTogglePlay,
  onToggleFavorite,
  onDeleteTrack,
  onOpenUpload,
  theme,
  lang,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'custom'>('all');

  const filteredTracks = tracks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.titleEn.toLowerCase().includes(search.toLowerCase()) ||
      t.artist.toLowerCase().includes(search.toLowerCase()) ||
      t.artistEn.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filter === 'favorites') return !!t.isFavorite;
    if (filter === 'custom') return !!t.isCustom;
    return true;
  });

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const accentBorder = {
    obsidian: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
    cyber: 'border-cyan-400/50 bg-cyan-500/10 text-cyan-300',
    emerald: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
    velvet: 'border-rose-500/50 bg-rose-500/10 text-rose-300',
    platinum: 'border-slate-300/50 bg-slate-300/10 text-slate-100'
  }[theme];

  return (
    <div className="flex flex-col h-full w-full rounded-3xl bg-[#090a10]/80 border border-white/10 backdrop-blur-xl p-5 shadow-2xl">
      {/* Header & Search */}
      <div className="space-y-3 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music2 className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              {lang === 'fa' ? 'صف پخش و آرشیو موسیقی' : 'Playback Queue & Library'}
            </h3>
          </div>
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-white/10 hover:bg-white/20 rounded-xl transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'افزودن آهنگ' : 'Add Track'}</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'fa' ? 'جستجوی نام آهنگ، خواننده یا سبک...' : 'Search songs, artists, or genres...'}
            className="w-full pl-4 pr-10 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] rounded-xl border border-white/[0.05]">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              filter === 'all' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'fa' ? 'همه قطعات' : 'All Tracks'} ({tracks.length})
          </button>
          <button
            onClick={() => setFilter('favorites')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              filter === 'favorites' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'fa' ? 'علاقه‌مندی‌ها' : 'Favorites'} ({tracks.filter((t) => t.isFavorite).length})
          </button>
          <button
            onClick={() => setFilter('custom')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              filter === 'custom' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'fa' ? 'آپلود شده' : 'Uploaded'} ({tracks.filter((t) => t.isCustom).length})
          </button>
        </div>
      </div>

      {/* Tracks List */}
      <div className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1">
        {filteredTracks.length > 0 ? (
          filteredTracks.map((track) => {
            const isCurrent = track.id === currentTrack.id;
            return (
              <div
                key={track.id}
                className={`group flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-200 ${
                  isCurrent
                    ? accentBorder
                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/15 text-slate-300'
                }`}
              >
                {/* Left: Thumbnail & Title */}
                <div
                  onClick={() => {
                    if (isCurrent) {
                      onTogglePlay();
                    } else {
                      onSelectTrack(track);
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                >
                  <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/10">
                    <img
                      src={track.coverArt}
                      alt={track.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    {isCurrent && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        {isPlaying ? (
                          <div className="flex items-end gap-0.5 h-3.5">
                            <span className="w-1 bg-amber-400 animate-pulse h-full rounded-full" />
                            <span className="w-1 bg-amber-300 animate-pulse h-2 rounded-full delay-100" />
                            <span className="w-1 bg-amber-400 animate-pulse h-3 rounded-full delay-200" />
                          </div>
                        ) : (
                          <Play className="w-4 h-4 text-white" />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold truncate text-white">
                      {lang === 'fa' ? track.title : track.titleEn}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {lang === 'fa' ? track.artist : track.artistEn}
                    </p>
                  </div>
                </div>

                {/* Right: Actions & Duration */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {formatDuration(track.duration)}
                  </span>

                  {/* Favorite Heart */}
                  <button
                    onClick={() => onToggleFavorite(track.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        track.isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-500'
                      }`}
                    />
                  </button>

                  {/* Delete button if uploaded */}
                  {track.isCustom && onDeleteTrack && (
                    <button
                      onClick={() => onDeleteTrack(track.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                      title={lang === 'fa' ? 'حذف قطعه' : 'Delete track'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-2">
            <Music2 className="w-8 h-8 opacity-40" />
            <p className="text-xs">
              {lang === 'fa' ? 'هیچ آهنگی مطابق جستجو یافت نشد' : 'No matching tracks found'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
