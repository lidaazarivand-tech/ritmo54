package com.adelapp.larkplayer;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor.AudioFormat;
import androidx.media3.common.audio.BaseAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Read-only tap of decoded PCM in the existing Media3 sink. Bytes are forwarded
 * unchanged. No recorder permission, second decoder, or Android Visualizer.
 * Only visible consumers with a fresh lease enable DSP (maximum 25 analyses/s).
 */
public final class AudioAnalysisProcessor extends BaseAudioProcessor {
    private static final int N = 2048;
    private static final double[] WINDOW = new double[N], COS = new double[N / 2], SIN = new double[N / 2];
    static {
        for (int i = 0; i < N; i++) WINDOW[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1));
        for (int i = 0; i < N / 2; i++) {
            COS[i] = Math.cos(-2 * Math.PI * i / N); SIN[i] = Math.sin(-2 * Math.PI * i / N);
        }
    }
    private final double[] real = new double[N], imaginary = new double[N];
    private final float[] mono = new float[N];
    private int cursor, sinceAnalysis, sampleRate, channels;
    private float previousEnergy;
    private long sequence;
    private volatile long leaseUntil;
    private volatile boolean playing;
    private volatile Frame[] history = new Frame[0];
    private volatile long playbackPositionUs = Long.MIN_VALUE;
    private long inputTimestampUs;
    private static final java.util.concurrent.atomic.AtomicLong GENERATIONS =
        new java.util.concurrent.atomic.AtomicLong();
    private volatile long generation = GENERATIONS.incrementAndGet();
    private volatile String trackId = "";

    public static final class Frame {
        public final long sequence;
        public final long presentationTimeUs;
        public final long generation;
        public final String trackId;
        public final float amplitude, bass, mid, treble, transientPeak;
        public final float[] bands, waveform;
        Frame(long sequence, long presentationTimeUs, long generation, String trackId,
              float amplitude, float bass, float mid, float treble,
              float transientPeak, float[] bands, float[] waveform) {
            this.sequence = sequence; this.presentationTimeUs = presentationTimeUs; this.amplitude = amplitude;
            this.generation = generation; this.trackId = trackId;
            this.bass = bass; this.mid = mid; this.treble = treble;
            this.transientPeak = transientPeak; this.bands = bands; this.waveform = waveform;
        }
    }

    public void renewLease() { leaseUntil = android.os.SystemClock.elapsedRealtime() + 2000; }
    public synchronized void disable() { leaseUntil = 0; onFlush(); }
    public void setPlaying(boolean value) { playing = value; }
    public void setInputTimestamp(long value) { inputTimestampUs = value; }
    public void setPlaybackPosition(long value) { playbackPositionUs = value; }
    public boolean isPlaying() { return playing; }
    public long generation() { return generation; }
    public String trackId() { return trackId; }
    public synchronized void resetAnalysis(String id) {
        trackId = id == null ? "" : id;
        onFlush();
    }
    /** Unsupported output is never allowed to break the stock audio sink. */
    public synchronized void configureTap(int rate, int count, int encoding) {
        sampleRate = rate;
        channels = encoding == C.ENCODING_PCM_16BIT && rate > 0 && count > 0 ? count : 0;
        onFlush();
    }
    public synchronized Frame snapshot() {
        if (!playing) return null;
        // Select analysis by the real sink clock, not decoder-ahead wall time.
        Frame result = null;
        for (Frame frame : history) {
            if (frame.presentationTimeUs <= playbackPositionUs) result = frame;
        }
        // Never hold decoder data indefinitely through a seek, lease gap or stall.
        return result != null && playbackPositionUs - result.presentationTimeUs <= 200000
            ? result : null;
    }

    @Override protected AudioFormat onConfigure(AudioFormat format) throws UnhandledAudioFormatException {
        if (format.encoding != C.ENCODING_PCM_16BIT)
            throw new UnhandledAudioFormatException(format);
        sampleRate = format.sampleRate; channels = format.channelCount;
        return format;
    }

    @Override public void queueInput(ByteBuffer input) {
        int bytes = input.remaining();
        tap(input, inputTimestampUs);
        // Preserve the exact PCM, channel count, timing and playback ownership.
        ByteBuffer output = replaceOutputBuffer(bytes);
        output.put(input); output.flip();
    }

    /** Renderer-thread read-only tap; the original buffer is never consumed. */
    public synchronized void tap(ByteBuffer input, long presentationTimeUs) {
        if (playing && android.os.SystemClock.elapsedRealtime() < leaseUntil && channels > 0) {
            ByteBuffer samples = input.duplicate().order(ByteOrder.LITTLE_ENDIAN);
            int stride = channels * 2;
            long framesInBuffer = 0;
            while (samples.remaining() >= stride) {
                float dominant = 0;
                // Preserve real signal even for anti-phase stereo or a silent
                // left channel, rather than cancelling it with naive averaging.
                for (int c = 0; c < channels; c++) {
                    float sample = samples.getShort() / 32768f;
                    if (Math.abs(sample) > Math.abs(dominant)) dominant = sample;
                }
                mono[cursor] = dominant;
                framesInBuffer++;
                cursor = (cursor + 1) % N;
                if (++sinceAnalysis >= Math.max(N, sampleRate / 25)) {
                    sinceAnalysis = 0;
                    analyse(presentationTimeUs + (framesInBuffer - N / 2) * 1000000L / sampleRate);
                }
            }
        } else {
            cursor = sinceAnalysis = 0; previousEnergy = 0;
            java.util.Arrays.fill(mono, 0);
        }
    }

    private static float normalize(double value) {
        // Fixed scale, not per-track auto-gain: silence and quiet music stay quiet.
        return (float) Math.min(1, Math.max(0, Math.log1p(value * 16) / Math.log(17)));
    }

    private void analyse(long presentationTimeUs) {
        double sum = 0, peak = 0;
        float[] waveform = new float[64];
        for (int i = 0; i < N; i++) {
            float sample = mono[(cursor + i) % N];
            sum += sample * sample; peak = Math.max(peak, Math.abs(sample));
            real[i] = sample * WINDOW[i];
            imaginary[i] = 0;
        }
        // Signed extrema retain actual waveform peaks without shipping raw PCM.
        for (int i = 0; i < 64; i++) {
            float value = 0;
            for (int j = 0; j < N / 64; j++) {
                float candidate = mono[(cursor + i * (N / 64) + j) % N];
                if (Math.abs(candidate) > Math.abs(value)) value = candidate;
            }
            waveform[i] = value;
        }
        fft(real, imaginary);
        double[] powers = new double[24];
        double bass = 0, mid = 0, treble = 0;
        for (int i = 1; i < N / 2; i++) {
            double hz = (double) i * sampleRate / N;
            if (hz < 30 || hz > 16000) continue;
            double power = (real[i] * real[i] + imaginary[i] * imaginary[i]) * 8 / (N * N);
            int band = Math.min(23, Math.max(0, (int) (Math.log(hz / 30) / Math.log(16000.0 / 30) * 24)));
            powers[band] += power;
            if (hz < 250) bass += power;
            else if (hz < 4000) mid += power;
            else treble += power;
        }
        float[] bands = new float[24];
        for (int i = 0; i < 24; i++) bands[i] = normalize(Math.sqrt(powers[i]));
        float rms = (float) Math.sqrt(sum / N);
        float transientPeak = Math.min(1, Math.max(0, rms - previousEnergy) * 8
            + (float) Math.max(0, peak - rms * 3) * .35f);
        previousEnergy = rms;
        Frame latest = new Frame(++sequence, presentationTimeUs, generation, trackId,
            normalize(rms), normalize(Math.sqrt(bass)),
            normalize(Math.sqrt(mid)), normalize(Math.sqrt(treble)), transientPeak, bands, waveform);
        Frame[] old = history;
        int keep = Math.min(old.length, 127);
        Frame[] next = new Frame[keep + 1];
        System.arraycopy(old, old.length - keep, next, 0, keep);
        next[keep] = latest; history = next;
    }

    static void fft(double[] re, double[] im) {
        int n = re.length;
        for (int i = 1, j = 0; i < n; i++) {
            int bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                double t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        for (int size = 2; size <= n; size <<= 1) {
            for (int start = 0; start < n; start += size) {
                for (int j = 0; j < size / 2; j++) {
                    double cos = COS[j * N / size], sin = SIN[j * N / size];
                    int a = start + j, b = a + size / 2;
                    double x = re[b] * cos - im[b] * sin, y = re[b] * sin + im[b] * cos;
                    re[b] = re[a] - x; im[b] = im[a] - y;
                    re[a] += x; im[a] += y;
                }
            }
        }
    }

    @Override protected synchronized void onFlush() {
        cursor = sinceAnalysis = 0; previousEnergy = 0;
        history = new Frame[0]; generation = GENERATIONS.incrementAndGet();
        playbackPositionUs = Long.MIN_VALUE;
        java.util.Arrays.fill(mono, 0);
    }
    // Sink reconfiguration can happen during continuous/gapless playback.
    // Only the service's actual transport may change "playing".
    @Override protected void onReset() { onFlush(); }
}
