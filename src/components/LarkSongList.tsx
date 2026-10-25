import React from 'react';
import { Play, Pause, Heart, MoreVertical, Shuffle, Music, Trash2 } from 'lucide-react';
import { Track, ThemeType, Language } from '../types';

interface LarkSongListProps {
  tracks: Track[];
  currentTrack?: Track;
  isPlaying: boolean;
  onSelectTrack: (track: Track) => void;
  onTogglePlay: () => void;
  onToggleFavorite: (id: string) => void;
  onDeleteTrack?: (id: string) => void;
  onPlayAll: () => void;
  onShuffleAll: () => void;
  onOpenPlayer: () => void;
  onQueue?: (track: Track, action: 'add' | 'next') => void;
  theme: ThemeType;
  lang: Language;
}

export const LarkSongList: React.FC<LarkSongListProps> = ({
  tracks,
  currentTrack,
  isPlaying,
  onSelectTrack,
  onTogglePlay,
  onToggleFavorite,
  onDeleteTrack,
  onPlayAll,
  onShuffleAll,
  onOpenPlayer,
  onQueue,
  theme,
  lang,
}) => {
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-3">
      {/* Top action bar: Play All & Shuffle All */}
      <div className="flex items-center justify-between py-2 mb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <button
            onClick={onPlayAll}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
            <span>{lang === 'fa' ? 'پخش همه' : 'Play All'}</span>
            <span className="text-[11px] text-slate-400 font-mono">({tracks.length})</span>
          </button>

          <button
            onClick={onShuffleAll}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/[0.06] transition-colors"
            title={lang === 'fa' ? 'پخش تصادفی همه' : 'Shuffle All'}
          >
            <Shuffle className="w-4 h-4" />
          </button>
        </div>

        <span className="text-xs text-slate-400 font-medium">
          {lang === 'fa' ? `${tracks.length} آهنگ` : `${tracks.length} Tracks`}
        </span>
      </div>

      {/* Song List */}
      <div className="space-y-1">
        {tracks.length > 0 ? (
          tracks.map((track, index) => {
            const isCurrent = track.id === currentTrack?.id;
            return (
              <div
                key={track.id}
                className={`group flex items-center justify-between p-2.5 rounded-2xl transition-all duration-150 ${
                  isCurrent
                    ? 'bg-amber-400/10 border border-amber-400/30'
                    : 'hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                {/* Left Area: Thumbnail + Info */}
                <div
                  onClick={() => {
                    if (isCurrent && track.mediaType !== 'video') {
                      onOpenPlayer();
                    } else {
                      onSelectTrack(track);
                    }
                  }}
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                >
                  {/* Thumbnail / Animated Equalizer */}
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/10 shadow-sm">
                    <img
                      src={track.coverArt}
                      alt={track.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />

                    {isCurrent && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        {isPlaying ? (
                          <div className="flex items-end gap-0.5 h-3.5">
                            <span className="w-0.5 bg-amber-400 animate-pulse h-full rounded-full" />
                            <span className="w-0.5 bg-amber-300 animate-pulse h-2 rounded-full delay-100" />
                            <span className="w-0.5 bg-amber-400 animate-pulse h-3 rounded-full delay-200" />
                          </div>
                        ) : (
                          <Play className="w-4 h-4 fill-current text-white translate-x-0.5" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Title & Artist */}
                  <div className="min-w-0 flex-1">
                    <h3
                      className={`text-xs sm:text-sm font-semibold truncate ${
                        isCurrent ? 'text-amber-400' : 'text-white'
                      }`}
                    >
                      {lang === 'fa' ? track.title : track.titleEn}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5 truncate">
                      <span>{lang === 'fa' ? track.artist : track.artistEn}</span>
                      <span>·</span>
                      <span className="text-[10px] text-slate-500 font-mono">{track.quality}</span>
                    </div>
                  </div>
                </div>

                {/* Right Area: Duration + Favorite + Delete */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {formatDuration(track.duration)}
                  </span>

                  {/* Favorite Heart */}
                  {onQueue && <details className="relative">
                    <summary className="p-1.5 cursor-pointer list-none text-slate-400" title={lang === 'fa' ? 'صف پخش' : 'Queue'}><MoreVertical className="w-4 h-4" /></summary>
                    <div className="absolute z-20 end-0 top-full bg-[#11131c] border border-white/10 rounded-xl p-2 w-32 text-xs text-white shadow-xl">
                      <button className="block w-full text-start p-2" onClick={() => onQueue(track, 'next')}>{lang === 'fa' ? 'پخش بعدی' : 'Play next'}</button>
                      <button className="block w-full text-start p-2" onClick={() => onQueue(track, 'add')}>{lang === 'fa' ? 'افزودن به صف' : 'Add to queue'}</button>
                    </div>
                  </details>}
                  <button
                    onClick={() => onToggleFavorite(track.id)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        track.isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-400'
                      }`}
                    />
                  </button>

                  {/* Delete track if custom */}
                  {track.isCustom && onDeleteTrack && (
                    <button
                      onClick={() => onDeleteTrack(track.id)}
                      className="p-1.5 rounded-full text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-3">
            <Music className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">
              {lang === 'fa' ? 'هیچ آهنگی در این بخش یافت نشد' : 'No tracks found in this section'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
