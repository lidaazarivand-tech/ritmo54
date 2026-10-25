import React, { useState } from 'react';
import { Search, Palette, Globe, Plus, X } from 'lucide-react';
import { ThemeType, Language } from '../types';

interface LarkHeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  theme: ThemeType;
  onChangeTheme: (theme: ThemeType) => void;
  lang: Language;
  onToggleLang: () => void;
  onOpenUpload: () => void;
}

export const LarkHeader: React.FC<LarkHeaderProps> = ({
  searchQuery,
  onSearchChange,
  theme,
  onChangeTheme,
  lang,
  onToggleLang,
  onOpenUpload,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const themes: { id: ThemeType; nameFa: string; nameEn: string; color: string }[] = [
    { id: 'obsidian', nameFa: 'طلایی ابسیدین', nameEn: 'Obsidian Gold', color: '#d4af37' },
    { id: 'cyber', nameFa: 'سایبر نئون', nameEn: 'Cyber Neon', color: '#00f0ff' },
    { id: 'emerald', nameFa: 'زمرد شبانه', nameEn: 'Emerald Noir', color: '#10b981' },
    { id: 'velvet', nameFa: 'مخملی غروب', nameEn: 'Velvet Sunset', color: '#f43f5e' },
    { id: 'platinum', nameFa: 'پلاتینیوم لوکس', nameEn: 'Platinum Lux', color: '#e2e8f0' },
  ];

  return (
    <header className="sticky top-0 z-30 w-full bg-[#0a0c13]/90 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {/* Lark Logo & Title */}
        {!isSearchOpen ? (
          <div className="flex items-center gap-2.5">
            <img src="/branding/ritmo-icon.png" alt="Ritmo" className="w-8 h-8 rounded-xl object-cover" />
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>{lang === 'fa' ? 'ریتمو' : 'Ritmo'}</span>
              </h1>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2 bg-white/[0.06] rounded-xl px-3 py-1.5 border border-white/10">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={lang === 'fa' ? 'جستجوی آهنگ، خواننده یا سبک...' : 'Search songs, artists, genres...'}
              className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
            />
            <button
              onClick={() => {
                onSearchChange('');
                setIsSearchOpen(false);
              }}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Right Tools */}
        <div className="flex items-center gap-1.5">
          {!isSearchOpen && (
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-2 text-slate-300 hover:text-white rounded-full hover:bg-white/[0.06] transition-colors"
              title={lang === 'fa' ? 'جستجو' : 'Search'}
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Theme Palette */}
          <div className="relative group">
            <button
              className="p-2 text-slate-300 hover:text-white rounded-full hover:bg-white/[0.06] transition-colors"
              title={lang === 'fa' ? 'تغییر تم' : 'Themes'}
            >
              <Palette className="w-4 h-4 text-amber-400" />
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-36 bg-[#11131c] border border-white/10 rounded-2xl p-1.5 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onChangeTheme(t.id)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-xl transition-colors ${
                    theme === t.id ? 'bg-white/15 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{lang === 'fa' ? t.nameFa : t.nameEn}</span>
                  <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: t.color }} />
                </button>
              ))}
            </div>
          </div>

          {/* Lang toggle */}
          <button
            onClick={onToggleLang}
            className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-white rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
          >
            {lang === 'fa' ? 'EN' : 'فا'}
          </button>

          {/* Upload / Add Music button */}
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-full shadow-sm transition-all"
            title={lang === 'fa' ? 'افزودن آهنگ' : 'Add Track'}
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{lang === 'fa' ? 'آهنگ جدید' : 'Add'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
