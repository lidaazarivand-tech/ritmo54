package com.adelapp.larkplayer;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.media.MediaMetadataRetriever;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Activity;
import android.app.PendingIntent;
import android.app.RecoverableSecurityException;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.provider.Settings;
import android.util.Log;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeMedia", permissions = {
    @Permission(alias = "audio", strings = {Manifest.permission.READ_MEDIA_AUDIO}),
    @Permission(alias = "video", strings = {Manifest.permission.READ_MEDIA_VIDEO}),
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}),
    @Permission(alias = "legacy", strings = {Manifest.permission.READ_EXTERNAL_STORAGE}),
    @Permission(alias = "legacyDelete", strings = {Manifest.permission.WRITE_EXTERNAL_STORAGE})
})
public class NativeMediaPlugin extends Plugin {
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController controller;
    private HandlerThread controllerThread;
    private Handler controllerHandler;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService scanExecutor = Executors.newSingleThreadExecutor();
    private String playbackError = "";
    private volatile boolean destroyed;
    private ActivityResultLauncher<IntentSenderRequest> deleteLauncher;
    private PluginCall pendingDelete;
    private final java.util.Set<String> missingArtwork = new java.util.LinkedHashSet<>();
    private boolean analysisRequested;
    private boolean analysisForeground = true;
    private long analysisSequence = -1;
    private long analysisGeneration = -1;
    private boolean analysisAvailable;
    private final Runnable analysisTick = new Runnable() {
        @Override public void run() {
            if (destroyed || !analysisRequested || !analysisForeground) return;
            AudioAnalysisProcessor processor = RitmoPlaybackService.activeAnalysis;
            if (processor != null) {
                if (processor.isPlaying()) processor.renewLease();
                synchronized (processor) {
                    AudioAnalysisProcessor.Frame frame = processor.snapshot();
                    long generation = processor.generation();
                    boolean available = frame != null;
                    if (generation != analysisGeneration
                            || (processor.isPlaying() && available != analysisAvailable)
                            || (available && frame.sequence != analysisSequence)) {
                        analysisGeneration = generation; analysisAvailable = available;
                        analysisSequence = available ? frame.sequence : -1;
                        JSObject data = new JSObject();
                        data.put("sequence", available ? frame.sequence : 0);
                        data.put("generation", generation); data.put("trackId", processor.trackId());
                        data.put("presentationTimeUs", available ? frame.presentationTimeUs : 0);
                        data.put("amplitude", available ? frame.amplitude : 0);
                        data.put("bass", available ? frame.bass : 0);
                        data.put("mid", available ? frame.mid : 0); data.put("treble", available ? frame.treble : 0);
                        data.put("transient", available ? frame.transientPeak : 0);
                        JSArray bands = new JSArray(), waveform = new JSArray();
                        for (float value : available ? frame.bands : new float[24]) bands.put((Object) Float.valueOf(value));
                        for (float value : available ? frame.waveform : new float[64]) waveform.put((Object) Float.valueOf(value));
                        data.put("bands", bands); data.put("waveform", waveform);
                        notifyListeners("audioAnalysis", data);
                    }
                }
            }
            mainHandler.postDelayed(this, 40);
        }
    };

    @com.getcapacitor.PluginMethod
    public void setAudioAnalysis(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        mainHandler.post(() -> {
            analysisRequested = enabled; analysisSequence = -1; analysisGeneration = -1;
            restartAnalysis();
            call.resolve();
        });
    }

    private void restartAnalysis() {
        mainHandler.removeCallbacks(analysisTick);
        AudioAnalysisProcessor processor = RitmoPlaybackService.activeAnalysis;
        if (processor != null) processor.disable();
        if (!destroyed && analysisRequested && analysisForeground) mainHandler.post(analysisTick);
    }

    @Override protected void handleOnPause() {
        analysisForeground = false; restartAnalysis(); super.handleOnPause();
    }
    @Override protected void handleOnResume() {
        super.handleOnResume(); analysisForeground = true; restartAnalysis();
    }

    @Override
    public void load() {
        controllerThread = new HandlerThread("RitmoMediaController");
        controllerThread.start();
        controllerHandler = new Handler(controllerThread.getLooper());
        deleteLauncher = getActivity().getActivityResultRegistry().register(
            "ritmo-delete-song", getActivity(), new ActivityResultContracts.StartIntentSenderForResult(), result -> {
                PluginCall call = pendingDelete;
                pendingDelete = null;
                if (call == null) return;
                if (result.getResultCode() != Activity.RESULT_OK) {
                    scanExecutor.execute(() -> {
                        try {
                            String token = call.getString("backupToken", "");
                            if (!token.isEmpty()) new RecentlyDeletedStore(getContext()).cancel(token);
                            JSObject cancelled = new JSObject();
                            cancelled.put("deleted", false); call.resolve(cancelled);
                        } catch (Exception error) { call.reject("حذف لغو شد؛ نسخه بازیابی برای بررسی حفظ شد", error); }
                    });
                    return;
                }
                // Android 11+ deletes in the system dialog. Android 10 only grants
                // access, so retry this exact row after approval.
                if (Build.VERSION.SDK_INT >= 30) verifyDeletedSong(call);
                else performDeleteSong(call, false);
            });
        controllerHandler.post(this::connectController);
    }

    // All connection state belongs to the controller looper. Never retain a
    // disconnected controller, or let a previous connection overwrite a new one.
    private void connectController() {
        if (destroyed || controller != null && controller.isConnected()
            || controllerFuture != null && !controllerFuture.isDone()) return;
        if (controllerFuture != null) MediaController.releaseFuture(controllerFuture);
        controller = null;
        SessionToken token = new SessionToken(getContext(),
            new android.content.ComponentName(getContext(), RitmoPlaybackService.class));
        ListenableFuture<MediaController> future = new MediaController.Builder(getContext(), token)
            .setApplicationLooper(controllerThread.getLooper())
            .setListener(new MediaController.Listener() {
                @Override public void onDisconnected(MediaController disconnected) {
                    if (controller == disconnected) {
                        controller = null;
                        controllerFuture = null;
                        playbackError = "اتصال سرویس پخش قطع شد؛ با درخواست بعدی دوباره متصل می‌شود.";
                    }
                }
            })
            .buildAsync();
        controllerFuture = future;
        future.addListener(() -> {
            if (destroyed || controllerFuture != future) return;
            try {
                controller = future.get();
                MediaController connected = controller;
                playbackError = "";
                connected.addListener(new Player.Listener() {
                    @Override public void onPlayerError(PlaybackException error) {
                        playbackError = error.getMessage() == null ? "پخش این فایل ممکن نیست" : error.getMessage();
                        JSObject payload = new JSObject();
                        payload.put("type", "error");
                        payload.put("message", error.getMessage() == null ? "پخش این فایل ممکن نیست" : error.getMessage());
                        payload.put("code", error.errorCode);
                        mainHandler.post(() -> notifyListeners("playbackState", payload));
                    }
                    @Override public void onMediaItemTransition(MediaItem item, int reason) {
                        playbackError = "";
                        JSObject state = currentState(connected);
                        mainHandler.post(() -> notifyListeners("playbackState", state));
                    }
                    @Override public void onPositionDiscontinuity(Player.PositionInfo oldPosition,
                            Player.PositionInfo newPosition, int reason) {
                        JSObject state = currentState(connected);
                        state.put("analysisDiscontinuity", true);
                        mainHandler.post(() -> notifyListeners("playbackState", state));
                    }
                    @Override public void onIsPlayingChanged(boolean playing) {
                        JSObject state = currentState(connected);
                        mainHandler.post(() -> notifyListeners("playbackState", state));
                    }
                    @Override public void onPlaybackStateChanged(int state) {
                        JSObject current = currentState(connected);
                        mainHandler.post(() -> notifyListeners("playbackState", current));
                    }
                });
            } catch (Exception error) {
                controller = null;
                controllerFuture = null;
                mainHandler.post(() -> notifyListeners("playbackState",
                    errorState("سرویس پخش در دسترس نیست: " + messageOf(error))));
            }
        }, controllerHandler::post);
    }

    private interface ControllerAction { void run(MediaController controller); }

    private void withController(PluginCall call, ControllerAction action) {
        if (destroyed || controllerHandler == null) {
            call.reject("سرویس پخش در دسترس نیست");
            return;
        }
        controllerHandler.post(() -> {
            connectController();
            ListenableFuture<MediaController> future = controllerFuture;
            if (future == null) { call.reject("سرویس پخش در دسترس نیست"); return; }
            future.addListener(() -> {
                try {
                    MediaController connected = future.get();
                    if (destroyed || !connected.isConnected()) {
                        call.reject("سرویس پخش در دسترس نیست"); return;
                    }
                    action.run(connected);
                } catch (Exception error) {
                    call.reject("سرویس پخش در دسترس نیست: " + messageOf(error), error);
                }
            }, controllerHandler::post);
        });
    }

    private static String messageOf(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private JSObject errorState(String message) {
        JSObject state = new JSObject();
        state.put("type", "error");
        state.put("message", message);
        state.put("error", message);
        return state;
    }

    @com.getcapacitor.PluginMethod
    public void scan(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
            && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED
            && !getContext().getSharedPreferences("ritmo_permissions", android.content.Context.MODE_PRIVATE)
                .getBoolean("askedNotifications", false)) {
            getContext().getSharedPreferences("ritmo_permissions", android.content.Context.MODE_PRIVATE)
                .edit().putBoolean("askedNotifications", true).apply();
            requestPermissionForAliases(new String[]{"notifications"}, call, "notificationPermissionResult");
            return;
        }
        continueScan(call);
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        continueScan(call);
    }

    @com.getcapacitor.PluginMethod
    public void notificationStatus(PluginCall call) {
        call.resolve(notificationState());
    }

    private JSObject notificationState() {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        JSObject result = new JSObject();
        result.put("permission", Build.VERSION.SDK_INT < 33 ? "granted" : getPermissionState("notifications").toString());
        result.put("enabled", manager.areNotificationsEnabled());
        boolean channelsEnabled = true;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = manager.getNotificationChannel("default_channel_id");
            channelsEnabled = channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        result.put("channelsEnabled", channelsEnabled);
        try {
            result.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
        } catch (android.content.pm.PackageManager.NameNotFoundException error) {
            result.put("version", "");
        }
        return result;
    }

    @com.getcapacitor.PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED) {
            call.resolve(notificationState());
            return;
        }
        requestPermissionForAliases(new String[]{"notifications"}, call, "requestedNotificationResult");
    }

    @PermissionCallback
    private void requestedNotificationResult(PluginCall call) {
        call.resolve(notificationState());
    }

    @com.getcapacitor.PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 26) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        }
        getActivity().startActivity(intent);
        call.resolve();
    }

    @com.getcapacitor.PluginMethod
    public void deleteSong(PluginCall call) {
        if (call.getString("backupToken", "").isEmpty()) {
            call.reject("نسخه امن بازیابی لازم است؛ هیچ فایلی حذف نشد.");
            return;
        }
        String rawUri = call.getString("uri", "");
        String id = call.getString("id", "");
        Uri uri = Uri.parse(rawUri);
        // Only a single audio MediaStore row obtained by scan is accepted.
        // No filesystem path, collection URI, selection or video deletion.
        if (!"content".equals(uri.getScheme()) || !"media".equals(uri.getAuthority())
            || uri.getQuery() != null || uri.getFragment() != null
            || uri.getPath() == null
            || !uri.getPath().matches("/(?:external|external_primary)/audio/media/[1-9][0-9]*")
            || !id.equals("audio-" + uri.getLastPathSegment())) {
            call.reject("نشانی آهنگ برای حذف نامعتبر است");
            return;
        }
        mainHandler.post(() -> {
            if (pendingDelete != null) { call.reject("یک درخواست حذف دیگر در حال بررسی است"); return; }
            if (Build.VERSION.SDK_INT <= 28
                && getPermissionState("legacyDelete") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAliases(new String[]{"legacyDelete"}, call, "deletePermissionResult");
                return;
            }
            // Establish the session before deletion so its live queue can be updated.
            withController(call, connected -> performDeleteSong(call, true));
        });
    }

    @PermissionCallback
    private void deletePermissionResult(PluginCall call) {
        if (getPermissionState("legacyDelete") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("مجوز حذف فایل داده نشد؛ هیچ فایلی حذف نشد.");
            return;
        }
        withController(call, connected -> performDeleteSong(call, true));
    }

    private void performDeleteSong(PluginCall call, boolean mayRequestApproval) {
        scanExecutor.execute(() -> {
            Uri uri = Uri.parse(call.getString("uri", ""));
            try {
                String token = call.getString("backupToken", "");
                if (token.isEmpty()) throw new IllegalArgumentException("نسخه امن بازیابی لازم است.");
                new RecentlyDeletedStore(getContext()).validatePrepared(
                    token, call.getString("id", ""), uri.toString());
                if (Build.VERSION.SDK_INT >= 30 && mayRequestApproval) {
                    PendingIntent approval = MediaStore.createDeleteRequest(
                        getContext().getContentResolver(), java.util.Collections.singletonList(uri));
                    launchDeleteApproval(call, approval);
                    return;
                }
                int rows = getContext().getContentResolver().delete(uri, null, null);
                if (rows != 1) { call.reject("فایل حذف نشد یا دیگر روی دستگاه موجود نیست"); return; }
                verifyDeletedSong(call);
            } catch (SecurityException error) {
                if (Build.VERSION.SDK_INT == 29 && mayRequestApproval && error instanceof RecoverableSecurityException)
                    launchDeleteApproval(call, ((RecoverableSecurityException) error).getUserAction().getActionIntent());
                else call.reject("اندروید اجازه حذف این فایل را نداد", error);
            } catch (Exception error) {
                call.reject("حذف فایل انجام نشد: " + messageOf(error), error);
            }
        });
    }

    private void launchDeleteApproval(PluginCall call, PendingIntent approval) {
        mainHandler.post(() -> {
            if (destroyed || pendingDelete != null) { call.reject("درخواست حذف در دسترس نیست"); return; }
            pendingDelete = call;
            try {
                deleteLauncher.launch(new IntentSenderRequest.Builder(approval.getIntentSender()).build());
            } catch (Exception error) {
                pendingDelete = null;
                call.reject("نمایش تأیید حذف اندروید ممکن نیست", error);
            }
        });
    }

    private void verifyDeletedSong(PluginCall call) {
        scanExecutor.execute(() -> {
            try (Cursor cursor = getContext().getContentResolver().query(
                Uri.parse(call.getString("uri", "")), new String[]{MediaStore.MediaColumns._ID}, null, null, null)) {
                if (cursor == null || cursor.moveToFirst()) {
                    call.reject("حذف فایل تأیید نشد؛ فهرست‌ها تغییر نکردند");
                    return;
                }
                String id = call.getString("id", "");
                String backupToken = call.getString("backupToken", "");
                String recoveryWarning = "";
                if (!backupToken.isEmpty()) {
                    try { new RecentlyDeletedStore(getContext()).markDeleted(backupToken); }
                    catch (Exception error) {
                        // The previously committed prepared journal + full copy
                        // remain recoverable. Still detach the deleted original.
                        Log.w("RitmoTrash", "Recovery journal remains prepared", error);
                        recoveryWarning = "فایل اصلی حذف شد؛ نسخه امن حفظ شد، اما تکمیل ثبت بازیابی نیاز به بررسی دارد.";
                    }
                }
                final String savedRecoveryWarning = recoveryWarning;
                RitmoPlaybackService.removeDeletedTrack(getContext(), id);
                controllerHandler.post(() -> {
                    JSObject result = new JSObject();
                    result.put("deleted", true);
                    if (!savedRecoveryWarning.isEmpty()) result.put("warning", savedRecoveryWarning);
                    try {
                        if (controller == null || !controller.isConnected())
                            throw new IllegalStateException("Session disconnected");
                        // Unlike ordinary 'remove from queue', deletion also removes
                        // the playing item and every duplicate of this same ID.
                        for (int i = controller.getMediaItemCount() - 1; i >= 0; i--)
                            if (id.equals(controller.getMediaItemAt(i).mediaId)) controller.removeMediaItem(i);
                        RitmoPlaybackService.persistControllerState(getContext(), controller);
                        result.put("state", currentState(controller));
                    } catch (Exception error) {
                        Log.w("RitmoDelete", "File deleted; session will restore only available files", error);
                        result.put("warning", "فایل حذف شد؛ اتصال صف پخش را دوباره بررسی کنید.");
                    }
                    call.resolve(result);
                });
            } catch (Exception error) {
                call.reject("بررسی نتیجه حذف ممکن نیست: " + messageOf(error), error);
            }
        });
    }

    // Reversible library exclusions never delete the file. Unlike queue removal,
    // this also detaches the current item and persists the updated native queue.
    @com.getcapacitor.PluginMethod
    public void detachLibrarySong(PluginCall call) {
        String id = call.getString("id", "");
        if (!id.matches("audio-[1-9][0-9]*")) { call.reject("شناسه آهنگ نامعتبر است"); return; }
        withController(call, connected -> {
            try {
                for (int i = connected.getMediaItemCount() - 1; i >= 0; i--)
                    if (id.equals(connected.getMediaItemAt(i).mediaId)) connected.removeMediaItem(i);
                RitmoPlaybackService.persistControllerState(getContext(), connected);
                call.resolve();
            } catch (Exception error) { call.reject("خارج‌کردن آهنگ از صف انجام نشد", error); }
        });
    }

    @com.getcapacitor.PluginMethod
    public void checkLibrarySong(PluginCall call) {
        Uri uri = Uri.parse(call.getString("uri", ""));
        if (!"content".equals(uri.getScheme()) || !"media".equals(uri.getAuthority()) ||
            uri.getQuery() != null || uri.getFragment() != null || uri.getPath() == null ||
            !uri.getPath().matches("/(?:external|external_primary)/audio/media/[1-9][0-9]*")) {
            call.reject("نشانی آهنگ معتبر نیست"); return;
        }
        scanExecutor.execute(() -> {
            try (android.os.ParcelFileDescriptor file = getContext().getContentResolver().openFileDescriptor(uri, "r")) {
                if (file == null) { call.reject("فایل اصلی در دسترس نیست"); return; }
                call.resolve();
            } catch (Exception error) { call.reject("فایل اصلی در دسترس نیست؛ داده بازیابی حفظ شد", error); }
        });
    }

    @com.getcapacitor.PluginMethod
    public void prepareTrash(PluginCall call) {
        scanExecutor.execute(() -> {
            try {
                JSObject metadata = call.getObject("metadata", new JSObject());
                String token = new RecentlyDeletedStore(getContext()).prepare(
                    call.getString("id", ""), call.getString("uri", ""), metadata);
                JSObject result = new JSObject(); result.put("token", token); call.resolve(result);
            } catch (Exception error) { call.reject("آماده‌سازی بازیابی انجام نشد: " + messageOf(error), error); }
        });
    }

    @com.getcapacitor.PluginMethod
    public void recentlyDeleted(PluginCall call) {
        scanExecutor.execute(() -> {
            try {
                JSONObject result = new RecentlyDeletedStore(getContext()).list(call.getBoolean("cleanup", false));
                call.resolve(JSObject.fromJSONObject(result));
            } catch (Exception error) { call.reject("بررسی اخیراً حذف‌شده انجام نشد: " + messageOf(error), error); }
        });
    }

    @com.getcapacitor.PluginMethod
    public void manageTrash(PluginCall call) {
        scanExecutor.execute(() -> {
            try {
                RecentlyDeletedStore store = new RecentlyDeletedStore(getContext());
                String action = call.getString("action", ""), token = call.getString("token", "");
                JSObject result = new JSObject();
                if ("days".equals(action)) store.setDays(call.getInt("days", 30));
                else if ("restore".equals(action)) {
                    String uri = store.restore(token);
                    result.put("uri", uri); result.put("id", "audio-" + Uri.parse(uri).getLastPathSegment());
                } else if ("finishRestore".equals(action)) store.finishRestore(token);
                else if ("permanent".equals(action)) store.permanent(token);
                else if ("cancel".equals(action)) store.cancel(token);
                else { call.reject("عملیات بازیابی نامعتبر است."); return; }
                call.resolve(result);
            } catch (Exception error) { call.reject("عملیات انجام نشد؛ داده بازیابی حفظ شد: " + messageOf(error), error); }
        });
    }

    @com.getcapacitor.PluginMethod
    public void sendFeedback(PluginCall call) {
        mainHandler.post(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_SENDTO,
                    Uri.parse("mailto:azarivandadel@gmail.com?subject=" + Uri.encode("بازخورد Ritmo")));
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception error) { call.reject("برنامه ایمیل در دسترس نیست", error); }
        });
    }

    // Serial, lazy extraction on the scan executor, with sampled decoding and a bounded disk cache.
    @com.getcapacitor.PluginMethod
    public void artwork(PluginCall call) {
        String rawUri = call.getString("uri", "");
        String key = call.getString("key", "");
        String type = call.getString("type", "audio");
        boolean trustedLibraryUri = "audio".equals(type)
            ? rawUri.matches("content://media/(?:external|external_primary)/audio/media/[1-9][0-9]*")
                || rawUri.matches("content://com\\.adelapp\\.larkplayer\\.fileprovider/shared-audio/[0-9a-f]{32}\\.[A-Za-z0-9]{1,8}")
            : rawUri.matches("content://media/(?:external|external_primary)/video/media/[1-9][0-9]*");
        if (!trustedLibraryUri || key.isEmpty()) {
            call.reject("نشانی کاور نامعتبر است");
            return;
        }
        scanExecutor.execute(() -> {
            MediaMetadataRetriever retriever = null;
            Bitmap bitmap = null;
            Bitmap scaled = null;
            File temporary = null;
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] hash = digest.digest((rawUri + "|" + key).getBytes(StandardCharsets.UTF_8));
                StringBuilder name = new StringBuilder();
                for (byte b : hash) name.append(String.format("%02x", b & 0xff));
                File directory = new File(getContext().getCacheDir(), "ritmo-artwork");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Unable to create artwork cache");
                File file = new File(directory, name + ".jpg");
                if (!file.isFile() && !missingArtwork.contains(name.toString())) {
                    retriever = new MediaMetadataRetriever();
                    retriever.setDataSource(getContext(), Uri.parse(rawUri));
                    if ("video".equals(type)) {
                        // Older Android cannot request a bounded frame, so retain its default image.
                        if (Build.VERSION.SDK_INT >= 27)
                            bitmap = retriever.getScaledFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 512, 512);
                    } else {
                        byte[] bytes = retriever.getEmbeddedPicture();
                        if (bytes != null && bytes.length <= 16 * 1024 * 1024) {
                            BitmapFactory.Options options = new BitmapFactory.Options();
                            options.inJustDecodeBounds = true;
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                            options.inSampleSize = 1;
                            while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 512) options.inSampleSize *= 2;
                            options.inJustDecodeBounds = false;
                            options.inPreferredConfig = Bitmap.Config.RGB_565;
                            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                        }
                    }
                    if (bitmap != null) {
                        float factor = Math.min(1f, 512f / Math.max(bitmap.getWidth(), bitmap.getHeight()));
                        scaled = factor < 1 ? Bitmap.createScaledBitmap(bitmap, Math.max(1, Math.round(bitmap.getWidth() * factor)),
                            Math.max(1, Math.round(bitmap.getHeight() * factor)), true) : bitmap;
                        temporary = new File(directory, name + ".tmp");
                        try (FileOutputStream output = new FileOutputStream(temporary)) {
                            if (!scaled.compress(Bitmap.CompressFormat.JPEG, 85, output)) throw new IOException("Unable to encode artwork");
                        }
                        if (!temporary.renameTo(file)) throw new IOException("Unable to store artwork");
                    } else {
                        missingArtwork.add(name.toString());
                        if (missingArtwork.size() > 256) missingArtwork.remove(missingArtwork.iterator().next());
                    }
                }
                if (file.isFile()) file.setLastModified(System.currentTimeMillis());
                trimArtwork(directory, file);
                JSObject result = new JSObject();
                result.put("uri", file.isFile() ? Uri.fromFile(file).toString() : "");
                call.resolve(result);
            } catch (Exception error) {
                Log.w("RitmoArtwork", "Unable to read embedded artwork", error);
                call.reject("خواندن کاور ممکن نیست", error);
            } finally {
                if (scaled != null && scaled != bitmap) scaled.recycle();
                if (bitmap != null) bitmap.recycle();
                if (temporary != null && temporary.exists()) temporary.delete();
                if (retriever != null) try { retriever.release(); } catch (IOException error) { Log.w("RitmoArtwork", "Unable to release retriever", error); }
            }
        });
    }

    private void trimArtwork(File directory, File current) {
        File[] files = directory.listFiles((dir, name) -> name.endsWith(".jpg"));
        if (files == null) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        long total = 0;
        for (File file : files) total += file.length();
        for (File file : files) {
            if (total <= 32L * 1024 * 1024) break;
            long length = file.length();
            if (!file.equals(current) && file.delete()) total -= length;
        }
    }

    private void continueScan(PluginCall call) {
        String[] aliases = Build.VERSION.SDK_INT >= 33 ? new String[]{"audio"} : new String[]{"legacy"};
        if (!hasAudioPermission()) {
            requestPermissionForAliases(aliases, call, "scanPermissionResult");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && call.getBoolean("includeVideo", false)
            && call.getBoolean("requestVideoPermission", true)
            && getPermissionState("video") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAliases(new String[]{"video"}, call, "videoPermissionResult");
            return;
        }
        performScan(call);
    }

    public boolean hasAudioPermission() {
        if (Build.VERSION.SDK_INT >= 33)
            return getPermissionState("audio") == com.getcapacitor.PermissionState.GRANTED;
        return getPermissionState("legacy") == com.getcapacitor.PermissionState.GRANTED;
    }

    @PermissionCallback
    private void scanPermissionResult(PluginCall call) {
        if (!hasAudioPermission()) {
            call.reject("دسترسی به موسیقی رد شد. دسترسی صدا را در تنظیمات اندروید فعال کنید.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && call.getBoolean("includeVideo", false)
            && call.getBoolean("requestVideoPermission", true)
            && getPermissionState("video") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAliases(new String[]{"video"}, call, "videoPermissionResult");
            return;
        }
        performScan(call);
    }

    @PermissionCallback
    private void videoPermissionResult(PluginCall call) {
        if (getPermissionState("video") != com.getcapacitor.PermissionState.GRANTED) {
            performScan(call);
            return;
        }
        performScan(call);
    }

    private void performScan(PluginCall call) {
        scanExecutor.execute(() -> {
            JSArray items = new JSArray();
            try {
                queryMedia(items, MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, "audio");
                if (call.getBoolean("includeVideo", false) && (Build.VERSION.SDK_INT < 33 ||
                    getPermissionState("video") == com.getcapacitor.PermissionState.GRANTED))
                    queryMedia(items, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video");
                JSObject result = new JSObject();
                result.put("items", items);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("اسکن رسانه‌ها ممکن نیست: " + e.getMessage());
            }
        });
    }

    @com.getcapacitor.PluginMethod
    public void consumeIncomingAudio(PluginCall call) {
        consumeIncomingMediaRequest(call);
    }

    @com.getcapacitor.PluginMethod
    public void consumeIncomingMedia(PluginCall call) {
        consumeIncomingMediaRequest(call);
    }

    private void consumeIncomingMediaRequest(PluginCall call) {
        MainActivity.IncomingAudioRequest request = MainActivity.consumeIncomingAudio();
        if (request == null || request.uri == null || request.uri.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("item", (Object) null);
            call.resolve(empty);
            return;
        }
        final Uri uri;
        try { uri = Uri.parse(request.uri); }
        catch (Exception error) { call.reject("نشانی فایل انتخاب‌شده معتبر نیست", error); return; }
        if (!"content".equalsIgnoreCase(uri.getScheme()) || uri.getAuthority() == null
            || uri.getQuery() != null || uri.getFragment() != null) {
            call.reject("فقط نشانی امن content:// برای فایل صوتی پذیرفته می‌شود.");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        final String mime;
        try { mime = resolver.getType(uri); }
        catch (SecurityException error) { call.reject("مجوز دسترسی به فایل انتخاب‌شده در دسترس نیست.", error); return; }
        boolean declaredAudio = request.mimeType != null
            && request.mimeType.toLowerCase(java.util.Locale.ROOT).startsWith("audio/");
        boolean declaredVideo = request.mimeType != null
            && request.mimeType.toLowerCase(java.util.Locale.ROOT).startsWith("video/");
        boolean resolvedAudio = mime != null && mime.toLowerCase(java.util.Locale.ROOT).startsWith("audio/");
        boolean resolvedVideo = mime != null && mime.toLowerCase(java.util.Locale.ROOT).startsWith("video/");
        boolean genericMime = mime == null || "application/octet-stream".equalsIgnoreCase(mime);
        final String mediaType = resolvedVideo || (declaredVideo && genericMime) ? "video" :
            resolvedAudio || (declaredAudio && genericMime) ? "audio" : "";
        if (mediaType.isEmpty()) {
            call.reject("نوع فایل انتخاب‌شده صوتی یا ویدئویی قابل‌شناسایی نیست.");
            return;
        }
        try {
            scanExecutor.execute(() -> {
                File partial = null;
                File imported = null;
                try {
                    String displayName = "";
                    long reportedSize = -1;
                    try (Cursor cursor = resolver.query(uri,
                        new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                        if (cursor != null && cursor.moveToFirst()) {
                            int nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                            int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
                            if (nameColumn >= 0 && !cursor.isNull(nameColumn)) displayName = cursor.getString(nameColumn);
                            if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) reportedSize = cursor.getLong(sizeColumn);
                        }
                    } catch (IllegalArgumentException ignored) {
                        // Some document providers expose a stream but no OpenableColumns metadata.
                    }
                    if (reportedSize > MAX_SHARED_MEDIA_BYTES) {
                        call.reject("فایل رسانه‌ای بزرگ‌تر از حد مجاز است.");
                        return;
                    }
                    String token = UUID.randomUUID().toString().replace("-", "");
                    String resolvedMime = resolvedAudio || resolvedVideo ? mime : request.mimeType;
                    String extension = sharedMediaExtension(displayName, resolvedMime, mediaType);
                    String id = "shared-" + ("video".equals(mediaType) ? "video-" : "") + token;
                    File directory = new File(getContext().getFilesDir(), "shared-" + mediaType);
                    if (!directory.isDirectory() && !directory.mkdirs())
                        throw new IOException("Unable to create private audio directory");
                    partial = new File(directory, token + ".partial");
                    imported = new File(directory, token + "." + extension);
                    long copied = 0;
                    try (InputStream input = resolver.openInputStream(uri);
                         FileOutputStream output = new FileOutputStream(partial)) {
                        if (input == null) throw new IOException("Selected document has no readable stream");
                        byte[] buffer = new byte[64 * 1024];
                        int count;
                        while ((count = input.read(buffer)) != -1) {
                            copied += count;
                            if (copied > MAX_SHARED_MEDIA_BYTES)
                                throw new IOException("Selected media exceeds the import limit");
                            output.write(buffer, 0, count);
                        }
                        if (copied == 0) throw new IOException("Selected audio is empty");
                        output.flush();
                        output.getFD().sync();
                    }
                    if (!partial.renameTo(imported)) throw new IOException("Unable to finalize private audio copy");
                    Uri playbackUri = FileProvider.getUriForFile(getContext(),
                        getContext().getPackageName() + ".fileprovider", imported);
                    String playbackUriString = playbackUri.toString();
                    if (!RecoveryPolicy.mediaUri(id, playbackUriString, mediaType))
                        throw new IOException("Private media URI failed validation");
                    String fileName = displayName == null || displayName.trim().isEmpty()
                        ? ("video".equals(mediaType) ? "Shared video." : "Shared audio.") + extension : displayName.trim();
                    String title = titleFromFileName(fileName);
                    JSObject item = new JSObject();
                    item.put("id", id);
                    item.put("fileName", fileName);
                    item.put("title", title);
                    item.put("duration", 0);
                    item.put("artist", "");
                    item.put("album", "");
                    item.put("folder", "");
                    item.put("uri", playbackUriString);
                    item.put("type", mediaType);
                    item.put("sizeBytes", copied);
                    item.put("artworkKey", id + "-" + copied);
                    JSObject result = new JSObject();
                    result.put("item", item);
                    call.resolve(result);
                } catch (SecurityException error) {
                    call.reject("مجوز خواندن فایل انتخاب‌شده در دسترس نیست.", error);
                } catch (Exception error) {
                    if (partial != null) partial.delete();
                    if (imported != null) imported.delete();
                    call.reject("بازکردن فایل انتخاب‌شده ممکن نیست: " + messageOf(error), error);
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException error) {
            call.reject("برنامه در حال بسته‌شدن است؛ فایل صوتی را دوباره انتخاب کنید.", error);
        }
    }

    private static final long MAX_SHARED_MEDIA_BYTES = 1024L * 1024L * 1024L;

    private static String sharedMediaExtension(String displayName, String mimeType, String type) {
        if (displayName != null) {
            int dot = displayName.lastIndexOf('.');
            if (dot >= 0 && dot + 1 < displayName.length()) {
                String candidate = displayName.substring(dot + 1).toLowerCase(java.util.Locale.ROOT);
                if (candidate.matches("[a-z0-9]{1,8}")) return candidate;
            }
        }
        String mime = mimeType == null ? "" : mimeType.toLowerCase(java.util.Locale.ROOT);
        if ("video".equals(type)) {
            if (mime.equals("video/mp4") || mime.equals("video/m4v")) return "mp4";
            if (mime.equals("video/webm")) return "webm";
            if (mime.equals("video/3gpp") || mime.equals("video/3gpp2")) return "3gp";
            if (mime.equals("video/quicktime")) return "mov";
            if (mime.equals("video/x-matroska")) return "mkv";
            if (mime.equals("video/x-msvideo")) return "avi";
            if (mime.equals("video/mp2t")) return "ts";
            if (mime.equals("video/x-flv")) return "flv";
            return "bin";
        }
        if (mime.equals("audio/mpeg")) return "mp3";
        if (mime.equals("audio/mp4") || mime.equals("audio/x-m4a")) return "m4a";
        if (mime.equals("audio/aac")) return "aac";
        if (mime.equals("audio/ogg")) return "ogg";
        if (mime.equals("audio/opus")) return "opus";
        if (mime.equals("audio/wav") || mime.equals("audio/x-wav")) return "wav";
        if (mime.equals("audio/flac") || mime.equals("audio/x-flac")) return "flac";
        if (mime.equals("audio/amr")) return "amr";
        if (mime.equals("audio/3gpp")) return "3gp";
        if (mime.equals("audio/x-ms-wma")) return "wma";
        return "bin";
    }

    private static String titleFromFileName(String fileName) {
        String title = fileName == null ? "" : fileName.trim();
        int dot = title.lastIndexOf('.');
        if (dot > 0) title = title.substring(0, dot);
        return title.isEmpty() ? "Shared audio" : title;
    }

    @com.getcapacitor.PluginMethod
    public void lyrics(PluginCall call) {
        String uri = call.getString("uri", "");
        if (!uri.matches("content://media/(?:external|external_primary)/audio/media/[1-9][0-9]*")
            && !uri.matches("content://com\\.adelapp\\.larkplayer\\.fileprovider/shared-audio/[0-9a-f]{32}\\.[A-Za-z0-9]{1,8}")) {
            call.reject("نشانی آهنگ معتبر نیست."); return;
        }
        try {
            scanExecutor.execute(() -> {
                try (java.io.InputStream stream = getContext().getContentResolver().openInputStream(Uri.parse(uri));
                     java.io.InputStream syncedStream = getContext().getContentResolver().openInputStream(Uri.parse(uri))) {
                    JSObject result = new JSObject();
                    result.put("text", EmbeddedLyrics.read(stream));
                    result.put("syncedText", EmbeddedLyrics.readSynced(syncedStream));
                    call.resolve(result);
                } catch (Exception error) { call.reject("خواندن متن داخل فایل ممکن نشد.", error); }
            });
        } catch (java.util.concurrent.RejectedExecutionException error) {
            call.reject("خواندن متن متوقف شد؛ دوباره تلاش کنید.", error);
        }
    }

    private void queryMedia(JSArray items, Uri collection, String type) throws JSONException {
        String folderColumn = Build.VERSION.SDK_INT >= 29
            ? MediaStore.MediaColumns.RELATIVE_PATH : MediaStore.MediaColumns.DATA;
        String[] columns = type.equals("audio")
            ? new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.TITLE, MediaStore.Audio.Media.DURATION,
                folderColumn, MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM, MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_ADDED}
            : new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.TITLE, MediaStore.Video.Media.DURATION, folderColumn, MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_ADDED};
        String selection = type.equals("audio") ? MediaStore.Audio.Media.IS_MUSIC + " != 0" : null;
        try (Cursor cursor = getContext().getContentResolver().query(collection, columns, selection, null,
            MediaStore.MediaColumns.DATE_ADDED + " DESC")) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                long id = cursor.getLong(0);
                String name = cursor.getString(1);
                String title = cursor.getString(2);
                JSObject item = new JSObject();
                item.put("id", type + "-" + id);
                item.put("fileName", name == null ? "" : name);
                item.put("title", title == null || title.isEmpty() ? name : title);
                item.put("duration", cursor.getLong(3) / 1000.0);
                item.put("folder", cursor.getString(4) == null ? "" : cursor.getString(4));
                item.put("artist", type.equals("audio") && cursor.getString(5) != null ? cursor.getString(5) : "");
                item.put("album", type.equals("audio") && cursor.getString(6) != null ? cursor.getString(6) : "");
                item.put("uri", ContentUris.withAppendedId(collection, id).toString());
                item.put("type", type);
                int modifiedIndex = type.equals("audio") ? 7 : 5;
                if (!cursor.isNull(modifiedIndex + 1)) item.put("sizeBytes", cursor.getLong(modifiedIndex + 1));
                item.put("artworkKey", type + "-" + id + "-" + cursor.getLong(modifiedIndex) + "-" + cursor.getLong(modifiedIndex + 1));
                // Read only: never alter file dates or embedded song metadata.
                item.put("addedAt", cursor.getLong(modifiedIndex + 2) * 1000L);
                items.put(item);
            }
        }
    }

    @com.getcapacitor.PluginMethod
    public void openVideo(PluginCall call) {
        String id = call.getString("id", "");
        String uri = call.getString("uri", "");
        if (id.isEmpty() || uri.isEmpty()) {
            JSArray legacyItems = call.getArray("items");
            if (legacyItems != null && legacyItems.length() > 0) {
                int index = Math.max(0, Math.min(call.getInt("index", 0), legacyItems.length() - 1));
                try {
                    JSONObject selected = legacyItems.getJSONObject(index);
                    id = selected.optString("id", "");
                    uri = selected.optString("uri", "");
                } catch (JSONException error) {
                    call.reject("اطلاعات ویدئو نامعتبر است", error);
                    return;
                }
            }
        }
        if (!RecoveryPolicy.mediaUri(id, uri, "video")) { call.reject("نشانی ویدئو معتبر نیست"); return; }
        Intent intent = new Intent(getActivity(), RitmoVideoActivity.class);
        intent.putExtra("videoId", id);
        intent.putExtra("videoUri", uri);
        intent.putExtra("videoTitle", call.getString("title", ""));
        getActivity().startActivity(intent);
        call.resolve();
    }

    @com.getcapacitor.PluginMethod
    public void analyze(PluginCall call) {
        String uri = call.getString("uri", "");
        if (uri.isEmpty()) { call.reject("نشانی رسانه وارد نشده است"); return; }
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(getContext(), Uri.parse(uri));
            String duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            String mime = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE);
            JSObject result = new JSObject();
            result.put("duration", duration == null ? 0 : Long.parseLong(duration) / 1000.0);
            result.put("mimeType", mime == null ? "" : mime);
            result.put("loudness", 0);
            result.put("suggestedPreset", "flat");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("تحلیل آفلاین ناموفق بود", error);
        } finally {
            try {
                retriever.release();
            } catch (IOException ignored) {
                // Releasing metadata resources is best-effort and does not change playback behavior.
            }
        }
    }

    @com.getcapacitor.PluginMethod
    public void saveBookmark(PluginCall call) {
        String id = call.getString("id", "");
        if (id.isEmpty() || id.length() > 4096 || id.chars().anyMatch(c -> c < 32)) { call.reject("شناسه رسانه نامعتبر است"); return; }
        final long position;
        try { position = RecoveryPolicy.milliseconds(call.getData().opt("position")); }
        catch (IllegalArgumentException error) { call.reject("موقعیت رسانه نامعتبر است"); return; }
        if (position < 0 || position > 9007199254740991L) { call.reject("موقعیت رسانه نامعتبر است"); return; }
        if (!getContext().getSharedPreferences("ritmo_bookmarks", android.content.Context.MODE_PRIVATE)
            .edit().putLong(id, position).commit()) { call.reject("ذخیره بوکمارک انجام نشد."); return; }
        call.resolve();
    }

    @com.getcapacitor.PluginMethod
    public void setPlaybackMode(PluginCall call) {
        String mode = call.getString("mode", "focus");
        if (!Arrays.asList("focus", "sleep", "workout").contains(mode)) { call.reject("حالت پخش نامعتبر است"); return; }
        if (!getContext().getSharedPreferences("ritmo_playback", android.content.Context.MODE_PRIVATE)
            .edit().putString("mode", mode).commit()) { call.reject("ذخیره حالت پخش انجام نشد."); return; }
        JSObject result = new JSObject();
        result.put("mode", mode);
        call.resolve(result);
    }

    @com.getcapacitor.PluginMethod
    public void play(PluginCall call) {
        performPlay(call);
    }

    private void performPlay(PluginCall call) {
        withController(call, controller -> {
            try {
                JSArray json = call.getArray("items");
                if (json == null || json.length() == 0) { call.reject("رسانه‌ای برای پخش وجود ندارد"); return; }
                List<MediaItem> media = new ArrayList<>();
                for (int i = 0; i < json.length(); i++) {
                    JSONObject row = json.getJSONObject(i);
                    if (!RecoveryPolicy.mediaUri(row.getString("id"), row.getString("uri"), "audio"))
                        throw new IllegalArgumentException("نشانی آهنگ معتبر نیست.");
                    android.os.Bundle extras = new android.os.Bundle();
                    extras.putString("ritmo_uri", row.getString("uri"));
                    MediaMetadata metadata = new MediaMetadata.Builder()
                        .setTitle(row.optString("title"))
                        .setArtist(row.optString("artist"))
                        .setExtras(extras)
                        .setArtworkUri(Uri.parse(row.getString("uri")))
                        .build();
                    media.add(new MediaItem.Builder().setMediaId(row.getString("id"))
                        .setUri(row.getString("uri")).setMediaMetadata(metadata).build());
                }
                int index = Math.max(0, Math.min(call.getInt("index", 0), media.size() - 1));
                long position = RecoveryPolicy.milliseconds(call.getData().opt("position"));
                if (!RitmoPlaybackService.persistQueue(getContext(), media))
                    throw new IllegalStateException("ذخیره صف پخش انجام نشد؛ صف قبلی حفظ شد.");
                controller.setMediaItems(media, index, position);
                controller.prepare();
                controller.play();
                call.resolve();
            } catch (Exception e) { call.reject("رسانه نامعتبر است", e); }
        });
    }

    @com.getcapacitor.PluginMethod
    public void setEqualizer(PluginCall call) {
        JSArray values = call.getArray("gains");
        if (values == null || values.length() != 10) {
            call.reject("اکولایزر باید دقیقاً ۱۰ باند داشته باشد");
            return;
        }
        final int[] gains = new int[10];
        try {
            for (int i = 0; i < gains.length; i++) {
                gains[i] = values.getInt(i);
                if (gains[i] < -12 || gains[i] > 12) {
                    call.reject("مقدار باند اکولایزر باید بین ‎−12 و ‎+12 باشد");
                    return;
                }
            }
        } catch (JSONException error) {
            call.reject("مقادیر اکولایزر نامعتبر هستند", error);
            return;
        }
        withController(call, controller -> {
            RitmoPlaybackService.applyEqualizer(gains);
            call.resolve();
        });
    }

    @com.getcapacitor.PluginMethod
    public void control(PluginCall call) {
        withController(call, controller -> {
            String action = call.getString("action", "");
            int value = "seek".equals(action) ? 0 : call.getInt("value", 0);
            switch (action) {
                case "play":
                    if (controller.getPlaybackState() == Player.STATE_IDLE && controller.getMediaItemCount() > 0) controller.prepare();
                    controller.play();
                    break;
                case "pause": controller.pause(); break;
                case "stop": controller.stop(); break;
                case "next":
                    if (!controller.hasNextMediaItem()) { controller.pause(); break; }
                    controller.seekToNextMediaItem();
                    if (controller.getPlaybackState() == Player.STATE_IDLE && controller.getMediaItemCount() > 0) controller.prepare();
                    controller.play();
                    break;
                case "previous":
                    if (!controller.hasPreviousMediaItem()) { controller.seekTo(0); break; }
                    controller.seekToPreviousMediaItem();
                    if (controller.getPlaybackState() == Player.STATE_IDLE && controller.getMediaItemCount() > 0) controller.prepare();
                    controller.play();
                    break;
                case "seek":
                    final long seekPosition;
                    try { seekPosition = RecoveryPolicy.milliseconds(call.getData().opt("value")); }
                    catch (IllegalArgumentException error) { call.reject("موقعیت رسانه نامعتبر است"); return; }
                    controller.seekTo(RecoveryPolicy.position(seekPosition, true, controller.getDuration()));
                    break;
                case "volume": controller.setVolume(Math.max(0f, Math.min(1f, value / 1000f))); break;
                case "mute": controller.setVolume(0f); break;
                case "speed": controller.setPlaybackSpeed(Math.max(0.5f, Math.min(2f, value / 100f))); break;
                case "mode":
                    if (value < 0 || value > 3) { call.reject("حالت پخش نامعتبر است"); return; }
                    controller.setShuffleModeEnabled(value == 1);
                    controller.setRepeatMode(value == 2 ? Player.REPEAT_MODE_ONE : value == 3 ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF);
                    break;
                case "shuffle": controller.setShuffleModeEnabled(value != 0); break;
                case "repeat":
                    if (value < 0 || value > 2) { call.reject("حالت تکرار نامعتبر است"); return; }
                    controller.setRepeatMode(value); break;
                default: call.reject("عملیات پخش ناشناخته است"); return;
            }
            if (!RitmoPlaybackService.persistControllerState(getContext(), controller)) {
                call.reject("ذخیره وضعیت پخش انجام نشد؛ تغییر فقط در حافظه است."); return;
            }
            call.resolve();
        });
    }

    @com.getcapacitor.PluginMethod
    public void modifyQueue(PluginCall call) {
        withController(call, controller -> {
            String action = call.getString("action", "");
            String id = call.getString("id", "");
            List<MediaItem> candidate = new ArrayList<>();
            for (int i = 0; i < controller.getMediaItemCount(); i++) candidate.add(controller.getMediaItemAt(i));
            Runnable mutation;
            if ("clear".equals(action)) {
                candidate.clear();
                mutation = () -> controller.clearMediaItems();
            } else if ("select".equals(action)) {
                int index = call.getInt("index", -1);
                if (index < 0 || index >= controller.getMediaItemCount()) { call.reject("موقعیت صف نامعتبر است"); return; }
                mutation = () -> { controller.seekTo(index, 0); controller.prepare(); controller.play(); };
            } else if ("addMany".equals(action)) {
                JSArray entries = call.getArray("items");
                if (entries == null || entries.length() == 0) { call.reject("آهنگی انتخاب نشده است"); return; }
                List<MediaItem> additions = new ArrayList<>();
                try {
                    for (int i = 0; i < entries.length(); i++) {
                        JSONObject row = entries.getJSONObject(i);
                        String uri = row.getString("uri");
                        String itemId = row.getString("id");
                        if (!RecoveryPolicy.mediaUri(itemId, uri, "audio")) {
                            call.reject("آهنگ انتخاب‌شده نامعتبر است"); return;
                        }
                        android.os.Bundle extras = new android.os.Bundle();
                        extras.putString("ritmo_uri", uri);
                        additions.add(new MediaItem.Builder().setMediaId(itemId).setUri(uri)
                            .setMediaMetadata(new MediaMetadata.Builder().setTitle(row.optString("title"))
                                .setArtist(row.optString("artist")).setExtras(extras).setArtworkUri(Uri.parse(uri)).build()).build());
                    }
                    candidate.addAll(additions);
                    mutation = () -> controller.addMediaItems(additions);
                } catch (JSONException error) { call.reject("آهنگ انتخاب‌شده نامعتبر است", error); return; }
            } else if ("reorder".equals(action)) {
                JSArray order = call.getArray("order"), expected = call.getArray("expected");
                if (order == null || expected == null || order.length() != candidate.size() || expected.length() != candidate.size()) {
                    call.reject("صف پخش تغییر کرده است؛ دوباره تلاش کنید."); return;
                }
                List<MediaItem> reordered = new ArrayList<>();
                boolean[] used = new boolean[candidate.size()];
                try {
                    for (int i = 0; i < candidate.size(); i++) {
                        if (!candidate.get(i).mediaId.equals(expected.getString(i)))
                            throw new IllegalArgumentException("stale queue");
                        String wanted = order.getString(i);
                        MediaItem found = null;
                        for (int from = 0; from < candidate.size(); from++) {
                            if (!used[from] && candidate.get(from).mediaId.equals(wanted)) {
                                found = candidate.get(from); used[from] = true; break;
                            }
                        }
                        if (found == null) throw new IllegalArgumentException("missing item");
                        reordered.add(found);
                    }
                } catch (Exception error) { call.reject("ترتیب صف معتبر نیست یا تغییر کرده است؛ دوباره تلاش کنید."); return; }
                candidate = reordered;
                final List<MediaItem> desired = reordered;
                mutation = () -> {
                    // Move existing items instead of reloading them: keep identity, position,
                    // playWhenReady, playback speed, shuffle and repeat untouched.
                    for (int to = 0; to < desired.size(); to++) {
                        String wanted = desired.get(to).mediaId;
                        for (int from = to; from < controller.getMediaItemCount(); from++) {
                            if (controller.getMediaItemAt(from).mediaId.equals(wanted)) {
                                if (from != to) controller.moveMediaItem(from, to);
                                break;
                            }
                        }
                    }
                };
            } else if ("move".equals(action)) {
                int from = call.getInt("from", -1);
                int to = call.getInt("to", -1);
                if (from < 0 || to < 0 || from >= controller.getMediaItemCount()
                    || to >= controller.getMediaItemCount()) {
                    call.reject("موقعیت صف پخش نامعتبر است");
                    return;
                }
                candidate.add(to, candidate.remove(from));
                mutation = () -> controller.moveMediaItem(from, to);
            } else if ("remove".equals(action)) {
                int index = call.getInt("from", -1);
                if (index >= 0) {
                    if (index >= controller.getMediaItemCount() || !id.equals(controller.getMediaItemAt(index).mediaId)) {
                        call.reject("موقعیت صف تغییر کرده است؛ دوباره تلاش کنید"); return;
                    }
                    candidate.remove(index);
                    mutation = () -> controller.removeMediaItem(index);
                } else {
                    List<Integer> removals = new ArrayList<>();
                    for (int i = controller.getMediaItemCount() - 1; i >= 0; i--)
                        if (id.equals(controller.getMediaItemAt(i).mediaId)
                            && i != controller.getCurrentMediaItemIndex()) { candidate.remove(i); removals.add(i); }
                    mutation = () -> { for (int removalIndex : removals) controller.removeMediaItem(removalIndex); };
                }
            } else {
                String uri = call.getString("uri", "");
                if (!RecoveryPolicy.mediaUri(id, uri, "audio")) { call.reject("نشانی رسانه معتبر نیست"); return; }
                android.os.Bundle extras = new android.os.Bundle();
                extras.putString("ritmo_uri", uri);
                MediaItem item = new MediaItem.Builder().setMediaId(id).setUri(uri)
                    .setMediaMetadata(new MediaMetadata.Builder()
                        .setTitle(call.getString("title", "")).setArtist(call.getString("artist", "")).setExtras(extras).setArtworkUri(Uri.parse(uri)).build())
                    .build();
                if ("next".equals(action)) {
                    int insertion = Math.max(0, controller.getCurrentMediaItemIndex() + 1);
                    candidate.add(insertion, item);
                    mutation = () -> controller.addMediaItem(insertion, item);
                } else if ("add".equals(action)) {
                    candidate.add(item);
                    mutation = () -> controller.addMediaItem(item);
                }
                else { call.reject("عملیات صف پخش ناشناخته است"); return; }
            }
            // Save a complete candidate before issuing any live queue command.
            // Quota/I/O/URI failures leave both the live and durable queues untouched.
            if (!RitmoPlaybackService.persistQueue(getContext(), candidate)) {
                call.reject("ذخیره صف پخش انجام نشد؛ صف جاری تغییر نکرد."); return;
            }
            mutation.run();
            if (!RitmoPlaybackService.persistPlaybackSettings(getContext(), controller)) {
                call.reject("صف تغییر کرد، اما ذخیره تنظیمات پخش انجام نشد."); return;
            }
            call.resolve();
        });
    }

    @com.getcapacitor.PluginMethod
    public void state(PluginCall call) {
        withController(call, controller -> {
            call.resolve(currentState(controller));
        });
    }

    private JSObject currentState(MediaController controller) {
        JSObject state = new JSObject();
        MediaItem item = controller.getCurrentMediaItem();
        state.put("id", item == null ? "" : item.mediaId);
        state.put("playing", controller.isPlaying());
        AudioAnalysisProcessor analysis = RitmoPlaybackService.activeAnalysis;
        if (analysis != null) state.put("analysisGeneration", analysis.generation());
        state.put("position", controller.getCurrentPosition() / 1000.0);
        state.put("duration", Math.max(0, controller.getDuration()) / 1000.0);
        state.put("volume", controller.getVolume());
        state.put("speed", controller.getPlaybackParameters().speed);
        state.put("shuffle", controller.getShuffleModeEnabled());
        state.put("queueIndex", controller.getCurrentMediaItemIndex());
        state.put("repeat", controller.getRepeatMode());
        state.put("error", playbackError.isEmpty() ? RitmoPlaybackService.foregroundError : playbackError);
        JSArray queue = new JSArray();
        for (int i = 0; i < controller.getMediaItemCount(); i++)
            queue.put(controller.getMediaItemAt(i).mediaId);
        state.put("queue", queue);
        return state;
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        analysisRequested = false; restartAnalysis();
        if (pendingDelete != null) {
            pendingDelete.reject("درخواست حذف با بسته‌شدن برنامه متوقف شد");
            pendingDelete = null;
        }
        if (deleteLauncher != null) deleteLauncher.unregister();
        if (controllerHandler != null) {
            controllerHandler.post(() -> {
                if (controllerFuture != null) MediaController.releaseFuture(controllerFuture);
                controller = null;
            });
        }
        if (controllerThread != null) controllerThread.quitSafely();
        scanExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
