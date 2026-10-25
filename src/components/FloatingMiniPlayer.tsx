import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Disc3,
  Heart,
  Maximize2,
} from 'lucide-react';
import { Track, ThemeType, ActiveView, Language } from '../types';

interface FloatingMiniPlayerProps {
  currentTrack: Track;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleFavorite: (id: string) => void;
  currentView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  theme: ThemeType;
  lang: Language;
}

export const FloatingMiniPlayer: React.FC<FloatingMiniPlayerProps> = ({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onPrev,
  onNext,
  currentTime,
  duration,
  onSeek,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  onToggleFavorite,
  currentView,
  onChangeView,
  theme,
  lang,
}) => {
  // Only show when outside the main 3D player view
  if (currentView === 'player') return null;

  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const playBtnBg = {
    obsidian: 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-[0_0_16px_rgba(212,175,55,0.4)]',
    cyber: 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_16px_rgba(0,240,255,0.4)]',
    emerald: 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.4)]',
    velvet: 'bg-rose-400 hover:bg-rose-300 text-slate-950 shadow-[0_0_16px_rgba(244,63,94,0.4)]',
    platinum: 'bg-white hover:bg-slate-200 text-slate-950 shadow-[0_0_16px_rgba(255,255,255,0.4)]',
  }[theme];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-2xl">
      <div className="relative rounded-2xl bg-[#0b0d14]/90 backdrop-blur-2xl border border-white/10 shadow-[0_15px_40px_rgba(0,0,0,0.8)] p-2.5 sm:p-3 overflow-hidden">
        {/* Top subtle progress line */}
        <div
          className="absolute top-0 left-0 right-0 h-1 bg-white/10 cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, clickX / rect.width));
            onSeek(pct * duration);
          }}
        >
          <div
            className="h-full bg-amber-400 transition-[width] duration-75"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {/* Track thumbnail & info */}
          <div
            onClick={() => onChangeView('player')}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer group flex-1"
          >
            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-slate-900 border border-white/10 shrink-0">
              <img
                src={currentTrack.coverArt}
                alt={currentTrack.title}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover transition-transform duration-300 ${
                  isPlaying ? 'scale-105' : ''
                }`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors">
                {lang === 'fa' ? currentTrack.title : currentTrack.titleEn}
              </h4>
              <p className="text-[11px] text-slate-400 truncate">
                {lang === 'fa' ? currentTrack.artist : currentTrack.artistEn}
              </p>
            </div>
          </div>

          {/* Core Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={onPrev}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={onTogglePlay}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 ${playBtnBg}`}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current translate-x-0.5" />
              )}
            </button>

            <button
              onClick={onNext}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={() => onChangeView('player')}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors ml-1"
              title={lang === 'fa' ? 'نمای سه‌بعدی' : '3D View'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
