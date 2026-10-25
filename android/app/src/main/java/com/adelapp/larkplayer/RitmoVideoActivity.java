package com.adelapp.larkplayer;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.content.res.Configuration;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

public class RitmoVideoActivity extends Activity {
    private ExoPlayer player;
    private PlayerView playerView;
    private String videoId;
    private String videoUri;
    private boolean errorDialogShowing;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        playerView = new PlayerView(this);
        playerView.setUseController(true);
        // Visual theme only: retain the existing Media3 controller and playback.
        playerView.setBackgroundColor(0xFF080B11);
        playerView.setShutterBackgroundColor(0xFF080B11);
        View progress = playerView.findViewById(androidx.media3.ui.R.id.exo_progress);
        if (progress instanceof androidx.media3.ui.DefaultTimeBar) {
            androidx.media3.ui.DefaultTimeBar timeBar = (androidx.media3.ui.DefaultTimeBar) progress;
            timeBar.setPlayedColor(0xFF398FCB);
            timeBar.setScrubberColor(0xFF56A9DF);
            timeBar.setBufferedColor(0xFF344352);
            timeBar.setUnplayedColor(0xFF273442);
        }
        setContentView(playerView);
        videoId = getIntent().getStringExtra("videoId");
        videoUri = getIntent().getStringExtra("videoUri");
        try {
            initializePlayer();
        } catch (Exception error) {
            showPlaybackError(error);
        }
    }

    private void initializePlayer() {
        if (!RecoveryPolicy.mediaUri(videoId, videoUri, "video")) {
            throw new IllegalArgumentException("Missing video information");
        }
        if (player != null) {
            player.release();
        }
        player = new ExoPlayer.Builder(this)
            .setHandleAudioBecomingNoisy(true)
            .build();
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build(), true);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException error) {
                showPlaybackError(error);
            }
        });
        playerView.setPlayer(player);
        long position = RecoveryPolicy.position(getPreferences(MODE_PRIVATE).getLong(videoId, 0L), true, 0);
        MediaItem item = new MediaItem.Builder()
            .setMediaId(videoId)
            .setUri(Uri.parse(videoUri))
            .build();
        player.setMediaItem(item, position);
        player.prepare();
        player.play();
    }

    private void showPlaybackError(Exception error) {
        Log.e("RitmoVideoActivity", "Video playback failed", error);
        if (isFinishing() || errorDialogShowing) return;
        errorDialogShowing = true;
        String message = error instanceof PlaybackException
            && (((PlaybackException) error).errorCode == PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED
                || ((PlaybackException) error).errorCode == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED)
            ? "کدک صوتی یا تصویری این فایل در دستگاه پشتیبانی نمی‌شود. MP4 یا فایل دیگری را امتحان کنید."
            : "این ویدئو قابل پخش نیست یا فایل آن آسیب دیده است.";
        new AlertDialog.Builder(this)
            .setTitle("خطای پخش ویدئو")
            .setMessage(message)
            .setNegativeButton("بستن", (dialog, which) -> finish())
            .setPositiveButton("تلاش دوباره", (dialog, which) -> {
                errorDialogShowing = false;
                try {
                    initializePlayer();
                } catch (Exception retryError) {
                    showPlaybackError(retryError);
                }
            })
            .setOnDismissListener(dialog -> errorDialogShowing = false)
            .show();
    }

    @Override
    protected void onStop() {
        if (player != null) {
            MediaItem current = player.getCurrentMediaItem();
            if (current != null) getPreferences(MODE_PRIVATE).edit()
                .putLong(current.mediaId, player.getCurrentPosition()).apply();
            if (android.os.Build.VERSION.SDK_INT < 26 || !isInPictureInPictureMode()) player.pause();
        }
        super.onStop();
    }

    @Override
    public void onUserLeaveHint() {
        if (android.os.Build.VERSION.SDK_INT >= 26 && player != null && player.isPlaying()) {
            enterPictureInPictureMode(new android.app.PictureInPictureParams.Builder().build());
        }
        super.onUserLeaveHint();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        // Entering/leaving PiP must not override the user's current play/pause state.
    }

    @Override
    protected void onDestroy() {
        if (player != null) player.release();
        super.onDestroy();
    }
}
