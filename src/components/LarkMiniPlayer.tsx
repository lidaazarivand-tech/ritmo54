import React from 'react';
import { Play, Pause, SkipForward, ListMusic } from 'lucide-react';
import { Track, ThemeType, Language } from '../types';

interface LarkMiniPlayerProps {
  currentTrack: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onOpenPlayer: () => void;
  theme: ThemeType;
  lang: Language;
}

export const LarkMiniPlayer: React.FC<LarkMiniPlayerProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onNext,
  onOpenPlayer,
  theme,
  lang,
}) => {
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0e1017]/95 border-t border-white/10 backdrop-blur-xl shadow-2xl">
      {/* Top Thin Progress Line */}
      <div className="w-full h-1 bg-white/10">
        <div
          className="h-full bg-amber-400 transition-all duration-75"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        {/* Left: Thumbnail & Info (Clicking opens Full Player) */}
        <div
          onClick={onOpenPlayer}
          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer group"
        >
          {/* Circular rotating cover art */}
          <div
            className={`w-11 h-11 rounded-full overflow-hidden bg-slate-800 border border-white/20 shrink-0 shadow-md ${
              isPlaying ? 'animate-spin-slow' : 'animation-paused'
            }`}
          >
            <img
              src={currentTrack.coverArt}
              alt={currentTrack.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover pointer-events-none"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h4 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-amber-400 transition-colors">
              {lang === 'fa' ? currentTrack.title : currentTrack.titleEn}
            </h4>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {lang === 'fa' ? currentTrack.artist : currentTrack.artistEn}
            </p>
          </div>
        </div>

        {/* Right: Quick Playback Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Play/Pause Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePlay();
            }}
            className="w-9 h-9 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-md transition-transform active:scale-95"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current translate-x-0.5" />
            )}
          </button>

          {/* Next Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="p-2 text-slate-300 hover:text-white rounded-full hover:bg-white/[0.08] transition-colors"
            title={lang === 'fa' ? 'بعدی' : 'Next'}
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
};
