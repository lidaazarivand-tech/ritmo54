export interface LyricLine {
  time: number; // in seconds
  text: string;
  translation?: string;
}

export interface Track {
  id: string;
  title: string;
  titleEn: string;
  artist: string;
  artistEn: string;
  album: string;
  albumEn: string;
  duration: number; // in seconds
  audioSrc: string;
  coverArt: string;
  genre: string;
  genreEn: string;
  year: number;
  quality: string; // e.g. "FLAC 24-bit / 96kHz"
  lyrics: LyricLine[];
  isFavorite?: boolean;
  isCustom?: boolean;
  nativeUri?: string;
  mediaType?: 'audio' | 'video';
  fileName?: string;
  folder?: string;
  /** Actual local file size when available. */
  sizeBytes?: number;
}

export type ThemeType = 'obsidian' | 'cyber' | 'emerald' | 'velvet' | 'platinum';

export type LarkTab = 'songs' | 'playlists' | 'equalizer' | 'folders';

export type ActiveView = 'player' | 'lyrics' | 'queue' | 'equalizer' | 'upload';

export type VisualizerMode = 'radial' | 'bars' | 'wave';

export type RepeatMode = 'off' | 'all' | 'one';

export interface EqualizerPreset {
  name: string;
  nameEn: string;
  gains: number[];
}

export type Language = 'fa' | 'en';
