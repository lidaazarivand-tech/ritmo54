package com.adelapp.larkplayer;

import android.os.Bundle;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.WebSettings;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final Object incomingAudioLock = new Object();
    private static IncomingAudioRequest pendingIncomingAudio;

    static final class IncomingAudioRequest {
        final String uri;
        final String mimeType;
        IncomingAudioRequest(String uri, String mimeType) {
            this.uri = uri;
            this.mimeType = mimeType;
        }
    }

    private void captureIncomingAudio(Intent intent) {
        synchronized (incomingAudioLock) { pendingIncomingAudio = null; }
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        String type = intent.getType();
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())) return;
        if (type == null || type.isEmpty() || "application/octet-stream".equalsIgnoreCase(type)) {
            String resolved = null;
            try { resolved = getContentResolver().getType(uri); } catch (SecurityException ignored) { /* Use declared MIME or filename. */ }
            if (resolved != null && !resolved.isEmpty() && !"application/octet-stream".equalsIgnoreCase(resolved)) type = resolved;
            else if (type == null || type.isEmpty()) type = mimeFromFileName(uri);
        }
        if (type == null || "application/octet-stream".equalsIgnoreCase(type)) {
            String fromName = mimeFromFileName(uri);
            if (fromName != null) type = fromName;
        }
        if (type == null || !(type.toLowerCase(java.util.Locale.ROOT).startsWith("audio/")
            || type.toLowerCase(java.util.Locale.ROOT).startsWith("video/"))) return;
        // Accept the read grant while it is attached to this Activity, then the
        // native plugin copies the document into app-private storage for playback.
        synchronized (incomingAudioLock) { pendingIncomingAudio = new IncomingAudioRequest(uri.toString(), type); }
    }

    private String mimeFromFileName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return null;
            int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
            if (index < 0 || cursor.isNull(index)) return null;
            String name = cursor.getString(index);
            int dot = name == null ? -1 : name.lastIndexOf('.');
            if (dot < 0 || dot == name.length() - 1) return null;
            String extension = name.substring(dot + 1).toLowerCase(java.util.Locale.ROOT);
            if (java.util.Arrays.asList("mp4", "m4v", "mkv", "avi", "mov", "webm", "3gp", "ts", "flv").contains(extension))
                return "video/" + extension;
            if (java.util.Arrays.asList("mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "amr", "wma").contains(extension))
                return "audio/" + extension;
        } catch (SecurityException ignored) { /* A missing read grant is reported by the import step. */ }
        return null;
    }

    static IncomingAudioRequest consumeIncomingAudio() {
        synchronized (incomingAudioLock) {
            IncomingAudioRequest request = pendingIncomingAudio;
            pendingIncomingAudio = null;
            return request;
        }
    }

    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureIncomingAudio(intent);
    }
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeMediaPlugin.class);
        registerPlugin(SettingsBackupPlugin.class);
        super.onCreate(savedInstanceState);
        captureIncomingAudio(getIntent());
        // SDK 36 enforces edge-to-edge. Apply system-bar insets once to the WebView host.
        // The activity's adjustResize handles the IME; never add the IME height again as padding.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View host = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(host, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()
                | WindowInsetsCompat.Type.displayCutout());
            // adjustResize already shrinks the content bounds for the IME. Adding the
            // keyboard inset as padding here double-counts its height and leaves a
            // large dead viewport above the keyboard (notably behind modal dialogs).
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(host);
        if (bridge != null && bridge.getWebView() != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
