import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import type { AudioAnalysisFrame } from './audioAnalysis';

export interface NativeItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  fileName: string;
  folder: string;
  uri: string;
  duration: number;
  type: 'audio' | 'video';
  artworkKey?: string;
  /** Read-only MediaStore DATE_ADDED, milliseconds since Unix epoch. */
  addedAt?: number;
  /** Actual MediaStore file size in bytes; absent when unavailable. */
  sizeBytes?: number;
}

interface NativeMediaPlugin {
  lyrics(options: { uri: string }): Promise<{ text: string; syncedText?: string }>;
  setAudioAnalysis(options: { enabled: boolean }): Promise<void>;
  addListener(event: 'audioAnalysis', listener: (data: AudioAnalysisFrame) => void): Promise<PluginListenerHandle>;
  addListener(event: 'playbackState', listener: (data: { id?: string; playing?: boolean; analysisGeneration?: number; analysisDiscontinuity?: boolean }) => void): Promise<PluginListenerHandle>;
  prepareTrash(options: { id: string; uri: string; metadata: { favorite: boolean; playlistIds: string[] } }): Promise<{ token: string }>;
  recentlyDeleted(options?: { cleanup?: boolean }): Promise<{ days: number; items: TrashItem[] }>;
  manageTrash(options: { action: 'restore' | 'finishRestore' | 'permanent' | 'days' | 'cancel'; token?: string; days?: number }): Promise<{ id?: string; uri?: string }>;
  detachLibrarySong(options: { id: string }): Promise<void>;
  checkLibrarySong(options: { uri: string }): Promise<void>;
  sendFeedback(): Promise<void>;
  deleteSong(options: { id: string; uri: string; backupToken: string }): Promise<{ deleted: boolean; warning?: string; state?: { id: string; playing: boolean; position: number; duration: number; queue: string[] } }>;
  artwork(options: { uri: string; key: string; type: 'audio' | 'video' }): Promise<{ uri: string }>;
  notificationStatus(): Promise<{ permission: string; enabled: boolean; channelsEnabled: boolean; version: string }>;
  requestNotifications(): Promise<{ permission: string; enabled: boolean; channelsEnabled: boolean; version: string }>;
  openNotificationSettings(): Promise<void>;
  scan(options?: { includeVideo?: boolean; requestVideoPermission?: boolean }): Promise<{ items: NativeItem[] }>;
  consumeIncomingAudio(): Promise<{ item: NativeItem | null }>;
  consumeIncomingMedia(): Promise<{ item: NativeItem | null }>;
  openVideo(options: {
    id?: string;
    uri?: string;
    title?: string;
    items?: { id: string; uri: string }[];
    index?: number;
  }): Promise<void>;
  analyze(options: { uri: string }): Promise<{ loudness: number; suggestedPreset: string }>;
  saveBookmark(options: { id: string; position: number }): Promise<void>;
  setPlaybackMode(options: { mode: 'focus' | 'sleep' | 'workout' }): Promise<void>;
  /** position and control.seek value are safe integer milliseconds, not seconds. */
  play(options: { items: { id: string; uri: string; title: string; artist: string }[]; index: number; position: number }): Promise<void>;
  setEqualizer(options: { gains: number[] }): Promise<void>;
  control(options: { action: 'play' | 'pause' | 'stop' | 'next' | 'previous' | 'seek' | 'shuffle' | 'repeat' | 'mode' | 'volume' | 'mute' | 'speed'; value?: number }): Promise<void>;
  modifyQueue(options: { action: 'add' | 'addMany' | 'next' | 'remove' | 'clear' | 'move' | 'select' | 'reorder'; order?: string[]; expected?: string[]; id?: string; uri?: string; title?: string; artist?: string; from?: number; to?: number; index?: number; items?: { id: string; uri: string; title: string; artist: string }[] }): Promise<void>;
  state(): Promise<{ id: string; playing: boolean; analysisGeneration?: number; position: number; duration: number; volume: number; speed: number; shuffle: boolean; repeat: number; queue: string[]; queueIndex: number; error?: string }>;
}

export interface TrashItem {
  token: string; id: string; uri: string; title: string; artist: string; album: string;
  fileName: string; folder: string; duration: number; date: number; expiresAt: number;
  status: 'copying' | 'prepared' | 'deleted' | 'restoring' | 'restored' | 'purging' | 'finalizing' | 'cancelling';
  recoverable: boolean; favorite: boolean; playlistIds: string[];
  coverUri?: string;
}

export const NativeMedia = registerPlugin<NativeMediaPlugin>('NativeMedia');
