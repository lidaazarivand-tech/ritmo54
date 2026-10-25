import React from 'react';
import { Sliders, RotateCcw, Volume2, Waves, Sparkles, X } from 'lucide-react';
import { EQUALIZER_PRESETS, FREQUENCY_BANDS } from '../data/equalizerPresets';
import { ThemeType, Language } from '../types';

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  gains: number[];
  onGainChange: (index: number, val: number) => void;
  activePreset: string;
  onSelectPreset: (presetName: string, gains: number[]) => void;
  bassBoost: boolean;
  onToggleBassBoost: () => void;
  surround3D: boolean;
  onToggleSurround3D: () => void;
  theme: ThemeType;
  lang: Language;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({
  isOpen,
  onClose,
  gains,
  onGainChange,
  activePreset,
  onSelectPreset,
  bassBoost,
  onToggleBassBoost,
  surround3D,
  onToggleSurround3D,
  theme,
  lang,
}) => {
  if (!isOpen) return null;

  const accentColor = {
    obsidian: 'accent-amber-400 text-amber-400 border-amber-500/30',
    cyber: 'accent-cyan-400 text-cyan-400 border-cyan-500/30',
    emerald: 'accent-emerald-400 text-emerald-400 border-emerald-500/30',
    velvet: 'accent-rose-400 text-rose-400 border-rose-500/30',
    platinum: 'accent-slate-200 text-slate-200 border-slate-400/30'
  }[theme];

  const activePresetBg = {
    obsidian: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    cyber: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    velvet: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    platinum: 'bg-slate-200/20 text-slate-100 border-slate-300/40'
  }[theme];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0e1017] border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Glow ambient background spot */}
        <div className="absolute -top-24 -left-24 w-60 h-60 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-white/[0.06] border ${accentColor}`}>
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {lang === 'fa' ? 'اکولایزر حرفه‌ای ۱۰ کاناله' : '10-Band Graphic Equalizer'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'fa' ? 'تنظیم دقیق فرکانس‌های صوتی و تفکیک صدا' : 'Studio audio frequency mastering & acoustic tuning'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Presets Row */}
        <div className="my-5">
          <div className="text-xs text-slate-400 mb-2 font-medium">
            {lang === 'fa' ? 'حالت‌های پیش‌فرض (پریست):' : 'Sound Presets:'}
          </div>
          <div className="flex flex-wrap gap-2">
            {EQUALIZER_PRESETS.map((p) => {
              const isSelected = activePreset === p.name || activePreset === p.nameEn;
              return (
                <button
                  key={p.name}
                  onClick={() => onSelectPreset(lang === 'fa' ? p.name : p.nameEn, p.gains)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-all duration-150 whitespace-nowrap ${
                    isSelected
                      ? activePresetBg
                      : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  {lang === 'fa' ? p.name : p.nameEn}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="p-4 rounded-2xl bg-[#090b10] border border-white/[0.06] my-4">
          <div className="flex justify-between items-center text-[10px] text-slate-500 mb-4 px-1 tabular-nums">
            <span>+12 dB</span>
            <span>0 dB</span>
            <span>-12 dB</span>
          </div>

          <div className="grid grid-cols-10 gap-2 sm:gap-3 items-end h-44 pb-2">
            {FREQUENCY_BANDS.map((band, idx) => {
              const currentVal = gains[idx] ?? 0;
              return (
                <div key={band.freq} className="flex flex-col items-center h-full justify-between">
                  <span className="text-[10px] tabular-nums font-mono text-slate-400 font-medium">
                    {currentVal > 0 ? `+${currentVal}` : currentVal}
                  </span>

                  {/* Vertical Slider */}
                  <div className="relative flex items-center justify-center h-28 w-6">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={currentVal}
                      onChange={(e) => onGainChange(idx, Number(e.target.value))}
                      className="w-28 h-1.5 bg-slate-800 rounded-full appearance-none -rotate-90 origin-center cursor-pointer"
                    />
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono tracking-tight mt-1">
                    {band.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Extra Sound FX: Bass Boost & 3D Spatial Audio */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {/* Bass Boost */}
          <div
            onClick={onToggleBassBoost}
            className={`cursor-pointer flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 ${
              bassBoost
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                : 'bg-white/[0.03] border-white/[0.07] text-slate-300 hover:bg-white/[0.06]'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${bassBoost ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-slate-400'}`}>
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold">
                  {lang === 'fa' ? 'تقویت فوق‌العاده بیس (Bass Boost)' : 'Ultra Bass Boost'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {lang === 'fa' ? 'افزایش کوبش و عمق فرکانس‌های زیرین' : 'Deep sub-frequency enhancement'}
                </div>
              </div>
            </div>
            <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${bassBoost ? 'bg-amber-500' : 'bg-slate-700'}`}>
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${bassBoost ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </div>

          {/* 3D Spatial Audio */}
          <div
            onClick={onToggleSurround3D}
            className={`cursor-pointer flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 ${
              surround3D
                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                : 'bg-white/[0.03] border-white/[0.07] text-slate-300 hover:bg-white/[0.06]'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${surround3D ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-slate-400'}`}>
                <Waves className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold">
                  {lang === 'fa' ? 'صدای سه‌بعدی و استریو فراگیر' : '3D Spatial Surround'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {lang === 'fa' ? 'شبیه‌سازی سالن کنسرت و پرسپکتیو صوتی' : 'Concert hall acoustic widening'}
                </div>
              </div>
            </div>
            <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${surround3D ? 'bg-cyan-500' : 'bg-slate-700'}`}>
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${surround3D ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/[0.08]">
          <button
            onClick={() => onSelectPreset(lang === 'fa' ? 'یکنواخت (Flat)' : 'Flat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'تنظیم مجدد به صفر' : 'Reset to Flat'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 rounded-xl transition-all shadow-sm"
          >
            {lang === 'fa' ? 'تایید و بستن' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
