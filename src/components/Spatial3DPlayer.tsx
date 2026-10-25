import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Track, ThemeType, RepeatMode, Language } from '../types';
import { Visualizer } from './Visualizer';

interface Spatial3DPlayerProps {
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
  repeatMode: RepeatMode;
  onCycleRepeat: () => void;
  isShuffled: boolean;
  onToggleShuffle: () => void;
  onToggleFavorite: (id: string) => void;
  bassBoost: boolean;
  onToggleBassBoost: () => void;
  surround3D: boolean;
  onToggleSurround3D: () => void;
  theme: ThemeType;
  lang: Language;
}

export const Spatial3DPlayer: React.FC<Spatial3DPlayerProps> = ({
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
  repeatMode,
  onCycleRepeat,
  isShuffled,
  onToggleShuffle,
  onToggleFavorite,
  bassBoost,
  onToggleBassBoost,
  surround3D,
  onToggleSurround3D,
  theme,
  lang,
}) => {
  const coverRef = useRef<HTMLDivElement | null>(null);

  // Subtle tilt state exclusively for the album cover
  const [coverRotateX, setCoverRotateX] = useState(0);
  const [coverRotateY, setCoverRotateY] = useState(0);
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50, opacity: 0 });
  const [activeDiscStyle, setActiveDiscStyle] = useState<'vinyl' | 'art'>('vinyl');

  // Gentle mouse tilt on the cover image (subtle, max ±5 degrees)
  const handleCoverMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!coverRef.current) return;
    const rect = coverRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Max 5 degrees tilt (subtle & elegant)
    const rotX = -((y - centerY) / centerY) * 5;
    const rotY = ((x - centerX) / centerX) * 5.5;

    setCoverRotateX(Math.max(-5, Math.min(5, rotX)));
    setCoverRotateY(Math.max(-5.5, Math.min(5.5, rotY)));

    setGlarePos({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.25,
    });
  };

  const handleCoverMouseLeave = () => {
    setCoverRotateX(0);
    setCoverRotateY(0);
    setGlarePos((prev) => ({ ...prev, opacity: 0 }));
  };

  // Real Gyroscope sensor support for mobile devices
  useEffect(() => {
    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma !== null && event.beta !== null) {
        // gamma: left-to-right tilt (-90 to 90)
        // beta: front-to-back tilt (-180 to 180)
        const rotY = Math.max(-5, Math.min(5, event.gamma / 5));
        const rotX = Math.max(-5, Math.min(5, (event.beta - 45) / 6));

        setCoverRotateX(-rotX);
        setCoverRotateY(rotY);
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    }

    return () => {
      if (window.DeviceOrientationEvent) {
        window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
      }
    };
  }, []);

  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Theme definitions
  const themeAccents = {
    obsidian: {
      primary: '#d4af37',
      glow: 'rgba(212, 175, 55, 0.35)',
      cardBg: 'from-[#12141c]/90 via-[#0c0e14]/95 to-[#15120b]/90',
      activeBtn: 'bg-amber-400 text-slate-950 shadow-[0_0_20px_rgba(212,175,55,0.4)]',
      border: 'border-white/[0.08]',
      badge: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
    },
    cyber: {
      primary: '#00f0ff',
      glow: 'rgba(0, 240, 255, 0.35)',
      cardBg: 'from-[#080c1e]/90 via-[#070918]/95 to-[#160a22]/90',
      activeBtn: 'bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(0,240,255,0.4)]',
      border: 'border-white/[0.08]',
      badge: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20',
    },
    emerald: {
      primary: '#10b981',
      glow: 'rgba(16, 185, 129, 0.35)',
      cardBg: 'from-[#081814]/90 via-[#05110d]/95 to-[#0a1c16]/90',
      activeBtn: 'bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)]',
      border: 'border-white/[0.08]',
      badge: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
    },
    velvet: {
      primary: '#f43f5e',
      glow: 'rgba(244, 63, 94, 0.35)',
      cardBg: 'from-[#180814]/90 via-[#0e040c]/95 to-[#180710]/90',
      activeBtn: 'bg-rose-400 text-slate-950 shadow-[0_0_20px_rgba(244,63,94,0.4)]',
      border: 'border-white/[0.08]',
      badge: 'text-rose-300 bg-rose-400/10 border-rose-400/20',
    },
    platinum: {
      primary: '#f1f5f9',
      glow: 'rgba(241, 245, 249, 0.25)',
      cardBg: 'from-[#14161f]/90 via-[#0d0e14]/95 to-[#151720]/90',
      activeBtn: 'bg-slate-100 text-slate-950 shadow-[0_0_20px_rgba(255,255,255,0.3)]',
      border: 'border-white/[0.08]',
      badge: 'text-slate-200 bg-white/10 border-white/20',
    },
  }[theme];

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="relative w-full flex flex-col items-center justify-center py-2 sm:py-4 select-none">
      {/* Background Soft Glow (subtle) */}
      <div
        className="absolute w-[360px] sm:w-[460px] h-[360px] sm:h-[460px] rounded-full blur-[80px] opacity-30 transition-all duration-700 pointer-events-none -z-10"
        style={{
          background: `radial-gradient(circle, ${themeAccents.glow} 0%, transparent 70%)`,
        }}
      />

      {/* Main Player Box - Completely flat and stable (no whole-card tilt) */}
      <div className="w-full max-w-[440px] sm:max-w-[460px]">
        <div
          className={`relative rounded-[32px] p-6 sm:p-7 bg-gradient-to-b ${themeAccents.cardBg} border ${themeAccents.border} shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-2xl`}
        >
          {/* Top Bar: Quality & Style Selector */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${themeAccents.badge}`}>
                {currentTrack.quality}
              </span>
              <span className="text-xs text-slate-400">
                {lang === 'fa' ? currentTrack.genre : currentTrack.genreEn}
              </span>
            </div>

            {/* Toggle Vinyl / Cover Art */}
            <div className="flex items-center gap-1 p-0.5 rounded-full bg-white/[0.05] border border-white/10">
              <button
                onClick={() => setActiveDiscStyle('vinyl')}
                className={`px-2.5 py-0.5 text-[11px] rounded-full transition-all ${
                  activeDiscStyle === 'vinyl'
                    ? 'bg-white/20 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {lang === 'fa' ? 'صفحه' : 'Vinyl'}
              </button>
              <button
                onClick={() => setActiveDiscStyle('art')}
                className={`px-2.5 py-0.5 text-[11px] rounded-full transition-all ${
                  activeDiscStyle === 'art'
                    ? 'bg-white/20 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {lang === 'fa' ? 'کاور' : 'Cover'}
              </button>
            </div>
          </div>

          {/* Centerpiece: ONLY THE ALBUM COVER HAS GENTLE GYROSCOPE/TILT */}
          <div className="relative flex items-center justify-center my-6 py-2">
            {/* Visualizer Aura ring behind the disc */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40 scale-90">
              <Visualizer mode="radial" theme={theme} isPlaying={isPlaying} />
            </div>

            {/* Tilt Perspective Wrapper exclusively for the cover */}
            <div
              ref={coverRef}
              onMouseMove={handleCoverMouseMove}
              onMouseLeave={handleCoverMouseLeave}
              style={{ perspective: '800px' }}
              className="relative cursor-pointer"
            >
              {activeDiscStyle === 'vinyl' ? (
                /* Vinyl Disc with gentle gyroscope tilt */
                <div
                  onClick={onTogglePlay}
                  className={`relative w-56 h-56 sm:w-60 sm:h-60 rounded-full bg-[#0a0b10] border-2 border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.85)] flex items-center justify-center transition-transform duration-200 ease-out`}
                  style={{
                    transform: `rotateX(${coverRotateX}deg) rotateY(${coverRotateY}deg)`,
                    backgroundImage: `
                      radial-gradient(circle, transparent 40%, rgba(255,255,255,0.03) 41%, transparent 42%),
                      radial-gradient(circle, transparent 52%, rgba(255,255,255,0.03) 53%, transparent 54%),
                      radial-gradient(circle, transparent 66%, rgba(255,255,255,0.02) 67%, transparent 68%),
                      radial-gradient(circle, transparent 78%, rgba(255,255,255,0.03) 79%, transparent 80%),
                      conic-gradient(from 0deg, rgba(255,255,255,0.08) 0deg, transparent 70deg, rgba(255,255,255,0.08) 140deg, transparent 210deg, rgba(255,255,255,0.08) 280deg, transparent 350deg)
                    `,
                  }}
                >
                  {/* Subtle Glare reflection over the vinyl */}
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none transition-opacity duration-300"
                    style={{
                      background: `radial-gradient(circle 120px at ${glarePos.x}% ${glarePos.y}%, rgba(255, 255, 255, ${glarePos.opacity}), transparent 75%)`,
                    }}
                  />

                  {/* Center Label (Rotates if playing) */}
                  <div
                    className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border border-white/20 shadow-inner flex items-center justify-center bg-slate-900 ${
                      isPlaying ? 'animate-spin-slow' : 'animation-paused'
                    }`}
                  >
                    <img
                      src={currentTrack.coverArt}
                      alt={currentTrack.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover select-none pointer-events-none"
                    />
                    <div className="absolute w-4 h-4 rounded-full bg-[#11131a] border border-white/40 shadow-md flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-white/70" />
                    </div>
                  </div>
                </div>
              ) : (
                /* Cover Art Card with gentle gyroscope tilt */
                <div
                  onClick={onTogglePlay}
                  className="relative w-56 h-56 sm:w-60 sm:h-60 rounded-3xl overflow-hidden shadow-[0_15px_35px_rgba(0,0,0,0.8)] border border-white/10 transition-transform duration-200 ease-out"
                  style={{
                    transform: `rotateX(${coverRotateX}deg) rotateY(${coverRotateY}deg)`,
                  }}
                >
                  <img
                    src={currentTrack.coverArt}
                    alt={currentTrack.title}
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-cover pointer-events-none transition-transform duration-500 ${
                      isPlaying ? 'scale-105' : 'scale-100'
                    }`}
                  />
                  {/* Gentle Glare on Cover */}
                  <div
                    className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                    style={{
                      background: `radial-gradient(circle 150px at ${glarePos.x}% ${glarePos.y}%, rgba(255, 255, 255, ${glarePos.opacity}), transparent 70%)`,
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-3.5">
                    <span className="text-white/90 text-xs font-medium truncate drop-shadow-sm">
                      {currentTrack.album}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Track Information (Clean & Stable) */}
          <div className="text-center space-y-1 mb-5">
            <h2 className="text-xl font-bold text-white tracking-tight truncate px-2">
              {lang === 'fa' ? currentTrack.title : currentTrack.titleEn}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-medium truncate">
              {lang === 'fa' ? currentTrack.artist : currentTrack.artistEn}
            </p>
          </div>

          {/* Minimalist Scrub Bar */}
          <div className="space-y-1.5 mb-5">
            <div
              className="relative w-full h-1.5 bg-white/10 rounded-full cursor-pointer overflow-hidden group hover:h-2 transition-all"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pct = Math.max(0, Math.min(1, clickX / rect.width));
                onSeek(pct * duration);
              }}
            >
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-[11px] font-mono tabular-nums text-slate-400 px-0.5">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Simple & Chic Playback Controls */}
          <div className="flex items-center justify-between px-2 sm:px-3">
            {/* Shuffle */}
            <button
              onClick={onToggleShuffle}
              className={`p-2 rounded-xl transition-all ${
                isShuffled
                  ? 'text-amber-400 bg-amber-400/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title={lang === 'fa' ? 'پخش تصادفی' : 'Shuffle'}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            {/* Prev */}
            <button
              onClick={onPrev}
              className="p-2.5 text-slate-300 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              title={lang === 'fa' ? 'قبلی' : 'Previous'}
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            {/* Center Play/Pause Key */}
            <button
              onClick={onTogglePlay}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 ${themeAccents.activeBtn}`}
              title={isPlaying ? (lang === 'fa' ? 'مکث' : 'Pause') : (lang === 'fa' ? 'پخش' : 'Play')}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current translate-x-0.5" />
              )}
            </button>

            {/* Next */}
            <button
              onClick={onNext}
              className="p-2.5 text-slate-300 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              title={lang === 'fa' ? 'بعدی' : 'Next'}
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            {/* Repeat */}
            <button
              onClick={onCycleRepeat}
              className={`p-2 rounded-xl transition-all ${
                repeatMode !== 'off'
                  ? 'text-amber-400 bg-amber-400/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title={lang === 'fa' ? `تکرار: ${repeatMode}` : `Repeat: ${repeatMode}`}
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Bottom Audio Enhancement & Volume strip */}
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/[0.06]">
            {/* Bass & 3D Toggles */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onToggleBassBoost}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition-all ${
                  bassBoost
                    ? 'bg-amber-400/15 border-amber-400/30 text-amber-300'
                    : 'bg-white/[0.03] border-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'fa' ? 'بیس' : 'Bass'}
              </button>

              <button
                onClick={onToggleSurround3D}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition-all ${
                  surround3D
                    ? 'bg-cyan-400/15 border-cyan-400/30 text-cyan-300'
                    : 'bg-white/[0.03] border-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'fa' ? 'صدای ۳D' : '3D Sound'}
              </button>
            </div>

            {/* Volume & Favorite */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onToggleMute}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="w-16 h-1 bg-white/20 rounded-full cursor-pointer accent-white"
              />

              <button
                onClick={() => onToggleFavorite(currentTrack.id)}
                className="p-1 text-slate-400 hover:text-rose-400 transition-colors ml-1"
              >
                <Heart
                  className={`w-3.5 h-3.5 ${
                    currentTrack.isFavorite ? 'fill-rose-500 text-rose-500' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
