/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Track, ThemeType, LarkTab, RepeatMode, Language } from './types';
import { NativeMedia } from './utils/nativeMedia';
import { audioEngine } from './utils/audioEngine';
import { LarkHeader } from './components/LarkHeader';
import { LarkTabBar } from './components/LarkTabBar';
import { LarkSongList } from './components/LarkSongList';
import { LarkMiniPlayer } from './components/LarkMiniPlayer';
import { LarkFullScreenPlayer } from './components/LarkFullScreenPlayer';
import { LarkEqualizerView } from './components/LarkEqualizerView';
import { LarkFoldersView } from './components/LarkFoldersView';
import { TrackUploader } from './components/TrackUploader';

const EMPTY_COVER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#1e293b"/><circle cx="64" cy="64" r="34" fill="#d4af37"/><circle cx="64" cy="64" r="8" fill="#1e293b"/></svg>');
const native = Capacitor.isNativePlatform();

export default function App() {
  const [tracks, setTracks] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem('lark_player_tracks');
      if (saved) return (JSON.parse(saved) as Track[]).filter(t =>
        !/^track-[1-4]$/.test(t.id) && !t.audioSrc.startsWith('blob:') && !t.nativeUri);
    } catch {}
    return [];
  });
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    try {
      const v = localStorage.getItem('lark_player_volume');
      return v !== null ? Number(v) : 0.85;
    } catch { return 0.85; }
  });
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [isShuffled, setIsShuffled] = useState(false);

  // Tabs & Navigation
  const [activeTab, setActiveTab] = useState<LarkTab>('songs');
  const [isFullScreenPlayerOpen, setIsFullScreenPlayerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ritmo_favorites') || '[]'); } catch { return []; }
  });
  const [scanError, setScanError] = useState('');
  const [toolMessage, setToolMessage] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ritmo_recent') || '[]'); } catch { return []; }
  });
  const [videoOpen, setVideoOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueIds, setQueueIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ritmo_queue') || '[]'); } catch { return []; }
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Themes & Lang
  const [theme, setTheme] = useState<ThemeType>(() => {
    try {
      return (localStorage.getItem('lark_player_theme') as ThemeType) || 'obsidian';
    } catch { return 'obsidian'; }
  });
  const [lang, setLang] = useState<Language>(() => {
    try {
      return (localStorage.getItem('lark_player_lang') as Language) || 'fa';
    } catch { return 'fa'; }
  });

  // Equalizer & FX
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [activeEqPreset, setActiveEqPreset] = useState('یک‌نواخت (Flat)');
  const [bassBoost, setBassBoost] = useState(false);
  const [surround3D, setSurround3D] = useState(false);

  // Sleep Timer
  const [sleepTimerSecondsLeft, setSleepTimerSecondsLeft] = useState<number | null>(null);

  // Upload modal
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nativeLoadedId = useRef('');
  const currentTrack = tracks[currentTrackIndex] || tracks[0];
  const isNativeAudio = !!(native && currentTrack?.nativeUri && currentTrack.mediaType !== 'video');
  const rememberPlay = (id: string) =>
    setRecentIds(old => old[0] === id ? old : [id, ...old.filter(value => value !== id)].slice(0, 20));

  const scanMedia = async (includeVideo = false) => {
    if (!native) return;
    try {
      const { items } = await NativeMedia.scan({ includeVideo });
      setTracks(prev => {
        const favorites = new Set<string>(favoriteIds);
        const scanned: Track[] = items.map(item => ({
          id: item.id, title: item.title, titleEn: item.title,
          artist: item.artist || (lang === 'fa' ? 'نامشخص' : 'Unknown'),
          artistEn: item.artist || 'Unknown', album: item.album || '',
          albumEn: item.album || '', duration: item.duration, audioSrc: '',
          coverArt: EMPTY_COVER, genre: '', genreEn: '', year: 0,
          quality: item.type === 'video' ? 'Video' : 'Audio',
          lyrics: [], nativeUri: item.uri, mediaType: item.type,
          fileName: item.fileName, folder: item.folder, isFavorite: favorites.has(item.id)
        }));
        return [...scanned, ...prev.filter(t => !t.nativeUri)];
      });
      setScanError('');
    } catch (error) { setScanError(String(error)); }
  };

  useEffect(() => { void scanMedia(); }, []);
  useEffect(() => {
    if (!native) return;
    const timer = window.setInterval(() => {
      NativeMedia.state().then(state => {
        if (!state.id || videoOpen || currentTrack?.mediaType === 'video') return;
        nativeLoadedId.current = state.id;
        const idx = tracks.findIndex(t => t.id === state.id);
        if (idx >= 0) setCurrentTrackIndex(idx);
        if (state.playing) rememberPlay(state.id);
        setIsPlaying(state.playing);
        setCurrentTime(state.position);
        if (state.duration > 0) setDuration(state.duration);
        setQueueIds(state.queue || []);
        if (state.error) setScanError(state.error);
        if (state.position > 0 && Math.floor(state.position) % 5 === 0)
          localStorage.setItem('ritmo_position_' + state.id, String(state.position));
      }).catch(error => setScanError(String(error)));
    }, 1000);
    return () => clearInterval(timer);
  }, [tracks, videoOpen, currentTrack?.mediaType]);

  // Persist tracks
  useEffect(() => {
    try {
      localStorage.setItem('lark_player_tracks', JSON.stringify(tracks.filter(t => !t.nativeUri && !t.audioSrc.startsWith('blob:'))));
    } catch {}
  }, [tracks]);
  useEffect(() => { localStorage.setItem('ritmo_favorites', JSON.stringify(favoriteIds)); }, [favoriteIds]);

  useEffect(() => { localStorage.setItem('ritmo_recent', JSON.stringify(recentIds)); }, [recentIds]);
  useEffect(() => { localStorage.setItem('ritmo_queue', JSON.stringify(queueIds)); }, [queueIds]);

  // Persist volume
  useEffect(() => {
    try {
      localStorage.setItem('lark_player_volume', String(volume));
    } catch {}
  }, [volume]);

  // Persist theme
  useEffect(() => {
    try {
      localStorage.setItem('lark_player_theme', theme);
    } catch {}
  }, [theme]);

  // Persist lang
  useEffect(() => {
    try {
      localStorage.setItem('lark_player_lang', lang);
    } catch {}
  }, [lang]);

  // Android Back Button and Status Bar handling via Capacitor
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#0a0c13' }).catch(() => {});

      CapApp.addListener('backButton', () => {
        if (isFullScreenPlayerOpen) {
          setIsFullScreenPlayerOpen(false);
        } else if (isUploadOpen) {
          setIsUploadOpen(false);
        } else if (activeTab !== 'songs') {
          setActiveTab('songs');
        } else {
          CapApp.exitApp();
        }
      }).then((handle) => {
        removeListener = () => handle.remove();
      });
    }

    return () => {
      if (removeListener) removeListener();
    };
  }, [isFullScreenPlayerOpen, isUploadOpen, activeTab]);

  // Set HTML dir and lang
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, [lang]);

  // Init Audio Engine
  useEffect(() => {
    if (!native && audioRef.current) {
      audioEngine.init(audioRef.current);
    }
  }, []);

  // Sync Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      if (!native) audioEngine.setMasterVolume(isMuted ? 0 : volume);
      if (native && isNativeAudio) {
        NativeMedia.control({ action: isMuted ? 'mute' : 'volume', value: Math.round(volume * 1000) })
          .catch(error => setScanError(String(error)));
      }
    }
  }, [volume, isMuted]);

  // Sync Playback Rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
    if (native && isNativeAudio) {
      NativeMedia.control({ action: 'speed', value: Math.round(playbackRate * 100) })
        .catch(error => setScanError(String(error)));
    }
  }, [playbackRate]);

  useEffect(() => {
    if (isNativeAudio) {
      NativeMedia.control({ action: 'shuffle', value: isShuffled ? 1 : 0 })
        .catch(error => setScanError(String(error)));
      NativeMedia.control({ action: 'repeat', value: repeatMode === 'one' ? 1 : repeatMode === 'all' ? 2 : 0 })
        .catch(error => setScanError(String(error)));
    }
  }, [isNativeAudio, isShuffled, repeatMode]);

  // MediaSession API for Android Notification & Lock Screen Controls
  useEffect(() => {
    if (!native && 'mediaSession' in navigator && currentTrack) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album,
          artwork: [
            { src: currentTrack.coverArt, sizes: '512x512', type: 'image/jpeg' }
          ]
        });

        navigator.mediaSession.setActionHandler('play', () => togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => handlePrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => handleNext());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) handleSeek(details.seekTime);
        });
      } catch {}
    }
  }, [currentTrack, isPlaying]);

  // Sleep Timer Loop
  useEffect(() => {
    if (sleepTimerSecondsLeft === null) return;
    if (sleepTimerSecondsLeft <= 0) {
      if (audioRef.current) audioRef.current.pause();
      if (isNativeAudio) NativeMedia.control({ action: 'pause' })
        .catch(error => setScanError(String(error)));
      setIsPlaying(false);
      setSleepTimerSecondsLeft(null);
      return;
    }

    const timer = setInterval(() => {
      setSleepTimerSecondsLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [sleepTimerSecondsLeft, isNativeAudio]);

  // Play / Pause Toggle
  const togglePlay = () => {
    if (!currentTrack) return;
    if (!isPlaying) rememberPlay(currentTrack.id);
    if (isNativeAudio) {
      if (!nativeLoadedId.current) { handleSelectTrack(currentTrack); return; }
      NativeMedia.control({ action: isPlaying ? 'pause' : 'play' }).then(() => NativeMedia.state()).then(state => {
        setIsPlaying(state.playing);
        setCurrentTime(state.position);
        if (state.duration > 0) setDuration(state.duration);
        if (state.error) setScanError(state.error);
      }).catch(error => setScanError(String(error)));
      return;
    }
    if (currentTrack.mediaType === 'video' && videoRef.current) {
      if (videoRef.current.paused) videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      else { videoRef.current.pause(); setIsPlaying(false); }
      return;
    }
    audioEngine.resumeContext();
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        audioEngine.resumeContext();
        audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
      });
    }
  };

  const handleSelectTrack = (track: Track) => {
    const idx = tracks.findIndex((t) => t.id === track.id);
    if (idx !== -1) {
      rememberPlay(track.id);
      audioRef.current?.pause();
      if (isNativeAudio) NativeMedia.control({ action: 'pause' }).catch(() => {});
      setCurrentTrackIndex(idx);
      localStorage.setItem('ritmo_last_track', track.id);
      setDuration(track.duration);
      setCurrentTime(0);
      if (native && track.nativeUri && track.mediaType === 'audio') {
        const queue = tracks.filter(t => t.nativeUri && t.mediaType === 'audio');
        NativeMedia.play({
          items: queue.map(t => ({ id: t.id, uri: t.nativeUri!, title: t.title, artist: t.artist })),
          index: queue.findIndex(t => t.id === track.id),
          position: Math.floor(Number(localStorage.getItem('ritmo_position_' + track.id) || 0) * 1000)
        }).then(() => NativeMedia.state()).then(state => {
          nativeLoadedId.current = state.id;
          setIsPlaying(state.playing);
          setCurrentTime(state.position);
          if (state.duration > 0) setDuration(state.duration);
          setQueueIds(state.queue || []);
          if (state.error) setScanError(state.error);
        }).catch(error => {
          nativeLoadedId.current = '';
          setIsPlaying(false);
          setScanError(String(error));
        });
        setVideoOpen(false);
        return;
      }
      if (track.mediaType === 'video') {
        if (native && track.nativeUri) {
          const videos = tracks.filter(t => t.mediaType === 'video' && t.nativeUri);
          NativeMedia.openVideo({
            items: videos.map(t => ({ id: t.id, uri: t.nativeUri! })),
            index: videos.findIndex(t => t.id === track.id)
          }).catch(error => setScanError(String(error)));
          setVideoOpen(false);
          return;
        }
        setVideoOpen(true);
        setIsPlaying(false);
        return;
      }
      setVideoOpen(false);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }, 50);
    }
  };

  const handleNext = () => {
    if (!tracks.length) return;
    if (isNativeAudio) {
      NativeMedia.control({ action: 'next' }).catch(error => setScanError(String(error)));
      return;
    }
    if (currentTrack?.mediaType === 'video') {
      const videos = tracks.filter(t => t.mediaType === 'video');
      const idx = videos.findIndex(t => t.id === currentTrack.id);
      if (videos.length) handleSelectTrack(videos[(idx + 1) % videos.length]);
      return;
    }
    if (queueIds.length > 0) {
      const nextId = queueIds[(queueIds.indexOf(currentTrack.id) + 1) % queueIds.length];
      const nextTrack = tracks.find(t => t.id === nextId);
      if (nextTrack) { handleSelectTrack(nextTrack); return; }
    }
    if (isShuffled) {
      const nextIdx = Math.floor(Math.random() * tracks.length);
      setCurrentTrackIndex(nextIdx);
    } else {
      setCurrentTrackIndex((prev) => (prev + 1) % tracks.length);
    }
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 50);
  };

  const handlePrev = () => {
    if (!tracks.length) return;
    if (isNativeAudio) {
      NativeMedia.control({ action: 'previous' }).catch(error => setScanError(String(error)));
      return;
    }
    if (currentTrack?.mediaType === 'video') {
      const videos = tracks.filter(t => t.mediaType === 'video');
      const idx = videos.findIndex(t => t.id === currentTrack.id);
      if (videos.length) handleSelectTrack(videos[(idx - 1 + videos.length) % videos.length]);
      return;
    }
    if (queueIds.length > 0 && currentTime <= 3) {
      const prevId = queueIds[(queueIds.indexOf(currentTrack.id) - 1 + queueIds.length) % queueIds.length];
      const prevTrack = tracks.find(t => t.id === prevId);
      if (prevTrack) { handleSelectTrack(prevTrack); return; }
    }
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    if (isShuffled) {
      const nextIdx = Math.floor(Math.random() * tracks.length);
      setCurrentTrackIndex(nextIdx);
    } else {
      setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    }
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 50);
  };

  const handleSeek = (newTime: number) => {
    if (isNativeAudio) {
      NativeMedia.control({ action: 'seek', value: Math.floor(newTime * 1000) })
        .catch(error => setScanError(String(error)));
      setCurrentTime(newTime);
      return;
    }
    if (currentTrack?.mediaType === 'video' && videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      return;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleTrackEnded = () => {
    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => setIsPlaying(true));
      }
    } else if (repeatMode === 'all') {
      handleNext();
    } else {
      if (currentTrackIndex < tracks.length - 1) {
        handleNext();
      } else {
        setIsPlaying(false);
      }
    }
  };

  const cycleRepeat = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  const handlePlayAll = () => {
    if (!tracks.length) return;
    setQueueIds(tracks.filter(t => t.mediaType !== 'video').map(t => t.id));
    if (native && tracks[0].nativeUri) { handleSelectTrack(tracks[0]); return; }
    setCurrentTrackIndex(0);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 50);
  };

  const handleShuffleAll = () => {
    if (!tracks.length) return;
    setIsShuffled(true);
    setQueueIds(tracks.filter(t => t.mediaType !== 'video').map(t => t.id));
    const randIdx = Math.floor(Math.random() * tracks.length);
    if (native && tracks[randIdx].nativeUri) { handleSelectTrack(tracks[randIdx]); return; }
    setCurrentTrackIndex(randIdx);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 50);
  };

  const toggleFavorite = (trackId: string) => {
    setFavoriteIds(prev => prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]);
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t))
    );
  };

  const handleAddTrack = (newTrack: Track) => {
    setTracks((prev) => [newTrack, ...prev]);
    setCurrentTrackIndex(0);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 100);
  };

  const handleDeleteTrack = (trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    if (currentTrack?.id === trackId) {
      setCurrentTrackIndex(0);
    }
  };

  const modifyQueue = (track: Track, action: 'add' | 'next' | 'remove') => {
    if (native && track.nativeUri && track.mediaType === 'audio') {
      NativeMedia.modifyQueue({ action, id: track.id, uri: track.nativeUri, title: track.title, artist: track.artist })
        .then(() => NativeMedia.state().then(state => setQueueIds(state.queue || [])))
        .catch(error => setScanError(String(error)));
    } else {
      setQueueIds(old => action === 'remove'
        ? old.filter(id => id !== track.id)
        : action === 'next'
        ? [...old.slice(0, Math.max(0, old.indexOf(currentTrack?.id || '') + 1)), track.id, ...old.slice(Math.max(0, old.indexOf(currentTrack?.id || '') + 1))]
        : [...old, track.id]);
    }
  };

  // Equalizer
  const handleEqGainChange = (index: number, val: number) => {
    const newGains = [...eqGains];
    newGains[index] = val;
    setEqGains(newGains);
    audioEngine.setEqGain(index, val);
    setActiveEqPreset('سفارشی');
  };

  const handleSelectPreset = (name: string, gains: number[]) => {
    setEqGains(gains);
    setActiveEqPreset(name);
    audioEngine.setAllEqGains(gains);
  };

  const toggleBassBoost = () => {
    const next = !bassBoost;
    setBassBoost(next);
    audioEngine.setBassBoost(next);
  };

  const toggleSurround3D = () => {
    const next = !surround3D;
    setSurround3D(next);
    audioEngine.setSpatial3D(next);
  };

  // Filtered tracks by search
  const filteredTracks = tracks.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.titleEn.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.artistEn.toLowerCase().includes(q) ||
      (t.album || '').toLowerCase().includes(q) ||
      (t.fileName || '').toLowerCase().includes(q)
    );
  });

  const favoritesTracks = tracks.filter((t) => t.isFavorite);

  // Theme background gradient
  const themeBackdrop = {
    obsidian: 'from-[#08090d] via-[#0d0f17] to-[#14120a]',
    cyber: 'from-[#040612] via-[#070918] to-[#120722]',
    emerald: 'from-[#040d0a] via-[#05110d] to-[#04120e]',
    velvet: 'from-[#0e040c] via-[#140612] to-[#16060c]',
    platinum: 'from-[#08090c] via-[#0e1015] to-[#12141a]',
  }[theme];

  return (
    <div className={`min-h-screen bg-gradient-to-b ${themeBackdrop} text-slate-100 flex flex-col justify-between selection:bg-amber-500/30 selection:text-amber-200 pb-20 overflow-x-hidden`}>
      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={currentTrack?.audioSrc || undefined}
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && audioRef.current.duration) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={handleTrackEnded}
      />

      {/* Lark Header */}
      <LarkHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        theme={theme}
        onChangeTheme={setTheme}
        lang={lang}
        onToggleLang={() => setLang((l) => (l === 'fa' ? 'en' : 'fa'))}
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      {/* Lark Tab Bar */}
      <LarkTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        favoritesCount={favoritesTracks.length}
        theme={theme}
        lang={lang}
      />

      {/* Main Tab View Content */}
      <main className="flex-1 w-full pb-6">
        {/* Tab 1: Songs List */}
        {activeTab === 'songs' && (
          <LarkSongList
            tracks={filteredTracks.filter(t => t.mediaType !== 'video')}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onSelectTrack={handleSelectTrack}
            onTogglePlay={togglePlay}
            onToggleFavorite={toggleFavorite}
            onDeleteTrack={handleDeleteTrack}
            onPlayAll={handlePlayAll}
            onShuffleAll={handleShuffleAll}
            onOpenPlayer={() => setIsFullScreenPlayerOpen(true)}
            onQueue={modifyQueue}
            theme={theme}
            lang={lang}
          />
        )}

        {/* Tab 2: Favorites / Playlists */}
        {activeTab === 'playlists' && (
          <LarkSongList
            tracks={favoritesTracks}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onSelectTrack={handleSelectTrack}
            onTogglePlay={togglePlay}
            onToggleFavorite={toggleFavorite}
            onDeleteTrack={handleDeleteTrack}
            onPlayAll={handlePlayAll}
            onShuffleAll={handleShuffleAll}
            onOpenPlayer={() => setIsFullScreenPlayerOpen(true)}
            onQueue={modifyQueue}
            theme={theme}
            lang={lang}
          />
        )}

        {/* Tab 3: Equalizer View */}
        {activeTab === 'equalizer' && (
          <LarkEqualizerView
            gains={eqGains}
            onGainChange={handleEqGainChange}
            activePreset={activeEqPreset}
            onSelectPreset={handleSelectPreset}
            bassBoost={bassBoost}
            onToggleBassBoost={toggleBassBoost}
            surround3D={surround3D}
            onToggleSurround3D={toggleSurround3D}
            theme={theme}
            lang={lang}
          />
        )}

        {/* Tab 4: Local Folders & Files */}
        {activeTab === 'folders' && (
          <LarkFoldersView
            tracks={tracks}
            recentTracks={recentIds.map(id => tracks.find(t => t.id === id)).filter((t): t is Track => !!t)}
            onSelectTrack={handleSelectTrack}
            onOpenUpload={() => setIsUploadOpen(true)}
            onRescan={scanMedia}
            scanError={scanError}
            selectedTrack={currentTrack}
            onMessage={setToolMessage}
            toolMessage={toolMessage}
            theme={theme}
            lang={lang}
          />
        )}
      </main>

      {/* Lark Bottom Mini Player (Always accessible) */}
      {currentTrack && !videoOpen && <LarkMiniPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={togglePlay}
        onNext={handleNext}
        onOpenPlayer={() => setIsFullScreenPlayerOpen(true)}
        theme={theme}
        lang={lang}
      />}

      {/* Lark Full Screen Player (Opens on tap of mini player) */}
      {currentTrack && !videoOpen && currentTrack.mediaType !== 'video' && <LarkFullScreenPlayer
        isOpen={isFullScreenPlayerOpen}
        onClose={() => setIsFullScreenPlayerOpen(false)}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        currentTime={currentTime}
        duration={duration}
        onSeek={handleSeek}
        repeatMode={repeatMode}
        onCycleRepeat={cycleRepeat}
        isShuffled={isShuffled}
        onToggleShuffle={() => setIsShuffled(!isShuffled)}
        onToggleFavorite={toggleFavorite}
        playbackRate={playbackRate}
        onChangePlaybackRate={setPlaybackRate}
        sleepTimerSeconds={sleepTimerSecondsLeft}
        onStartSleepTimer={(m) => setSleepTimerSecondsLeft(m * 60)}
        onCancelSleepTimer={() => setSleepTimerSecondsLeft(null)}
        onOpenEqualizer={() => {
          setIsFullScreenPlayerOpen(false);
          setActiveTab('equalizer');
        }}
        onOpenQueue={() => {
          setIsFullScreenPlayerOpen(false);
          setQueueOpen(true);
        }}
        bassBoost={bassBoost}
        onToggleBassBoost={toggleBassBoost}
        surround3D={surround3D}
        onToggleSurround3D={toggleSurround3D}
        theme={theme}
        lang={lang}
      />}

      {queueOpen && (
        <div className="fixed inset-0 z-50 bg-[#0a0c13] p-5 overflow-y-auto text-slate-100">
          <div className="max-w-4xl mx-auto flex justify-between items-center mb-4">
            <h2 className="font-bold">{lang === 'fa' ? 'صف پخش' : 'Queue'}</h2>
            <button onClick={() => setQueueOpen(false)} className="p-2">✕</button>
          </div>
          <div className="max-w-4xl mx-auto mb-3">
            <button onClick={() => {
              if (native && nativeLoadedId.current) {
                NativeMedia.modifyQueue({ action: 'clear' })
                  .then(() => setQueueIds([])).catch(error => setScanError(String(error)));
              } else {
                setQueueIds([]);
              }
            }} className="text-xs text-rose-400">
              {lang === 'fa' ? 'پاک‌کردن صف' : 'Clear queue'}
            </button>
          </div>
          {queueIds.map((id, index) => {
            const track = tracks.find(t => t.id === id);
            return track && <div key={`${id}-${index}`} className="max-w-4xl mx-auto flex items-center justify-between p-3 border-b border-white/[0.06] text-xs">
              <button onClick={() => { handleSelectTrack(track); setQueueOpen(false); }} className="truncate text-start">{track.title}</button>
              <div className="flex items-center">
                <button disabled={index === 0} onClick={() => {
                  const to = index - 1;
                  if (native && nativeLoadedId.current) {
                    NativeMedia.modifyQueue({ action: 'move', from: index, to })
                      .then(() => NativeMedia.state().then(state => setQueueIds(state.queue || [])))
                      .catch(error => setScanError(String(error)));
                  } else setQueueIds(ids => { const next = [...ids]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; });
                }} className="p-2 disabled:opacity-30">↑</button>
                <button disabled={index === queueIds.length - 1} onClick={() => {
                  const to = index + 1;
                  if (native && nativeLoadedId.current) {
                    NativeMedia.modifyQueue({ action: 'move', from: index, to })
                      .then(() => NativeMedia.state().then(state => setQueueIds(state.queue || [])))
                      .catch(error => setScanError(String(error)));
                  } else setQueueIds(ids => { const next = [...ids]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; });
                }} className="p-2 disabled:opacity-30">↓</button>
                {id !== currentTrack?.id && <button onClick={() => modifyQueue(track, 'remove')} className="text-slate-400 p-2">{lang === 'fa' ? 'حذف' : 'Remove'}</button>}
              </div>
            </div>;
          })}
          {queueIds.length === 0 && <p className="text-slate-400 text-sm">{lang === 'fa' ? 'صف پخش خالی است' : 'Queue is empty'}</p>}
        </div>
      )}

      {videoOpen && currentTrack?.mediaType === 'video' && (
        <div className="fixed inset-0 z-50 bg-[#0a0c13] flex flex-col p-4 gap-3">
          <div className="flex justify-between items-center text-sm text-white">
            <span className="truncate">{currentTrack.title}</span>
            <button onClick={() => { videoRef.current?.pause(); setVideoOpen(false); }} className="p-2">✕</button>
          </div>
          <video ref={videoRef} key={currentTrack.id} src={currentTrack.nativeUri || currentTrack.audioSrc}
            controls autoPlay playsInline className="w-full flex-1 min-h-0 object-contain"
            onTimeUpdate={e => { const sec = e.currentTarget.currentTime; setCurrentTime(sec); if (Math.floor(sec) % 5 === 0) localStorage.setItem('ritmo_position_' + currentTrack.id, String(sec)); }}
            onLoadedMetadata={e => { e.currentTarget.currentTime = Number(localStorage.getItem('ritmo_position_' + currentTrack.id) || 0); setDuration(e.currentTarget.duration); }}
            onEnded={handleNext} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
          <div className="flex justify-center gap-8 text-amber-400 text-sm">
            <button onClick={handlePrev}>{lang === 'fa' ? 'قبلی' : 'Previous'}</button>
            <button onClick={handleNext}>{lang === 'fa' ? 'بعدی' : 'Next'}</button>
          </div>
        </div>
      )}

      {/* Upload Music Modal */}
      <TrackUploader
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onAddTrack={handleAddTrack}
        theme={theme}
        lang={lang}
      />
    </div>
  );
}
