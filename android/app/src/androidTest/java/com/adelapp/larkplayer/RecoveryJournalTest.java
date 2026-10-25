package com.adelapp.larkplayer;

import android.content.Context;
import android.content.ContextWrapper;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.junit.Assert.*;

/** Real AtomicFile/private-file recovery tests. No user media is created/deleted. */
public class RecoveryJournalTest {
    private File root;
    private File directory;
    private String token;
    private RecentlyDeletedStore store;
    @Before public void setup() throws Exception {
        Context base = InstrumentationRegistry.getInstrumentation().getTargetContext();
        root = new File(base.getCacheDir(), "ritmo-test-" + UUID.randomUUID());
        assertTrue(root.mkdirs());
        Context isolated = new ContextWrapper(base) {
            @Override public File getNoBackupFilesDir() { return root; }
        };
        store = new RecentlyDeletedStore(isolated);
        directory = new File(root, "recently-deleted");
        token = UUID.randomUUID().toString();
    }
    private void write(String status, long date) throws Exception {
        JSONObject entry = new JSONObject().put("token", token).put("id", "audio-42")
            .put("uri", "content://media/external/audio/media/42").put("status", status)
            .put("date", date).put("size", 3).put("sha256", new String(new char[64]).replace('\0', '0'));
        JSONObject root = new JSONObject().put("days", 30).put("items", new JSONObject().put(token, entry));
        try (FileOutputStream out = new FileOutputStream(new File(directory, "journal.json"))) {
            out.write(root.toString().getBytes(StandardCharsets.UTF_8)); out.getFD().sync();
        }
    }
    @Test public void interruptedPermanentRemovalCompletesIdempotently() throws Exception {
        write("purging", System.currentTimeMillis());
        try (FileOutputStream out = new FileOutputStream(new File(directory, token + ".media"))) {
            out.write(new byte[]{1, 2, 3});
        }
        assertEquals(0, store.list(false).getJSONArray("items").length());
        assertFalse(new File(directory, token + ".media").exists());
        assertEquals(0, store.list(false).getJSONArray("items").length());
    }
    @Test public void overflowDateCannotPrematurelyPurgeBackup() throws Exception {
        write("deleted", Long.MAX_VALUE);
        try (FileOutputStream out = new FileOutputStream(new File(directory, token + ".media"))) {
            out.write(new byte[]{1, 2, 3});
        }
        assertEquals(Long.MAX_VALUE, store.list(true).getJSONArray("items").getJSONObject(0).getLong("expiresAt"));
        assertTrue(new File(directory, token + ".media").exists());
    }
    @Test public void missingBackupNeverClaimsRecovery() throws Exception {
        write("deleted", System.currentTimeMillis());
        assertFalse(store.list(false).getJSONArray("items").getJSONObject(0).getBoolean("recoverable"));
    }
    @Test public void corruptJournalIsRetainedWithoutDeletingBackup() throws Exception {
        File journal = new File(directory, "journal.json"), backup = new File(directory, token + ".media");
        try (FileOutputStream out = new FileOutputStream(journal)) { out.write("{".getBytes(StandardCharsets.UTF_8)); }
        assertTrue(backup.createNewFile());
        try { store.list(true); fail("Corrupted journal must fail closed"); }
        catch (Exception expected) { assertTrue(journal.exists()); assertTrue(backup.exists()); }
    }
    private void remove(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) remove(child);
        file.delete();
    }
    @After public void teardown() { remove(root); }
}
