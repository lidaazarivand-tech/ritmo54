package com.adelapp.larkplayer;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.media.MediaMetadataRetriever;
import android.media.audiofx.Equalizer;

import androidx.media3.common.MediaItem;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.ForwardingAudioSink;
import androidx.media3.common.Format;
import androidx.media3.common.MimeTypes;
import android.os.Handler;
import android.os.Looper;
import java.nio.ByteBuffer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.common.util.BitmapLoader;
import androidx.media3.session.CacheBitmapLoader;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.SettableFuture;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RitmoPlaybackService extends MediaSessionService {
    private static final String PREFS = "ritmo_playback_state";
    private static final String QUEUE = "queue";
    private MediaSession session;
    private static volatile RitmoPlaybackService activeService;
    private ExoPlayer playbackPlayer;
    private Equalizer systemEqualizer;
    private int equalizerSessionId = -1;
    private int[] requestedEqualizer = new int[10];
    private static final int[] EQUALIZER_FREQUENCIES = {32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000};
    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();
    private Bitmap fallbackArtwork;
    static volatile String foregroundError = "";
    // The stock sink still owns playback; this is only its read-only PCM tap.
    static volatile AudioAnalysisProcessor activeAnalysis;
    private final Handler analysisHandler = new Handler(Looper.getMainLooper());
    private Runnable analysisPositionTick;
    private static volatile boolean queueRestoreBlocked;

    @Override
    public void onCreate() {
        super.onCreate();
        foregroundError = "";
        queueRestoreBlocked = false;
        // Keep Media3's notification provider and foreground lifecycle, but surface real failures.
        setListener(new MediaSessionService.Listener() {
            @Override public void onForegroundServiceStartNotAllowedException() {
                foregroundError = "اندروید اجازه شروع سرویس پخش در پس‌زمینه را نداد. برنامه را باز کرده و پخش را دوباره شروع کنید.";
                Log.e("RitmoPlaybackService", foregroundError);
            }
        });
        AudioAnalysisProcessor analysis = new AudioAnalysisProcessor();
        activeAnalysis = analysis;
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this) {
            @Override protected AudioSink buildAudioSink(Context context, boolean floatOutput,
                    boolean playbackParams) {
                AudioSink stock = super.buildAudioSink(context, floatOutput, playbackParams);
                if (stock == null) return null;
                return new ForwardingAudioSink(stock) {
                    private ByteBuffer tappedBuffer;
                    private long streamOffsetUs;
                    @Override public void configure(Format format, int size, int[] channels)
                            throws AudioSink.ConfigurationException {
                        super.configure(format, size, channels);
                        analysis.configureTap(format.sampleRate, format.channelCount,
                            MimeTypes.AUDIO_RAW.equals(format.sampleMimeType) ? format.pcmEncoding : C.ENCODING_INVALID);
                        tappedBuffer = null;
                    }
                    @Override public void setOutputStreamOffsetUs(long offsetUs) {
                        super.setOutputStreamOffsetUs(offsetUs);
                        streamOffsetUs = offsetUs;
                        analysis.resetAnalysis(analysis.trackId());
                    }
                    @Override public boolean handleBuffer(ByteBuffer buffer, long timeUs, int count)
                            throws AudioSink.InitializationException, AudioSink.WriteException {
                        // Media3 retries the same partially consumed buffer. Analyse it once.
                        if (tappedBuffer != buffer) {
                            tappedBuffer = buffer;
                            try { analysis.tap(buffer, timeUs - streamOffsetUs); }
                            catch (RuntimeException error) {
                                analysis.resetAnalysis(analysis.trackId());
                                Log.w("RitmoAnalysis", "PCM analysis unavailable; playback retained", error);
                            }
                        }
                        boolean consumed = super.handleBuffer(buffer, timeUs, count);
                        if (consumed) tappedBuffer = null;
                        return consumed;
                    }
                    @Override public void flush() {
                        super.flush(); tappedBuffer = null;
                        analysis.resetAnalysis(analysis.trackId());
                    }
                    @Override public void reset() {
                        super.reset(); tappedBuffer = null;
                        analysis.resetAnalysis(analysis.trackId());
                    }
                };
            }
        };
        ExoPlayer player = new ExoPlayer.Builder(this, renderers)
            .setHandleAudioBecomingNoisy(true)
            .build();
        playbackPlayer = player;
        activeService = this;
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        restoreQueue(player);
        analysis.resetAnalysis(player.getCurrentMediaItem() == null ? "" : player.getCurrentMediaItem().mediaId);
        analysisPositionTick = new Runnable() {
            @Override public void run() {
                analysis.setPlaying(player.isPlaying());
                analysis.setPlaybackPosition(player.getCurrentPosition() * 1000L);
                analysisHandler.postDelayed(this, 40);
            }
        };
        analysisHandler.post(analysisPositionTick);
        player.addListener(new Player.Listener() {
            @Override public void onPositionDiscontinuity(Player.PositionInfo oldPosition,
                    Player.PositionInfo newPosition, int reason) {
                analysis.resetAnalysis(newPosition.mediaItem == null ? "" : newPosition.mediaItem.mediaId);
                analysis.setPlaybackPosition(player.getCurrentPosition() * 1000L);
            }
            @Override public void onMediaItemTransition(MediaItem item, int reason) {
                analysis.resetAnalysis(item == null ? "" : item.mediaId);
                analysis.setPlaybackPosition(player.getCurrentPosition() * 1000L);
            }
            @Override public void onIsPlayingChanged(boolean playing) {
                analysis.setPlaying(playing);
                analysis.setPlaybackPosition(player.getCurrentPosition() * 1000L);
                applyNativeEqualizer();
            }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) applyNativeEqualizer();
                if (state == Player.STATE_READY && player.getDuration() > 0 &&
                    player.getCurrentPosition() > player.getDuration())
                    player.seekTo(player.getDuration());
            }
            @Override public void onEvents(Player p, Player.Events events) {
                if (queueRestoreBlocked) return;
                if (events.contains(Player.EVENT_TIMELINE_CHANGED)) persistControllerState(getApplicationContext(), p);
                else persistPlaybackSettings(getApplicationContext(), p);
            }
        });
        Intent openApp = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent sessionActivity = PendingIntent.getActivity(this, 0, openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // A single Media3 session owns notification + lock-screen artwork.
        // Load embedded art lazily off the player thread, with only last-result caching.
        session = new MediaSession.Builder(this, player)
            .setSessionActivity(sessionActivity)
            .setBitmapLoader(new CacheBitmapLoader(new BitmapLoader() {
                @Override public boolean supportsMimeType(String mimeType) {
                    return mimeType != null && mimeType.startsWith("image/");
                }
                @Override public ListenableFuture<Bitmap> decodeBitmap(byte[] data) {
                    return artworkTask(() -> decodeArtwork(data));
                }
                @Override public ListenableFuture<Bitmap> loadBitmap(Uri uri) {
                    return artworkTask(() -> readArtwork(uri));
                }
            })).build();
    }

    private interface ArtworkTask { Bitmap run() throws Exception; }

    private ListenableFuture<Bitmap> artworkTask(ArtworkTask task) {
        SettableFuture<Bitmap> future = SettableFuture.create();
        try {
            artworkExecutor.execute(() -> {
                try {
                    Bitmap result = task.run();
                    future.set(result == null ? defaultArtwork() : result);
                } catch (Exception error) {
                    Log.w("RitmoArtwork", "No readable notification artwork; using Ritmo cover", error);
                    future.set(defaultArtwork());
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException error) {
            future.setException(error);
        }
        return future;
    }

    private Bitmap readArtwork(Uri uri) throws Exception {
        if ("content".equals(uri.getScheme()) && "media".equals(uri.getAuthority())
            && uri.getPath() != null && uri.getPath().contains("/audio/media/")) {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(this, uri);
                return decodeArtwork(retriever.getEmbeddedPicture());
            } finally { retriever.release(); }
        }
        // Album-art URIs supplied by the extractor are local images, not audio.
        if (!"content".equals(uri.getScheme()) && !"android.resource".equals(uri.getScheme())) return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(input, null, options);
        }
        prepareDecode(options);
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            return BitmapFactory.decodeStream(input, null, options);
        }
    }

    private Bitmap decodeArtwork(byte[] data) {
        if (data == null || data.length == 0 || data.length > 16 * 1024 * 1024) return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, options);
        prepareDecode(options);
        return BitmapFactory.decodeByteArray(data, 0, data.length, options);
    }

    private void prepareDecode(BitmapFactory.Options options) {
        options.inSampleSize = 1;
        while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 256)
            options.inSampleSize *= 2;
        options.inJustDecodeBounds = false;
        options.inPreferredConfig = Bitmap.Config.RGB_565;
    }

    private Bitmap defaultArtwork() {
        if (fallbackArtwork != null) return fallbackArtwork;
        // One small, muted 256x256 RGB_565 cover, approximately 128 KiB.
        Bitmap bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(0xFF141A23);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(0xFF344352);
        canvas.drawCircle(128, 106, 66, paint);
        paint.setColor(0xFF84919F);
        paint.setStrokeWidth(9);
        canvas.drawLine(142, 62, 142, 126, paint);
        canvas.drawLine(142, 62, 171, 71, paint);
        canvas.drawOval(111, 117, 146, 141, paint);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        paint.setTextSize(27);
        paint.setColor(0xFFA0AAB6);
        canvas.drawText("Ritmo", 128, 209, paint);
        fallbackArtwork = bitmap;
        return bitmap;
    }

    static synchronized void removeDeletedTrack(Context context, String id) {
        if (queueRestoreBlocked) {
            Log.w("RitmoDelete", "Invalid saved queue retained; explicit replacement required");
            return;
        }
        try {
            JSONArray old = new JSONArray(preferences(context).getString(QUEUE, "[]"));
            JSONArray next = new JSONArray();
            for (int i = 0; i < old.length(); i++) {
                JSONObject row = old.getJSONObject(i);
                if (!id.equals(row.optString("id"))) next.put(row);
            }
            SharedPreferences.Editor editor = preferences(context).edit().putString(QUEUE, next.toString());
            if (id.equals(preferences(context).getString("currentId", "")))
                editor.putString("currentId", "").putLong("position", 0);
            if (!editor.commit()) throw new IllegalStateException("Deleted-track queue save failed");
        } catch (Exception error) { Log.e("RitmoDelete", "Unable to clean persisted queue", error); }
    }

    static synchronized boolean persistQueue(Context context, List<MediaItem> items) {
        JSONArray json = new JSONArray();
        try {
            // MediaController may omit localConfiguration. Do not erase URIs on control().
            java.util.Map<String, String> oldUris = new java.util.HashMap<>();
            JSONArray oldQueue;
            try { oldQueue = new JSONArray(preferences(context).getString(QUEUE, "[]")); }
            catch (org.json.JSONException error) {
                // An explicit, fully specified replacement can repair corrupt legacy JSON.
                // Incomplete controller items still fail validation below; nothing is guessed.
                oldQueue = new JSONArray();
                Log.w("RitmoPlaybackService", "Previous queue metadata is unreadable", error);
            }
            for (int i = 0; i < oldQueue.length(); i++) {
                JSONObject old = oldQueue.getJSONObject(i);
                oldUris.put(old.optString("id"), old.optString("uri"));
            }
            for (MediaItem item : items) {
                JSONObject row = new JSONObject();
                row.put("id", item.mediaId);
                String uri = item.localConfiguration == null
                    ? (item.mediaMetadata.extras == null ? oldUris.getOrDefault(item.mediaId, "")
                        : item.mediaMetadata.extras.getString("ritmo_uri", oldUris.getOrDefault(item.mediaId, "")))
                    : item.localConfiguration.uri.toString();
                if (!RecoveryPolicy.mediaUri(item.mediaId, uri, "audio"))
                    throw new IllegalStateException("Incomplete queue URI; previous queue retained");
                row.put("uri", uri);
                CharSequence title = item.mediaMetadata.title;
                CharSequence artist = item.mediaMetadata.artist;
                row.put("title", title == null ? "" : title.toString());
                row.put("artist", artist == null ? "" : artist.toString());
                json.put(row);
            }
            // Do not publish an incomplete array if construction/serialization fails.
            String serialized = json.toString();
            if (serialized == null) throw new IllegalStateException("Queue serialization failed");
            if (!preferences(context).edit().putString(QUEUE, serialized).commit())
                throw new IllegalStateException("Queue save failed");
            queueRestoreBlocked = false;
            return true;
        } catch (Exception error) {
            queueRestoreBlocked = true;
            foregroundError = "ذخیره صف پخش انجام نشد؛ وضعیت قبلی حفظ شد.";
            Log.e("RitmoPlaybackService", "Unable to persist playback queue", error);
            return false;
        }
    }

    static boolean persistControllerState(Context context, Player player) {
        if (queueRestoreBlocked) return false;
        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < player.getMediaItemCount(); i++) items.add(player.getMediaItemAt(i));
        if (!persistQueue(context, items)) return false;
        return persistPlaybackSettings(context, player);
    }

    static boolean persistPlaybackSettings(Context context, Player player) {
        boolean saved = preferences(context).edit()
            .putString("currentId", player.getCurrentMediaItem() == null ? "" : player.getCurrentMediaItem().mediaId)
            .putInt("queueIndex", player.getCurrentMediaItemIndex())
            .putLong("position", Math.max(0, player.getCurrentPosition()))
            .putFloat("volume", player.getVolume())
            .putFloat("speed", player.getPlaybackParameters().speed)
            .putBoolean("shuffle", player.getShuffleModeEnabled())
            .putInt("repeat", player.getRepeatMode())
            .commit();
        if (!saved) {
            foregroundError = "ذخیره تنظیمات پخش انجام نشد؛ تغییرات فقط در حافظه هستند.";
            Log.e("RitmoPlaybackService", foregroundError);
        }
        return saved;
    }

    private void restoreQueue(ExoPlayer player) {
        try {
        // Settings survive restart even when the queue is empty.
        float volume = preferences(this).getFloat("volume", 0.85f);
        float speed = preferences(this).getFloat("speed", 1f);
        player.setVolume(Float.isFinite(volume) ? Math.max(0f, Math.min(1f, volume)) : 0.85f);
        player.setPlaybackSpeed(Float.isFinite(speed) ? Math.max(0.5f, Math.min(2f, speed)) : 1f);
        player.setShuffleModeEnabled(preferences(this).getBoolean("shuffle", false));
        // Migrate a legacy shuffle+repeat combination to the single selected
        // mode. Queue contents and notification/session architecture stay intact.
        int repeat = preferences(this).getInt("repeat", Player.REPEAT_MODE_ALL);
        player.setRepeatMode(player.getShuffleModeEnabled() ? Player.REPEAT_MODE_OFF
            : repeat >= 0 && repeat <= 2 ? repeat : Player.REPEAT_MODE_ALL);
        String raw = preferences(this).getString(QUEUE, "");
        if (raw == null || raw.isEmpty()) return;
            JSONArray json = new JSONArray(raw);
            List<MediaItem> items = new ArrayList<>();
            for (int i = 0; i < json.length(); i++) {
                JSONObject row = json.getJSONObject(i);
                String uri = row.optString("uri", "");
                // Do not silently discard inaccessible media on a temporary permission failure.
                // Retain the complete queue and let the existing onPlayerError UI explain failure.
                if (!RecoveryPolicy.mediaUri(row.getString("id"), uri, "audio"))
                    throw new IllegalArgumentException("Invalid persisted media URI; original queue retained");
                android.os.Bundle extras = new android.os.Bundle();
                extras.putString("ritmo_uri", uri);
                items.add(new MediaItem.Builder().setMediaId(row.getString("id"))
                    .setUri(uri).setMediaMetadata(new androidx.media3.common.MediaMetadata.Builder()
                        .setTitle(row.optString("title")).setArtist(row.optString("artist")).setExtras(extras)
                        .setArtworkUri(Uri.parse(uri)).build()).build());
            }
            if (!items.isEmpty()) {
                String currentId = preferences(this).getString("currentId", "");
                int index = 0;
                boolean sameTrack = false;
                int savedIndex = preferences(this).getInt("queueIndex", -1);
                if (savedIndex >= 0 && savedIndex < items.size() && items.get(savedIndex).mediaId.equals(currentId)) {
                    index = savedIndex; sameTrack = true;
                } else {
                    for (int i = 0; i < items.size(); i++) if (items.get(i).mediaId.equals(currentId)) {
                        index = i; sameTrack = true; break;
                    }
                }
                player.setMediaItems(items, index, RecoveryPolicy.position(preferences(this).getLong("position", 0), sameTrack, 0));
                player.prepare();
            } else {
                preferences(this).edit().putString("currentId", "").putLong("position", 0).apply();
            }
        } catch (Exception error) {
            queueRestoreBlocked = true;
            foregroundError = "صف ذخیره‌شده معتبر نیست؛ برای حفظ اطلاعات بازنویسی نشد.";
            Log.e("RitmoPlaybackService", "Unable to restore playback queue", error);
        }
    }

    private boolean isAvailable(String rawUri) {
        try (Cursor cursor = getContentResolver().query(Uri.parse(rawUri),
            new String[]{android.provider.MediaStore.MediaColumns._ID}, null, null, null)) {
            return cursor != null && cursor.moveToFirst();
        } catch (Exception error) {
            Log.w("RitmoPlaybackService", "Skipping unavailable queue item", error);
            return false;
        }
    }

    /** Apply the user's 10-band curve to the active Android audio session when supported. */
    public static void applyEqualizer(int[] gains) {
        RitmoPlaybackService service = activeService;
        if (service == null || gains == null || gains.length != 10) return;
        int[] safe = gains.clone();
        for (int i = 0; i < safe.length; i++) safe[i] = Math.max(-12, Math.min(12, safe[i]));
        service.analysisHandler.post(() -> {
            service.requestedEqualizer = safe;
            service.applyNativeEqualizer();
        });
    }

    private void applyNativeEqualizer() {
        ExoPlayer player = playbackPlayer;
        if (player == null) return;
        int sessionId;
        try { sessionId = player.getAudioSessionId(); }
        catch (RuntimeException error) { return; }
        if (sessionId <= 0) return;
        try {
            if (systemEqualizer == null || equalizerSessionId != sessionId) {
                releaseNativeEqualizer();
                systemEqualizer = new Equalizer(0, sessionId);
                equalizerSessionId = sessionId;
            }
            short[] range = systemEqualizer.getBandLevelRange();
            short bands = systemEqualizer.getNumberOfBands();
            boolean changed = false;
            for (short band = 0; band < bands; band++) {
                int centerHz = Math.max(1, systemEqualizer.getCenterFreq(band) / 1000);
                int nearest = 0;
                double distance = Double.MAX_VALUE;
                for (int index = 0; index < EQUALIZER_FREQUENCIES.length; index++) {
                    double candidate = Math.abs(Math.log(centerHz / (double) EQUALIZER_FREQUENCIES[index]));
                    if (candidate < distance) { distance = candidate; nearest = index; }
                }
                int millibels = requestedEqualizer[nearest] * 100;
                short level = (short) Math.max(range[0], Math.min(range[1], millibels));
                systemEqualizer.setBandLevel(band, level);
                changed |= level != 0;
            }
            systemEqualizer.setEnabled(changed);
        } catch (Exception error) {
            android.util.Log.w("RitmoEqualizer", "Device equalizer is unavailable; playback continues", error);
            releaseNativeEqualizer();
        }
    }

    private void releaseNativeEqualizer() {
        if (systemEqualizer != null) {
            try { systemEqualizer.setEnabled(false); } catch (Exception ignored) { }
            try { systemEqualizer.release(); } catch (Exception ignored) { }
        }
        systemEqualizer = null;
        equalizerSessionId = -1;
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return controllerInfo.getUid() == android.os.Process.myUid() || controllerInfo.isTrusted() ? session : null;
    }

    @Override
    public void onUpdateNotification(MediaSession mediaSession, boolean startInForegroundRequired) {
        // Do not recreate notifications or replace Media3's foreground handling.
        super.onUpdateNotification(mediaSession, startInForegroundRequired);
        // Do not erase storage/recovery errors just because playback is ongoing.
    }

    @Override
    public void onDestroy() {
        if (activeService == this) activeService = null;
        releaseNativeEqualizer();
        playbackPlayer = null;
        if (analysisPositionTick != null) analysisHandler.removeCallbacks(analysisPositionTick);
        if (activeAnalysis != null) {
            activeAnalysis.setPlaying(false); activeAnalysis.disable();
            activeAnalysis.resetAnalysis("");
        }
        activeAnalysis = null;
        if (session != null) {
            if (!queueRestoreBlocked) persistControllerState(getApplicationContext(), session.getPlayer());
            clearListener();
            session.getPlayer().release();
            session.release();
            session = null;
        }
        // Running decoding may finish; the released session cannot receive new requests.
        artworkExecutor.shutdown();
        super.onDestroy();
    }
}
