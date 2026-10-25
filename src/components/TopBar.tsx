import React from 'react';
import { Palette, Globe, UploadCloud, Sliders, Waves, Sparkles, Disc, Music, Quote, ListMusic } from 'lucide-react';
import { ThemeType, Language, ActiveView } from '../types';

interface TopBarProps {
  currentView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  theme: ThemeType;
  onChangeTheme: (theme: ThemeType) => void;
  lang: Language;
  onToggleLang: () => void;
  onOpenUpload: () => void;
  isAmbientActive: boolean;
  onToggleAmbient: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentView,
  onChangeView,
  theme,
  onChangeTheme,
  lang,
  onToggleLang,
  onOpenUpload,
  isAmbientActive,
  onToggleAmbient,
}) => {
  const themes: { id: ThemeType; nameFa: string; nameEn: string; color: string }[] = [
    { id: 'obsidian', nameFa: 'طلایی', nameEn: 'Gold', color: '#d4af37' },
    { id: 'cyber', nameFa: 'نئون', nameEn: 'Cyber', color: '#00f0ff' },
    { id: 'emerald', nameFa: 'زمرد', nameEn: 'Emerald', color: '#10b981' },
    { id: 'velvet', nameFa: 'یاقوت', nameEn: 'Velvet', color: '#f43f5e' },
    { id: 'platinum', nameFa: 'نقره‌ای', nameEn: 'Silver', color: '#e2e8f0' },
  ];

  const views = [
    { id: 'player' as ActiveView, labelFa: 'پخش ۳D', labelEn: 'Player', icon: Disc },
    { id: 'lyrics' as ActiveView, labelFa: 'متن ترانه', labelEn: 'Lyrics', icon: Quote },
    { id: 'queue' as ActiveView, labelFa: 'آرشیو', labelEn: 'Tracks', icon: ListMusic },
    { id: 'equalizer' as ActiveView, labelFa: 'اکولایزر', labelEn: 'Equalizer', icon: Sliders },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[#07080c]/60 backdrop-blur-2xl border-b border-white/[0.06] transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo Wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-white/10 to-amber-400/20 border border-white/15 flex items-center justify-center shadow-lg">
            <span className="text-amber-300 font-bold text-xs tracking-wider">A</span>
          </div>
          <button
            onClick={() => onChangeView('player')}
            className="text-base font-extrabold tracking-widest text-white hover:text-amber-300 transition-colors uppercase"
          >
            AURA
          </button>
        </div>

        {/* Center: Clean Minimalist Segmented Pill Navigation */}
        <nav className="flex items-center p-1 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md">
          {views.map((v) => {
            const Icon = v.icon;
            const isActive = currentView === v.id;
            return (
              <button
                key={v.id}
                onClick={() => onChangeView(v.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-white/15 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  {lang === 'fa' ? v.labelFa : v.labelEn}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Right Controls: Ambient sound toggle, Theme selector, Upload */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Ambient generator toggle */}
          <button
            onClick={onToggleAmbient}
            className={`p-2 rounded-full border transition-all ${
              isAmbientActive
                ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 shadow-[0_0_12px_rgba(212,175,55,0.3)]'
                : 'text-slate-400 hover:text-white border-transparent hover:bg-white/[0.05]'
            }`}
            title={lang === 'fa' ? 'نغمه امبینت آرامش‌بخش' : 'Ambient sound generator'}
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Theme Quick Color Dots Dropdown */}
          <div className="relative group">
            <button
              className="flex items-center gap-1 p-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
              title={lang === 'fa' ? 'رنگ‌بندی و تم' : 'Theme palette'}
            >
              <Palette className="w-3.5 h-3.5 text-slate-300" />
            </button>

            <div className="absolute right-0 top-full mt-2 w-36 bg-[#0d0f17] border border-white/10 rounded-2xl p-1.5 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onChangeTheme(t.id)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-xl transition-colors ${
                    theme === t.id
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{lang === 'fa' ? t.nameFa : t.nameEn}</span>
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-white/20"
                    style={{ backgroundColor: t.color }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Language Toggle */}
          <button
            onClick={onToggleLang}
            className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-white rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
            title="Language"
          >
            {lang === 'fa' ? 'EN' : 'فا'}
          </button>

          {/* Upload Button */}
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-gradient-to-r from-amber-300 to-amber-400 hover:from-amber-200 hover:to-amber-300 rounded-full shadow-md transition-all"
            title={lang === 'fa' ? 'افزودن آهنگ' : 'Upload track'}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{lang === 'fa' ? 'آپلود' : 'Upload'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
