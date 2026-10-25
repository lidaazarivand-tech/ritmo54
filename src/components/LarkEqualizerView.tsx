import React from 'react';
import { Sliders, RotateCcw, Volume2, Waves } from 'lucide-react';
import { EQUALIZER_PRESETS, FREQUENCY_BANDS } from '../data/equalizerPresets';
import { ThemeType, Language } from '../types';

interface LarkEqualizerViewProps {
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

export const LarkEqualizerView: React.FC<LarkEqualizerViewProps> = ({
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
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">
              {lang === 'fa' ? 'اکولایزر ۱۰ بانده ریتمو' : 'Ritmo 10-Band Graphic Equalizer'}
            </h2>
            <p className="text-[11px] text-slate-400">
              {lang === 'fa' ? 'تفکیک دقیق فرکانس‌های زیر، میانی و بم' : 'Studio audio frequency shaping'}
            </p>
          </div>
        </div>

        <button
          onClick={() => onSelectPreset(lang === 'fa' ? 'یکنواخت (Flat)' : 'Flat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{lang === 'fa' ? 'ریست' : 'Reset'}</span>
        </button>
      </div>

      {/* Preset Pills */}
      <div>
        <div className="text-xs text-slate-400 font-medium mb-2">
          {lang === 'fa' ? 'حالت‌های آماده (Presets):' : 'Sound Presets:'}
        </div>
        <div className="flex flex-wrap gap-2">
          {EQUALIZER_PRESETS.map((p) => {
            const isSelected = activePreset === p.name || activePreset === p.nameEn;
            return (
              <button
                key={p.name}
                onClick={() => onSelectPreset(lang === 'fa' ? p.name : p.nameEn, p.gains)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                {lang === 'fa' ? p.name : p.nameEn}
              </button>
            );
          })}
        </div>
      </div>

      {/* 10-Band Slider Grid */}
      <div className="p-4 rounded-3xl bg-[#090b10] border border-white/[0.06] shadow-inner">
        <div className="flex justify-between items-center text-[10px] text-slate-500 mb-3 px-1 font-mono">
          <span>+12 dB</span>
          <span>0 dB</span>
          <span>-12 dB</span>
        </div>

        <div className="grid grid-cols-10 gap-2 items-end h-44 pb-2">
          {FREQUENCY_BANDS.map((band, idx) => {
            const currentVal = gains[idx] ?? 0;
            return (
              <div key={band.freq} className="flex flex-col items-center h-full justify-between">
                <span className="text-[10px] tabular-nums font-mono text-slate-400 font-medium">
                  {currentVal > 0 ? `+${currentVal}` : currentVal}
                </span>

                <div className="relative flex items-center justify-center h-28 w-6">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={currentVal}
                    onChange={(e) => onGainChange(idx, Number(e.target.value))}
                    className="w-28 h-1.5 bg-slate-800 rounded-full appearance-none -rotate-90 origin-center cursor-pointer accent-amber-400"
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

      {/* Bass Boost & 3D Virtualizer Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Bass Boost */}
        <div
          onClick={onToggleBassBoost}
          className={`cursor-pointer flex items-center justify-between p-4 rounded-2xl border transition-all ${
            bassBoost
              ? 'bg-amber-400/10 border-amber-400/40 text-amber-300'
              : 'bg-white/[0.03] border-white/[0.06] text-slate-300 hover:bg-white/[0.06]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${bassBoost ? 'bg-amber-400/20 text-amber-400' : 'bg-white/5 text-slate-400'}`}>
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-semibold">
                {lang === 'fa' ? 'تقویت کوبش بیس (Bass Boost)' : 'Bass Boost'}
              </div>
              <div className="text-[11px] text-slate-400">
                {lang === 'fa' ? 'تقویت فرکانس‌های بم و ساب‌ووفر' : 'Deep sub-bass amplification'}
              </div>
            </div>
          </div>
          <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${bassBoost ? 'bg-amber-400' : 'bg-slate-700'}`}>
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${bassBoost ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* 3D Virtualizer */}
        <div
          onClick={onToggleSurround3D}
          className={`cursor-pointer flex items-center justify-between p-4 rounded-2xl border transition-all ${
            surround3D
              ? 'bg-cyan-400/10 border-cyan-400/40 text-cyan-300'
              : 'bg-white/[0.03] border-white/[0.06] text-slate-300 hover:bg-white/[0.06]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${surround3D ? 'bg-cyan-400/20 text-cyan-400' : 'bg-white/5 text-slate-400'}`}>
              <Waves className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-semibold">
                {lang === 'fa' ? 'صدای ۳D فراگیر (Virtualizer)' : '3D Spatial Audio'}
              </div>
              <div className="text-[11px] text-slate-400">
                {lang === 'fa' ? 'شبیه‌سازی سالن استریو و پرسپکتیو صوتی' : 'Stereo widening acoustic simulation'}
              </div>
            </div>
          </div>
          <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${surround3D ? 'bg-cyan-400' : 'bg-slate-700'}`}>
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${surround3D ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
        </div>
      </div>
    </div>
  );
};
