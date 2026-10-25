import React, { useState, useRef } from 'react';
import { UploadCloud, Music, FileAudio, Check, X, Disc } from 'lucide-react';
import { Track, ThemeType, Language } from '../types';
const defaultCoverArt = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#1e293b"/><circle cx="64" cy="64" r="34" fill="#d4af37"/><circle cx="64" cy="64" r="8" fill="#1e293b"/></svg>');

interface TrackUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTrack: (track: Track) => void;
  theme: ThemeType;
  lang: Language;
}

export const TrackUploader: React.FC<TrackUploaderProps> = ({
  isOpen,
  onClose,
  onAddTrack,
  theme,
  lang,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [duration, setDuration] = useState(180);
  const [coverArtUrl, setCoverArtUrl] = useState(defaultCoverArt);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i)) {
      alert(lang === 'fa' ? 'لطفاً یک فایل صوتی معتبر انتخاب کنید' : 'Please select a valid audio file');
      return;
    }

    setSelectedFile(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    setTitle(cleanName);
    setArtist(lang === 'fa' ? 'آهنگ شخصی' : 'Custom Audio');

    // Create temporary audio element to detect duration
    const tempAudio = new Audio(URL.createObjectURL(file));
    tempAudio.onloadedmetadata = () => {
      if (tempAudio.duration && !isNaN(tempAudio.duration)) {
        setDuration(Math.round(tempAudio.duration));
      }
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    const audioUrl = URL.createObjectURL(selectedFile);

    const newTrack: Track = {
      id: `custom-${Date.now()}`,
      title: title || selectedFile.name,
      titleEn: title || selectedFile.name,
      artist: artist || (lang === 'fa' ? 'نامشخص' : 'Unknown Artist'),
      artistEn: artist || 'Unknown Artist',
      album: lang === 'fa' ? 'مجموعه من' : 'My Collection',
      albumEn: 'My Collection',
      duration: duration || 210,
      audioSrc: audioUrl,
      coverArt: coverArtUrl,
      genre: lang === 'fa' ? 'فایل کاربر' : 'User Audio',
      genreEn: 'User Audio',
      year: 2026,
      quality: 'Local Master Hi-Res',
      lyrics: [],
      isFavorite: true,
      isCustom: true,
      sizeBytes: selectedFile.size,
    };

    onAddTrack(newTrack);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0e1017] border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/[0.06] border border-amber-500/30 text-amber-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {lang === 'fa' ? 'افزودن و پخش آهنگ دلخواه' : 'Add & Play Local Track'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'fa' ? 'فایل صوتی خود را از کامپیوتر یا موبایل بارگذاری کنید' : 'Upload your own MP3, WAV, FLAC, or OGG file'}
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Drag & Drop Area */}
          <div
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-amber-400 bg-amber-500/10'
                : selectedFile
                ? 'border-emerald-500/50 bg-emerald-500/10'
                : 'border-white/15 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />

            {selectedFile ? (
              <div className="flex flex-col items-center space-y-2 text-emerald-300">
                <FileAudio className="w-10 h-10" />
                <span className="text-xs font-semibold">{selectedFile.name}</span>
                <span className="text-[11px] text-slate-400">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · {lang === 'fa' ? 'فایل آماده بارگذاری است' : 'Ready to load'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2 text-slate-400">
                <UploadCloud className="w-10 h-10 text-amber-400/80 mb-1" />
                <p className="text-xs font-medium text-slate-200">
                  {lang === 'fa' ? 'فایل صوتی را به اینجا بکشید یا برای انتخاب کلیک کنید' : 'Drag & drop audio here or click to browse'}
                </p>
                <p className="text-[11px] text-slate-500">
                  MP3, WAV, FLAC, OGG, AAC, M4A
                </p>
              </div>
            )}
          </div>

          {/* Form fields */}
          {selectedFile && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {lang === 'fa' ? 'عنوان آهنگ' : 'Track Title'}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/10 text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {lang === 'fa' ? 'نام خواننده یا نوازنده' : 'Artist Name'}
                </label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/10 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-xl transition-colors"
            >
              {lang === 'fa' ? 'انصراف' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={!selectedFile}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-md"
            >
              <Check className="w-4 h-4" />
              <span>{lang === 'fa' ? 'افزودن و پخش فوری' : 'Add & Play'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
