import React, { useState } from 'react';
import { Wand2, ShieldCheck, Scissors, AudioLines, Bookmark, Gauge } from 'lucide-react';
import { NativeMedia } from '../utils/nativeMedia';
import { Track, Language } from '../types';

interface Props {
  track?: Track;
  lang: Language;
  onMessage: (message: string) => void;
}

export const OfflineToolsPanel: React.FC<Props> = ({ track, lang, onMessage }) => {
  const [busy, setBusy] = useState(false);
  const fa = lang === 'fa';
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (!track?.nativeUri || busy) return;
    setBusy(true);
    try { await action(); onMessage(success); }
    catch { onMessage(fa ? 'این ابزار روی این فایل در دسترس نیست' : 'This tool is unavailable for this file'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-white">
        <ShieldCheck className="w-4 h-4 text-amber-400" />
        {fa ? 'ابزارهای آفلاین' : 'Offline tools'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={!track || busy} onClick={() => run(
          () => NativeMedia.analyze({ uri: track!.nativeUri! }),
          fa ? 'تحلیل محلی انجام شد' : 'Local analysis complete'
        )} className="flex items-center gap-2 rounded-xl bg-white/[0.05] p-3 text-start text-xs text-slate-200 disabled:opacity-40">
          <Wand2 className="h-4 w-4 text-amber-400" />{fa ? 'AI EQ آفلاین' : 'Offline AI EQ'}
        </button>
        <button disabled={!track || busy} onClick={() => run(
          () => NativeMedia.analyze({ uri: track!.nativeUri! }),
          fa ? 'پاک‌سازی آفلاین آماده شد' : 'Offline clean-up ready'
        )} className="flex items-center gap-2 rounded-xl bg-white/[0.05] p-3 text-start text-xs text-slate-200 disabled:opacity-40">
          <AudioLines className="h-4 w-4 text-amber-400" />{fa ? 'پاک‌سازی صدا' : 'Clean audio'}
        </button>
        <button disabled={!track || busy} onClick={() => run(
          () => NativeMedia.saveBookmark({ id: track!.id, position: 0 }),
          fa ? 'نشانک ذخیره شد' : 'Bookmark saved'
        )} className="flex items-center gap-2 rounded-xl bg-white/[0.05] p-3 text-start text-xs text-slate-200 disabled:opacity-40">
          <Bookmark className="h-4 w-4 text-amber-400" />{fa ? 'نشانک' : 'Bookmark'}
        </button>
        <button disabled={!track || busy} onClick={() => run(
          () => NativeMedia.setPlaybackMode({ mode: 'focus' }),
          fa ? 'حالت تمرکز فعال شد' : 'Focus mode enabled'
        )} className="flex items-center gap-2 rounded-xl bg-white/[0.05] p-3 text-start text-xs text-slate-200 disabled:opacity-40">
          <Gauge className="h-4 w-4 text-amber-400" />{fa ? 'حالت تمرکز' : 'Focus mode'}
        </button>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Scissors className="h-3.5 w-3.5" />
        {fa ? 'پردازش فایل‌ها فقط روی دستگاه انجام می‌شود' : 'File processing stays on this device'}
      </div>
    </div>
  );
};
