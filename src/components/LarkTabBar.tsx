import React from 'react';
import { Music, Heart, Sliders, Folder } from 'lucide-react';
import { LarkTab, ThemeType, Language } from '../types';

interface LarkTabBarProps {
  activeTab: LarkTab;
  onTabChange: (tab: LarkTab) => void;
  favoritesCount: number;
  theme: ThemeType;
  lang: Language;
}

export const LarkTabBar: React.FC<LarkTabBarProps> = ({
  activeTab,
  onTabChange,
  favoritesCount,
  theme,
  lang,
}) => {
  const tabs = [
    {
      id: 'songs' as LarkTab,
      labelFa: 'آهنگ‌ها',
      labelEn: 'Songs',
      icon: Music,
    },
    {
      id: 'playlists' as LarkTab,
      labelFa: 'علاقه‌مندی‌ها',
      labelEn: 'Favorites',
      icon: Heart,
      badge: favoritesCount > 0 ? favoritesCount : null,
    },
    {
      id: 'equalizer' as LarkTab,
      labelFa: 'اکولایزر',
      labelEn: 'Equalizer',
      icon: Sliders,
    },
    {
      id: 'folders' as LarkTab,
      labelFa: 'فایل‌های من',
      labelEn: 'Files',
      icon: Folder,
    },
  ];

  return (
    <div className="w-full bg-[#0a0c13]/70 border-b border-white/[0.06] backdrop-blur-md px-4">
      <div className="max-w-4xl mx-auto flex items-center justify-start gap-1 overflow-x-auto no-scrollbar py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{lang === 'fa' ? tab.labelFa : tab.labelEn}</span>
              {tab.badge !== null && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive ? 'bg-slate-950 text-amber-300' : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
