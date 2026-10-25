/**
 * Read browser-selected audio duration without starting playback.
 * Some browsers expose duration only after loading media metadata.
 */
export function probeAudioDuration(
  uri: string,
  createAudio: () => HTMLAudioElement = () => new Audio(),
): Promise<number | null> {
  if (!uri) return Promise.resolve(null);

  return new Promise(resolve => {
    let audio: HTMLAudioElement;
    try {
      audio = createAudio();
    } catch {
      resolve(null);
      return;
    }
    let settled = false;

    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener('loadedmetadata', onMetadata);
      audio.removeEventListener('error', onError);
      audio.removeAttribute('src');
      try { audio.load(); } catch { /* Metadata cleanup is best-effort. */ }
      resolve(duration);
    };
    const onMetadata = () => {
      const duration = audio.duration;
      finish(Number.isFinite(duration) && duration > 0 ? duration : null);
    };
    const onError = () => finish(null);

    try {
      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', onMetadata, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.src = uri;
      audio.load();
    } catch {
      finish(null);
    }
  });
}
