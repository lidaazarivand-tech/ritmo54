import React, { useEffect, useRef } from 'react';
import { Music, Play, Quote } from 'lucide-react';
import { Track, ThemeType, Language } from '../types';

interface LyricsViewProps {
  track: Track;
  currentTime: number;
  onSeek: (seconds: number) => void;
  theme: ThemeType;
  lang: Language;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  track,
  currentTime,
  onSeek,
  theme,
  lang,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  // Find active line index
  let activeIndex = -1;
  for (let i = 0; i < track.lyrics.length; i++) {
    if (currentTime >= track.lyrics[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  // Smoothly scroll active line to center
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  const activeGlow = {
    obsidian: 'text-amber-300 drop-shadow-[0_0_12px_rgba(212,175,55,0.6)] font-bold text-lg sm:text-xl scale-[1.02]',
    cyber: 'text-cyan-300 drop-shadow-[0_0_12px_rgba(0,240,255,0.6)] font-bold text-lg sm:text-xl scale-[1.02]',
    emerald: 'text-emerald-300 drop-shadow-[0_0_12px_rgba(16,185,129,0.6)] font-bold text-lg sm:text-xl scale-[1.02]',
    velvet: 'text-rose-300 drop-shadow-[0_0_12px_rgba(244,63,94,0.6)] font-bold text-lg sm:text-xl scale-[1.02]',
    platinum: 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.6)] font-bold text-lg sm:text-xl scale-[1.02]'
  }[theme];

  return (
    <div className="relative w-full h-[380px] sm:h-[440px] flex flex-col rounded-3xl bg-[#090a10]/80 border border-white/10 backdrop-blur-xl overflow-hidden p-6 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10">
        <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold">
          <Quote className="w-4 h-4 text-amber-400" />
          <span>{lang === 'fa' ? 'ترانه‌نما (متن همگام‌سازی شده با موسیقی)' : 'Synchronized Lyrics & Translation'}</span>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">
          {lang === 'fa' ? 'روی هر سطر کلیک کنید تا پخش شود' : 'Click any line to jump'}
        </span>
      </div>

      {/* Lyrics lines scroll container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-5 py-8 px-2 scroll-smooth text-center"
      >
        {track.lyrics && track.lyrics.length > 0 ? (
          track.lyrics.map((line, idx) => {
            const isActive = idx === activeIndex;
            return (
              <div
                key={idx}
                ref={isActive ? activeLineRef : null}
                onClick={() => onSeek(line.time)}
                className={`group cursor-pointer transition-all duration-300 py-1.5 px-4 rounded-xl ${
                  isActive
                    ? `${activeGlow} bg-white/[0.04]`
                    : 'text-slate-500 hover:text-slate-300 text-sm sm:text-base font-medium hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="leading-relaxed">{line.text}</span>
                  {isActive && <Play className="w-3 h-3 inline-block shrink-0 animate-pulse text-amber-400" />}
                </div>

                {/* Subtitle translation */}
                {line.translation && (
                  <div
                    className={`text-xs mt-1 transition-opacity ${
                      isActive ? 'text-slate-300 font-normal' : 'text-slate-600'
                    }`}
                  >
                    {line.translation}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-3">
            <Music className="w-10 h-10 opacity-40 animate-pulse" />
            <p className="text-sm">
              {lang === 'fa'
                ? 'متنی برای این قطعه ثبت نشده است (قطعه بی‌کلام یا فایل شخصی)'
                : 'No synchronized lyrics available for this track (Instrumental or user upload)'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
