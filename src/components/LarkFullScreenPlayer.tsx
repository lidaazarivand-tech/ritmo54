import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Sliders,
  Quote,
  Clock,
  Gauge,
  Volume2,
  VolumeX,
  ListMusic,
  Waves,
} from 'lucide-react';
import { Track, ThemeType, RepeatMode, Language } from '../types';

interface LarkFullScreenPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: Track;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  repeatMode: RepeatMode;
  onCycleRepeat: () => void;
  isShuffled: boolean;
  onToggleShuffle: () => void;
  onToggleFavorite: (id: string) => void;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  sleepTimerSeconds: number | null;
  onStartSleepTimer: (mins: number) => void;
  onCancelSleepTimer: () => void;
  onOpenEqualizer: () => void;
  onOpenQueue: () => void;
  bassBoost: boolean;
  onToggleBassBoost: () => void;
  surround3D: boolean;
  onToggleSurround3D: () => void;
  theme: ThemeType;
  lang: Language;
}

export const LarkFullScreenPlayer: React.FC<LarkFullScreenPlayerProps> = ({
  isOpen,
  onClose,
  currentTrack,
  isPlaying,
  onTogglePlay,
  onPrev,
  onNext,
  currentTime,
  duration,
  onSeek,
  repeatMode,
  onCycleRepeat,
  isShuffled,
  onToggleShuffle,
  onToggleFavorite,
  playbackRate,
  onChangePlaybackRate,
  sleepTimerSeconds,
  onStartSleepTimer,
  onCancelSleepTimer,
  onOpenEqualizer,
  onOpenQueue,
  bassBoost,
  onToggleBassBoost,
  surround3D,
  onToggleSurround3D,
  theme,
  lang,
}) => {
  const [showLyrics, setShowLyrics] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);

  // Subtle Gyroscope state exclusively for album cover
  const coverRef = useRef<HTMLDivElement | null>(null);
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!coverRef.current) return;
    const rect = coverRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Gentle subtle tilt: max ±5 degrees
    const rX = -((y - centerY) / centerY) * 5;
    const rY = ((x - centerX) / centerX) * 5;
    setTiltX(Math.max(-5, Math.min(5, rX)));
    setTiltY(Math.max(-5, Math.min(5, rY)));
  };

  const handleMouseLeave = () => {
    setTiltX(0);
    setTiltY(0);
  };

  // Real Gyroscope for Mobile
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        const rY = Math.max(-5, Math.min(5, e.gamma / 6));
        const rX = Math.max(-5, Math.min(5, (e.beta - 45) / 7));
        setTiltX(-rX);
        setTiltY(rY);
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
    return () => {
      if (window.DeviceOrientationEvent) {
        window.removeEventListener('deviceorientation', handleOrientation, true);
      }
    };
  }, []);

  if (!isOpen) return null;

  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Active lyric finder
  let activeLyricIdx = -1;
  for (let i = 0; i < currentTrack.lyrics.length; i++) {
    if (currentTime >= currentTrack.lyrics[i].time) {
      activeLyricIdx = i;
    } else {
      break;
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#08090e] text-white flex flex-col justify-between animate-in slide-in-from-bottom duration-300 overflow-y-auto">
      {/* Background Soft Glow from current cover */}
      <div
        className="fixed inset-0 pointer-events-none opacity-25 blur-[120px] -z-10"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 35%, #d4af37 0%, transparent 60%)`,
        }}
      />

      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-between px-6 py-5">
        {/* Top header row */}
        <div className="flex items-center justify-between">
          {/* Collapse Chevron Button */}
          <button
            onClick={onClose}
            className="p-2 -ml-2 text-slate-300 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            title={lang === 'fa' ? 'بستن' : 'Close'}
          >
            <ChevronDown className="w-6 h-6" />
          </button>

          {/* Title / Quality */}
          <div className="text-center">
            <span className="text-[11px] text-slate-400 font-medium tracking-wide uppercase">
              {lang === 'fa' ? 'در حال پخش' : 'NOW PLAYING'}
            </span>
            <div className="text-[10px] text-amber-400/90 font-mono">
              {currentTrack.quality}
            </div>
          </div>

          {/* Right: Equalizer & Favorite */}
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenEqualizer}
              className="p-2 text-slate-300 hover:text-amber-400 rounded-full hover:bg-white/10 transition-colors"
              title={lang === 'fa' ? 'اکولایزر' : 'Equalizer'}
            >
              <Sliders className="w-5 h-5" />
            </button>

            <button
              onClick={() => onToggleFavorite(currentTrack.id)}
              className="p-2 text-slate-300 hover:text-rose-400 rounded-full hover:bg-white/10 transition-colors"
            >
              <Heart
                className={`w-5 h-5 ${
                  currentTrack.isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-300'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Center Stage: Album Cover with Subtle Gyroscope OR Lyrics */}
        <div className="my-auto py-4 flex flex-col items-center justify-center">
          {!showLyrics ? (
            /* Cover Art with subtle Gyroscope tilt */
            <div
              ref={coverRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={() => setShowLyrics(true)}
              style={{ perspective: '800px' }}
              className="relative cursor-pointer group"
              title={lang === 'fa' ? 'کلیک برای نمایش متن ترانه' : 'Click to view lyrics'}
            >
              <div
                className="w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden shadow-[0_20px_45px_rgba(0,0,0,0.8)] border border-white/10 transition-transform duration-200 ease-out"
                style={{
                  transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
                }}
              >
                <img
                  src={currentTrack.coverArt}
                  alt={currentTrack.title}
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover transition-transform duration-700 ${
                    isPlaying ? 'scale-105' : 'scale-100'
                  }`}
                />
              </div>

              {/* Tap to view lyrics badge */}
              <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-slate-400 group-hover:text-amber-300 transition-colors">
                <Quote className="w-3.5 h-3.5" />
                <span>{lang === 'fa' ? 'مشاهده متن ترانه' : 'View Lyrics'}</span>
              </div>
            </div>
          ) : (
            /* Lyrics View in Center Stage */
            <div
              onClick={() => setShowLyrics(false)}
              className="w-full h-72 sm:h-80 rounded-3xl bg-white/[0.03] border border-white/10 p-5 overflow-y-auto cursor-pointer text-center space-y-4"
              title={lang === 'fa' ? 'کلیک برای بازگشت به کاور' : 'Click to view cover'}
            >
              <div className="text-[11px] text-amber-400 font-semibold mb-2">
                {lang === 'fa' ? 'متن همگام‌سازی شده (کلیک برای بازگشت)' : 'Synced Lyrics (Tap to return)'}
              </div>
              {currentTrack.lyrics.length > 0 ? (
                currentTrack.lyrics.map((line, idx) => {
                  const isActive = idx === activeLyricIdx;
                  return (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(line.time);
                      }}
                      className={`text-sm sm:text-base transition-colors py-1 ${
                        isActive
                          ? 'text-amber-400 font-bold scale-105'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {line.text}
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 text-xs py-20">
                  {lang === 'fa' ? 'متنی برای این قطعه موجود نیست' : 'No lyrics available'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Track Title and Artist */}
        <div className="text-center space-y-1 mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
            {lang === 'fa' ? currentTrack.title : currentTrack.titleEn}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-medium truncate">
            {lang === 'fa' ? currentTrack.artist : currentTrack.artistEn}
          </p>
        </div>

        {/* Scrub Bar & Timers */}
        <div className="space-y-2 mb-6">
          <div
            className="relative w-full h-1.5 bg-white/15 rounded-full cursor-pointer hover:h-2.5 transition-all overflow-hidden"
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

          <div className="flex justify-between items-center text-[11px] font-mono tabular-nums text-slate-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Primary controls row */}
        <div className="flex items-center justify-between px-3 mb-6">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            className={`p-2.5 rounded-full transition-colors ${
              isShuffled ? 'text-amber-400' : 'text-slate-400 hover:text-white'
            }`}
            title={lang === 'fa' ? 'تصادفی' : 'Shuffle'}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          {/* Previous */}
          <button
            onClick={onPrev}
            className="p-3 text-slate-200 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            title={lang === 'fa' ? 'قبلی' : 'Previous'}
          >
            <SkipBack className="w-6 h-6 fill-current" />
          </button>

          {/* Big Circular Play/Pause (Lark Signature) */}
          <button
            onClick={onTogglePlay}
            className="w-16 h-16 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-[0_0_25px_rgba(212,175,55,0.4)] transition-transform active:scale-95"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current translate-x-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            className="p-3 text-slate-200 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            title={lang === 'fa' ? 'بعدی' : 'Next'}
          >
            <SkipForward className="w-6 h-6 fill-current" />
          </button>

          {/* Repeat */}
          <button
            onClick={onCycleRepeat}
            className={`p-2.5 rounded-full transition-colors ${
              repeatMode !== 'off' ? 'text-amber-400' : 'text-slate-400 hover:text-white'
            }`}
            title={lang === 'fa' ? `تکرار: ${repeatMode}` : `Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Bottom Utility Tools (Speed, Timer, Sound Boost, Queue) */}
        <div className="flex items-center justify-around pt-3 border-t border-white/[0.08] text-xs text-slate-400">
          {/* Speed Selector */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              <Gauge className="w-4 h-4 text-slate-400" />
              <span className="font-mono">{playbackRate}x</span>
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#141620] border border-white/10 rounded-xl p-1 shadow-2xl z-50">
                {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      onChangePlaybackRate(r);
                      setShowSpeedMenu(false);
                    }}
                    className={`block w-full px-3 py-1 text-center font-mono rounded ${
                      playbackRate === r ? 'bg-amber-400 text-slate-950 font-bold' : 'hover:bg-white/10 text-white'
                    }`}
                  >
                    {r}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sleep Timer */}
          <div className="relative">
            <button
              onClick={() => setShowSleepMenu(!showSleepMenu)}
              className={`flex items-center gap-1 transition-colors ${
                sleepTimerSeconds !== null ? 'text-amber-400 font-bold' : 'hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>
                {sleepTimerSeconds !== null
                  ? `${Math.floor(sleepTimerSeconds / 60)}m`
                  : lang === 'fa' ? 'تایمر' : 'Timer'}
              </span>
            </button>
            {showSleepMenu && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#141620] border border-white/10 rounded-xl p-1 shadow-2xl z-50 w-28 text-center">
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      onStartSleepTimer(m);
                      setShowSleepMenu(false);
                    }}
                    className="block w-full px-2 py-1 text-xs hover:bg-white/10 text-white rounded"
                  >
                    {m} {lang === 'fa' ? 'دقیقه' : 'min'}
                  </button>
                ))}
                {sleepTimerSeconds !== null && (
                  <button
                    onClick={() => {
                      onCancelSleepTimer();
                      setShowSleepMenu(false);
                    }}
                    className="block w-full px-2 py-1 text-xs text-red-400 hover:bg-white/5 border-t border-white/10 mt-1"
                  >
                    {lang === 'fa' ? 'لغو' : 'Cancel'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bass Boost */}
          <button
            onClick={onToggleBassBoost}
            className={`flex items-center gap-1 transition-colors ${
              bassBoost ? 'text-amber-400 font-bold' : 'hover:text-white'
            }`}
          >
            <span>{lang === 'fa' ? 'بیس' : 'Bass'}</span>
          </button>

          {/* 3D Sound */}
          <button
            onClick={onToggleSurround3D}
            className={`flex items-center gap-1 transition-colors ${
              surround3D ? 'text-cyan-400 font-bold' : 'hover:text-white'
            }`}
          >
            <Waves className="w-4 h-4" />
            <span>3D</span>
          </button>

          {/* Queue Drawer */}
          <button
            onClick={onOpenQueue}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <ListMusic className="w-4 h-4" />
            <span>{lang === 'fa' ? 'لیست' : 'Queue'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
