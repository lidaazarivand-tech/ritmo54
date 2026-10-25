package com.adelapp.larkplayer;

import org.junit.Test;
import static org.junit.Assert.*;

public class RecoveryPolicyTest {
    @Test public void expirationNeverOverflowsIntoPrematureDeletion() {
        assertEquals(Long.MAX_VALUE, RecoveryPolicy.expiresAt(Long.MAX_VALUE, 90));
        assertEquals(604801000L, RecoveryPolicy.expiresAt(1000, 7));
    }
    @Test public void missingCurrentTrackAndInvalidPositionStartAtZero() {
        assertEquals(0, RecoveryPolicy.position(5000, false, 10000));
        assertEquals(0, RecoveryPolicy.position(-1, true, 10000));
        assertEquals(10000, RecoveryPolicy.position(20000, true, 10000));
    }
    @Test public void mediaUrisAreBoundToTheExpectedIdAndType() {
        assertTrue(RecoveryPolicy.mediaUri("audio-42", "content://media/external/audio/media/42", "audio"));
        assertFalse(RecoveryPolicy.mediaUri("audio-43", "content://media/external/audio/media/42", "audio"));
        assertFalse(RecoveryPolicy.mediaUri("audio-42", "file:///sdcard/Music/song.mp3", "audio"));
        assertFalse(RecoveryPolicy.mediaUri("audio-42", "content://media/external/audio/media/42?x=1", "audio"));
    }
    @Test public void importedDocumentsAreBoundToAnAppOwnedPrivateFileProviderUri() {
        String id = "shared-0123456789abcdef0123456789abcdef";
        String uri = "content://com.adelapp.larkplayer.fileprovider/shared-audio/0123456789abcdef0123456789abcdef.mp3";
        assertTrue(RecoveryPolicy.mediaUri(id, uri, "audio"));
        assertFalse(RecoveryPolicy.mediaUri(id, "content://documents.example/document/abc", "audio"));
        assertFalse(RecoveryPolicy.mediaUri(id, "content://com.adelapp.larkplayer.fileprovider/shared-audio/other.mp3", "audio"));
        assertFalse(RecoveryPolicy.mediaUri(id, uri + "?query=1", "audio"));
        assertFalse(RecoveryPolicy.mediaUri(id, uri, "video"));
        assertFalse(RecoveryPolicy.mediaUri(id, "file:///sdcard/Music/song.mp3", "audio"));
    }
    @Test public void importedVideosUseTheirOwnValidatedPrivateProviderPath() {
        String id = "shared-video-0123456789abcdef0123456789abcdef";
        String uri = "content://com.adelapp.larkplayer.fileprovider/shared-video/0123456789abcdef0123456789abcdef.mp4";
        assertTrue(RecoveryPolicy.mediaUri(id, uri, "video"));
        assertFalse(RecoveryPolicy.mediaUri(id, uri, "audio"));
        assertFalse(RecoveryPolicy.mediaUri(id, uri.replace("shared-video", "shared-audio"), "video"));
        assertFalse(RecoveryPolicy.mediaUri(id, uri.replace("0123456789abcdef0123456789abcdef", "other"), "video"));
    }
}
