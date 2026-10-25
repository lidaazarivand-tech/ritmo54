import React, { useState } from 'react';
import { Disc3, Sparkles } from 'lucide-react';
import { Track, ThemeType } from '../types';

interface VinylPlayerProps {
  currentTrack: Track;
  isPlaying: boolean;
  theme: ThemeType;
  onTogglePlay: () => void;
}

export const VinylPlayer: React.FC<VinylPlayerProps> = ({
  currentTrack,
  isPlaying,
  theme,
  onTogglePlay,
}) => {
  const [viewMode, setViewMode] = useState<'vinyl' | 'card'>('vinyl');
  const [imgError, setImgError] = useState(false);

  // Border glow by theme
  const themeGlows = {
    obsidian: 'group-hover:shadow-[0_0_35px_rgba(212,175,55,0.35)]',
    cyber: 'group-hover:shadow-[0_0_35px_rgba(0,240,255,0.4)]',
    emerald: 'group-hover:shadow-[0_0_35px_rgba(16,185,129,0.35)]',
    velvet: 'group-hover:shadow-[0_0_35px_rgba(244,63,94,0.35)]',
    platinum: 'group-hover:shadow-[0_0_35px_rgba(226,232,240,0.35)]'
  };

  const themeRing = {
    obsidian: 'border-amber-500/40 shadow-amber-500/20',
    cyber: 'border-cyan-400/50 shadow-cyan-400/30',
    emerald: 'border-emerald-400/50 shadow-emerald-400/30',
    velvet: 'border-rose-400/50 shadow-rose-400/30',
    platinum: 'border-slate-300/40 shadow-slate-300/20'
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-md mx-auto">
      {/* Top Switcher (Vinyl vs Modern Card) */}
      <div className="flex items-center gap-1.5 p-1 mb-5 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md">
        <button
          onClick={() => setViewMode('vinyl')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
            viewMode === 'vinyl'
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Disc3 className="w-3.5 h-3.5" />
          <span>صفحه گرامافون</span>
        </button>
        <button
          onClick={() => setViewMode('card')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
            viewMode === 'card'
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>کاور هنری</span>
        </button>
      </div>

      {viewMode === 'vinyl' ? (
        /* ================= VINYL TURNTABLE MODE ================= */
        <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center">
          {/* Turntable Base Platter Glow */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/80 via-slate-900/90 to-neutral-900/80 border border-white/10 shadow-2xl backdrop-blur-xl" />

          {/* Rotating Vinyl Disc */}
          <div
            onClick={onTogglePlay}
            className={`cursor-pointer group relative w-[90%] h-[90%] rounded-full bg-[#0c0d12] flex items-center justify-center shadow-[0_15px_35px_rgba(0,0,0,0.85)] border-2 border-neutral-800 transition-shadow duration-300 ${themeGlows[theme]} ${
              isPlaying ? 'animate-spin-slow' : 'animation-paused'
            }`}
            style={{
              backgroundImage: `
                radial-gradient(circle, transparent 40%, rgba(255,255,255,0.02) 41%, transparent 42%),
                radial-gradient(circle, transparent 50%, rgba(255,255,255,0.03) 51%, transparent 52%),
                radial-gradient(circle, transparent 65%, rgba(255,255,255,0.02) 66%, transparent 67%),
                radial-gradient(circle, transparent 78%, rgba(255,255,255,0.03) 79%, transparent 80%),
                conic-gradient(from 0deg, rgba(255,255,255,0.08) 0deg, transparent 60deg, rgba(255,255,255,0.08) 120deg, transparent 180deg, rgba(255,255,255,0.08) 240deg, transparent 300deg, rgba(255,255,255,0.08) 360deg)
              `
            }}
          >
            {/* Vinyl Center Hole & Album Artwork Label */}
            <div className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-2 ${themeRing[theme]} shadow-lg flex items-center justify-center bg-slate-900`}>
              {!imgError ? (
                <img
                  src={currentTrack.coverArt}
                  alt={currentTrack.title}
                  onError={() => setImgError(true)}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover select-none"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-amber-700/60 to-purple-900/60 flex items-center justify-center text-white/80">
                  <Disc3 className="w-8 h-8 opacity-75" />
                </div>
              )}
              {/* Center spindle spindle hole */}
              <div className="absolute w-5 h-5 rounded-full bg-[#181920] border-2 border-neutral-400 shadow-inner flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
              </div>
            </div>
          </div>

          {/* Mechanical Needle Tonearm */}
          <div
            className={`absolute -top-3 -right-2 sm:-top-4 sm:-right-4 w-28 h-40 pointer-events-none transition-transform duration-700 ease-out origin-[20px_20px] ${
              isPlaying ? 'rotate-[26deg]' : 'rotate-0'
            }`}
          >
            {/* Pivot Base */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-400 to-slate-800 border border-slate-300 shadow-lg flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-slate-900 border border-slate-500" />
            </div>
            {/* Metallic Arm Pole */}
            <div className="w-1.5 h-28 bg-gradient-to-r from-slate-300 via-slate-100 to-slate-400 mx-auto shadow-md rounded-full mt-[-6px]" />
            {/* Needle Cartridge Head */}
            <div className="w-4 h-6 bg-gradient-to-b from-amber-600 to-amber-800 rounded-sm mx-auto shadow-sm -mt-1 border border-amber-300 flex items-end justify-center">
              <div className="w-0.5 h-1.5 bg-white mb-0.5" />
            </div>
          </div>
        </div>
      ) : (
        /* ================= MODERN 3D ART CARD MODE ================= */
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden shadow-2xl border border-white/10 group bg-slate-900">
          {!imgError ? (
            <img
              src={currentTrack.coverArt}
              alt={currentTrack.title}
              onError={() => setImgError(true)}
              referrerPolicy="no-referrer"
              className={`w-full h-full object-cover transition-transform duration-700 ${
                isPlaying ? 'scale-105' : 'scale-100'
              }`}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-slate-900 via-neutral-800 to-amber-950 flex flex-col items-center justify-center text-slate-300 p-6 text-center">
              <Disc3 className="w-12 h-12 mb-3 text-amber-400/80 animate-pulse" />
              <span className="text-sm font-semibold">{currentTrack.title}</span>
            </div>
          )}

          {/* Frosted Bottom Scrim */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none flex flex-col justify-end p-5">
            <div className="flex items-center justify-between text-xs text-white/90">
              <span className="font-medium tracking-wide drop-shadow-sm">{currentTrack.genre}</span>
              <span className="tabular-nums text-white/70 font-mono text-[11px] px-2 py-0.5 rounded bg-black/40 border border-white/10">
                {currentTrack.quality}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
