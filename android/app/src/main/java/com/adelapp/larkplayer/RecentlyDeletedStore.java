package com.adelapp.larkplayer;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.security.MessageDigest;
import java.util.UUID;

/** Serial app-private recovery store. Original audio is deleted only through
 * NativeMediaPlugin's MediaStore consent API. Atomic journal survives crashes.
 * Stored in noBackupFilesDir: OS/settings backup must not copy private audio. */
final class RecentlyDeletedStore {
    private final Context context;
    private final File directory;
    private final AtomicFile journal;
    RecentlyDeletedStore(Context context) {
        this.context = context;
        directory = new File(context.getNoBackupFilesDir(), "recently-deleted");
        if (!directory.isDirectory() && !directory.mkdirs())
            throw new IllegalStateException("فضای بازیابی در دسترس نیست.");
        journal = new AtomicFile(new File(directory, "journal.json"));
    }
    private JSONObject read() throws Exception {
        if (!journal.getBaseFile().exists() && !new File(directory, "journal.json.bak").exists()) {
            JSONObject root = new JSONObject();
            root.put("days", 30); root.put("items", new JSONObject()); return root;
        }
        try (FileInputStream in = journal.openRead()) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192]; int count;
            while ((count = in.read(buffer)) != -1) {
                if (bytes.size() + count > 16 * 1024 * 1024) throw new Exception("ثبت بازیابی بیش از حد بزرگ است.");
                bytes.write(buffer, 0, count);
            }
            JSONObject root = new JSONObject(bytes.toString("UTF-8"));
            root.getJSONObject("items");
            int days = root.getInt("days");
            if (days != 7 && days != 30 && days != 60 && days != 90) throw new Exception("مدت نگهداری نامعتبر است.");
            JSONObject items = root.getJSONObject("items");
            if (items.length() > 100000) throw new Exception("ثبت بازیابی نامعتبر است.");
            java.util.Set<String> ids = new java.util.HashSet<>();
            for (java.util.Iterator<String> keys = items.keys(); keys.hasNext();) {
                String token = keys.next(); copyFile(token);
                JSONObject entry = items.getJSONObject(token);
                Uri uri = audioUri(entry.getString("uri"));
                if (!token.equals(entry.getString("token")) ||
                    !ids.add(entry.getString("id")) ||
                    !entry.getString("id").equals("audio-" + uri.getLastPathSegment()) ||
                    entry.getLong("date") <= 0 ||
                    !java.util.Arrays.asList("copying", "prepared", "deleted", "restoring", "restored", "purging", "finalizing", "cancelling").contains(entry.getString("status")))
                    throw new Exception("اطلاعات بازیابی معتبر نیست؛ تغییری انجام نشد.");
                if (entry.has("restoredUri")) audioUri(entry.getString("restoredUri"));
                if ("restored".equals(entry.getString("status")) && !entry.has("restoredUri"))
                    throw new Exception("ثبت فایل بازیابی‌شده ناقص است؛ داده‌ها حفظ شدند.");
                JSONArray memberships = entry.optJSONArray("playlistIds");
                if (entry.has("playlistIds") && (memberships == null || memberships.length() > 10000))
                    throw new Exception("اطلاعات لیست‌های پخش معتبر نیست.");
                if (memberships != null) for (int i = 0; i < memberships.length(); i++) {
                    String id = memberships.getString(i);
                    if (id.isEmpty() || id.length() > 4096 || id.chars().anyMatch(c -> c < 32))
                        throw new Exception("شناسه لیست پخش معتبر نیست.");
                }
                if (!"copying".equals(entry.getString("status")) &&
                    !java.util.Arrays.asList("purging", "finalizing", "cancelling").contains(entry.getString("status")) &&
                    (entry.optLong("size", -1) <= 0 || !entry.optString("sha256").matches("[a-f0-9]{64}")))
                    throw new Exception("اطلاعات نسخه امن معتبر نیست؛ داده‌ها حفظ شدند.");
                if (entry.has("restoreName") && !entry.getString("restoreName").matches("ritmo-restore-[0-9a-f-]{36}\\.[A-Za-z0-9]{1,10}"))
                    throw new Exception("نام عملیات بازیابی نامعتبر است.");
            }
            return root;
        }
    }
    private void write(JSONObject root) throws Exception {
        FileOutputStream out = journal.startWrite();
        try {
            out.write(root.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            journal.finishWrite(out);
        } catch (Exception error) { journal.failWrite(out); throw error; }
    }
    private File copyFile(String token) throws Exception {
        if (!token.matches("[0-9a-f-]{36}")) throw new Exception("شناسه بازیابی نامعتبر است.");
        return new File(directory, token + ".media");
    }
    private File coverFile(String token) throws Exception {
        copyFile(token); return new File(directory, token + ".jpg");
    }
    private void removeCopy(String token) throws Exception {
        File audio = copyFile(token), cover = coverFile(token);
        if (cover.exists()) android.system.Os.remove(cover.getAbsolutePath());
        if (audio.exists()) android.system.Os.remove(audio.getAbsolutePath());
    }
    private void extractCover(String token) {
        android.media.MediaMetadataRetriever retriever = new android.media.MediaMetadataRetriever();
        android.graphics.Bitmap bitmap = null;
        try {
            retriever.setDataSource(copyFile(token).getAbsolutePath());
            byte[] picture = retriever.getEmbeddedPicture();
            if (picture == null || picture.length > 16 * 1024 * 1024) return;
            android.graphics.BitmapFactory.Options options = new android.graphics.BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            android.graphics.BitmapFactory.decodeByteArray(picture, 0, picture.length, options);
            options.inSampleSize = 1;
            while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 256) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            bitmap = android.graphics.BitmapFactory.decodeByteArray(picture, 0, picture.length, options);
            if (bitmap != null) try (FileOutputStream out = new FileOutputStream(coverFile(token))) {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out);
                out.getFD().sync();
            }
        } catch (Exception error) {
            android.util.Log.w("RitmoTrash", "No recovery artwork", error);
        } finally {
            if (bitmap != null) bitmap.recycle();
            try { retriever.release(); } catch (Exception ignored) { }
        }
    }
    private Uri audioUri(String value) throws Exception {
        Uri uri = Uri.parse(value);
        if (!"content".equals(uri.getScheme()) || !"media".equals(uri.getAuthority()) ||
            uri.getQuery() != null || uri.getFragment() != null || uri.getPath() == null ||
            !uri.getPath().matches("/(?:external|external_primary)/audio/media/[1-9][0-9]*"))
            throw new Exception("نشانی آهنگ معتبر نیست.");
        return uri;
    }
    private boolean exists(String uri) throws Exception {
        try (Cursor cursor = context.getContentResolver().query(audioUri(uri),
            new String[]{MediaStore.MediaColumns._ID}, null, null, null)) {
            if (cursor == null) throw new Exception("وضعیت فایل قابل بررسی نیست؛ داده‌ها حفظ شدند.");
            return cursor.moveToFirst();
        }
    }
    private static String digest(InputStream in, OutputStream out) throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[65536]; int count;
        while ((count = in.read(buffer)) != -1) {
            sha.update(buffer, 0, count);
            if (out != null) out.write(buffer, 0, count);
        }
        StringBuilder value = new StringBuilder();
        for (byte b : sha.digest()) value.append(String.format(java.util.Locale.US, "%02x", b & 255));
        return value.toString();
    }
    String prepare(String id, String rawUri, JSONObject display) throws Exception {
        Uri uri = audioUri(rawUri);
        if (!id.equals("audio-" + uri.getLastPathSegment())) throw new Exception("شناسه آهنگ معتبر نیست.");
        JSONObject root = read(), items = root.getJSONObject("items");
        recoverInterrupted(root);
        for (java.util.Iterator<String> keys = items.keys(); keys.hasNext();) {
            if (id.equals(items.getJSONObject(keys.next()).getString("id")))
                throw new Exception("عملیات بازیابی برای این آهنگ موجود است؛ اخیراً حذف‌شده را بررسی کنید.");
        }
        String token = UUID.randomUUID().toString();
        JSONObject entry = new JSONObject();
        entry.put("token", token); entry.put("id", id); entry.put("uri", rawUri);
        String path = Build.VERSION.SDK_INT >= 29 ? MediaStore.MediaColumns.RELATIVE_PATH : MediaStore.MediaColumns.DATA;
        try (Cursor cursor = context.getContentResolver().query(uri,
            new String[]{MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.MIME_TYPE,
                MediaStore.MediaColumns.SIZE, path, MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DURATION},
            null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new Exception("فایل اصلی موجود نیست؛ بازیابی ممکن نخواهد بود.");
            entry.put("fileName", cursor.getString(0)); entry.put("mime", cursor.getString(1));
            entry.put("size", cursor.getLong(2)); entry.put("folder", cursor.getString(3));
            entry.put("title", cursor.getString(4)); entry.put("artist", cursor.getString(5));
            entry.put("album", cursor.getString(6)); entry.put("duration", cursor.getLong(7) / 1000.0);
        }
        entry.put("favorite", display.optBoolean("favorite", false));
        entry.put("playlistIds", display.optJSONArray("playlistIds") == null ? new JSONArray() : display.getJSONArray("playlistIds"));
        entry.put("date", System.currentTimeMillis()); entry.put("status", "copying");
        File backup = copyFile(token);
        if (directory.getUsableSpace() < entry.getLong("size") + 1024 * 1024)
            throw new Exception("فضای کافی برای نسخه بازیابی وجود ندارد؛ فایل اصلی حذف نشد.");
        // Persist before copy: interrupted copies never masquerade as recoverable.
        items.put(token, entry); write(root);
        try {
            try (InputStream in = context.getContentResolver().openInputStream(uri);
                 FileOutputStream out = new FileOutputStream(backup)) {
                if (in == null) throw new Exception("خواندن آهنگ ممکن نیست.");
                entry.put("sha256", digest(in, out)); out.getFD().sync();
            }
            if (backup.length() <= 0 || backup.length() != entry.getLong("size"))
                throw new Exception("نسخه بازیابی کامل نیست؛ فایل اصلی حذف نشد.");
            extractCover(token);
            entry.put("status", "prepared"); write(root); return token;
        } catch (Exception error) {
            try { if (exists(rawUri)) dispose(root, token, "cancelling"); }
            catch (Exception cleanup) { error.addSuppressed(cleanup); }
            throw error;
        }
    }
    void validatePrepared(String token, String id, String uri) throws Exception {
        JSONObject entry = read().getJSONObject("items").getJSONObject(token);
        if (!id.equals(entry.getString("id")) || !uri.equals(entry.getString("uri")) ||
            !"prepared".equals(entry.getString("status")) || !copyFile(token).isFile())
            throw new Exception("نسخه امن بازیابی تأیید نشد؛ حذف انجام نشد.");
        try (InputStream check = context.getContentResolver().openInputStream(audioUri(uri))) {
            if (check == null || !digest(check, null).equals(entry.getString("sha256")))
                throw new Exception("فایل اصلی تغییر کرده است؛ حذف انجام نشد.");
        }
        try (InputStream check = new FileInputStream(copyFile(token))) {
            if (!digest(check, null).equals(entry.getString("sha256")))
                throw new Exception("نسخه امن بازیابی آسیب دیده است؛ حذف انجام نشد.");
        }
    }
    void markDeleted(String token) throws Exception {
        JSONObject root = read(), entry = root.getJSONObject("items").getJSONObject(token);
        if (exists(entry.getString("uri"))) throw new Exception("فایل اصلی هنوز موجود است.");
        entry.put("status", "deleted"); entry.put("date", System.currentTimeMillis()); write(root);
    }
    void cancel(String token) throws Exception {
        JSONObject root = read(), items = root.getJSONObject("items"), entry = items.getJSONObject(token);
        if (!exists(entry.getString("uri"))) throw new Exception("فایل اصلی موجود نیست؛ نسخه بازیابی حفظ شد.");
        if (!"prepared".equals(entry.getString("status")) && !"copying".equals(entry.getString("status"))) return;
        dispose(root, token, "cancelling");
    }
    private void dispose(JSONObject root, String token, String phase) throws Exception {
        JSONObject items = root.getJSONObject("items");
        // Durable intent precedes file removal: an interrupted purge never claims recovery.
        items.getJSONObject(token).put("status", phase); write(root);
        removeCopy(token);
        items.remove(token); write(root);
    }
    private void recoverInterrupted(JSONObject root) throws Exception {
        JSONObject items = root.getJSONObject("items");
        java.util.List<String> tokens = new java.util.ArrayList<>();
        for (java.util.Iterator<String> keys = items.keys(); keys.hasNext();) tokens.add(keys.next());
        for (String token : tokens) {
            JSONObject entry = items.getJSONObject(token);
            String status = entry.getString("status");
            if ("purging".equals(status) || "finalizing".equals(status) || "cancelling".equals(status))
                dispose(root, token, status);
            else if ("copying".equals(status) && exists(entry.getString("uri")))
                // All callers use the same serial scan executor: no active copy races recovery.
                dispose(root, token, "cancelling");
        }
    }
    JSONObject list(boolean cleanup) throws Exception {
        JSONObject root = read(), items = root.getJSONObject("items");
        recoverInterrupted(root);
        JSONArray result = new JSONArray();
        java.util.List<String> expired = new java.util.ArrayList<>();
        for (java.util.Iterator<String> keys = items.keys(); keys.hasNext();) {
            String token = keys.next(); JSONObject entry = items.getJSONObject(token);
            if ("prepared".equals(entry.getString("status")) && !exists(entry.getString("uri"))) {
                entry.put("status", "deleted"); write(root);
            }
            long expires = RecoveryPolicy.expiresAt(entry.getLong("date"), root.getInt("days"));
            if (cleanup && "deleted".equals(entry.getString("status")) && System.currentTimeMillis() >= expires)
                expired.add(token);
            else {
                JSONObject view = new JSONObject(entry.toString());
                view.put("expiresAt", expires);
                boolean recoverable = copyFile(token).isFile() && copyFile(token).length() == entry.optLong("size", -1) && entry.has("sha256") &&
                    java.util.Arrays.asList("deleted", "restoring", "restored").contains(entry.getString("status"));
                if (recoverable) {
                    try (InputStream check = new FileInputStream(copyFile(token))) {
                        recoverable = digest(check, null).equals(entry.getString("sha256"));
                    } catch (IOException error) {
                        recoverable = false;
                        android.util.Log.w("RitmoTrash", "Recovery copy not readable; retained", error);
                    }
                }
                view.put("recoverable", recoverable);
                if (coverFile(token).isFile()) view.put("coverUri", Uri.fromFile(coverFile(token)).toString());
                result.put(view);
            }
        }
        for (String token : expired) {
            dispose(root, token, "purging");
        }
        JSONObject response = new JSONObject();
        response.put("days", root.getInt("days")); response.put("items", result); return response;
    }
    void setDays(int days) throws Exception {
        if (days != 7 && days != 30 && days != 60 && days != 90) throw new Exception("مدت نگهداری نامعتبر است.");
        JSONObject root = read(); root.put("days", days); write(root);
    }
    String restore(String token) throws Exception {
        JSONObject root = read(), entry = root.getJSONObject("items").getJSONObject(token);
        String status = entry.getString("status");
        if (!java.util.Arrays.asList("copying", "prepared", "deleted", "restoring", "restored").contains(status))
            throw new Exception("عملیات پاک‌سازی در حال تکمیل است؛ بازیابی ممکن نیست.");
        if ("copying".equals(status)) {
            if (exists(entry.getString("uri"))) dispose(root, token, "cancelling");
            throw new Exception("آماده‌سازی نسخه امن قطع شده است؛ فایل موجود حفظ شد. حذف را از کتابخانه دوباره آغاز کنید.");
        }
        if ("prepared".equals(status)) {
            if (exists(entry.getString("uri"))) {
                validatePrepared(token, entry.getString("id"), entry.getString("uri"));
                entry.put("restoredUri", entry.getString("uri")); entry.put("status", "restored"); write(root);
                return entry.getString("uri");
            }
            entry.put("status", "deleted"); write(root);
        }
        ContentResolver resolver = context.getContentResolver();
        if ("restored".equals(status)) {
            if (!exists(entry.getString("restoredUri"))) throw new Exception("فایل بازیابی‌شده موجود نیست؛ نسخه امن حفظ شد.");
            if (!validRestoredFile(entry, audioUri(entry.getString("restoredUri"))))
                throw new Exception("فایل بازیابی‌شده تغییر کرده است؛ نسخه امن حفظ شد.");
            return entry.getString("restoredUri");
        }
        File backup = copyFile(token);
        if (!backup.isFile()) throw new Exception("نسخه بازیابی موجود نیست؛ اطلاعات حفظ شد.");
        try (InputStream in = new FileInputStream(backup)) {
            if (!digest(in, null).equals(entry.getString("sha256"))) throw new Exception("نسخه بازیابی آسیب دیده است؛ اطلاعات حفظ شد.");
        }
        Uri destination = findRestoreDestination(entry);
        if (destination != null) {
            verifyOwnedDestination(entry, destination);
            if (validRestoredFile(entry, destination)) {
                publish(resolver, destination);
                entry.put("restoredUri", destination.toString()); entry.put("status", "restored"); write(root);
                return destination.toString();
            }
            if (resolver.delete(destination, null, null) != 1)
                throw new Exception("پاک‌سازی بازیابی ناتمام ممکن نیست؛ اطلاعات حفظ شد.");
        }
        entry.remove("restoredUri");
        ContentValues values = new ContentValues();
        String originalName = new File(entry.getString("fileName")).getName();
        int dot = originalName.lastIndexOf('.');
        String extension = dot > 0 ? originalName.substring(dot + 1) : "mp3";
        if (!extension.matches("[A-Za-z0-9]{1,10}")) extension = "mp3";
        String name = "ritmo-restore-" + UUID.randomUUID().toString() + "." + extension;
        // An insertion marker is durable BEFORE insert, so retry can locate an orphan row.
        entry.put("restoreName", name); entry.put("status", "restoring"); write(root);
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, entry.optString("mime", "audio/mpeg"));
        values.put(MediaStore.Audio.Media.TITLE, entry.optString("title"));
        values.put(MediaStore.Audio.Media.ARTIST, entry.optString("artist"));
        values.put(MediaStore.Audio.Media.ALBUM, entry.optString("album"));
        values.put(MediaStore.Audio.Media.IS_MUSIC, 1);
        if (Build.VERSION.SDK_INT >= 29) {
            String folder = entry.optString("folder", "");
            if (!folder.startsWith("Music/") || folder.contains("..")) folder = "Music/Ritmo Restored/";
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, folder);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        } else {
            File target = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "Ritmo Restored");
            if (!target.isDirectory() && !target.mkdirs()) throw new Exception("مجوز یا فضای بازیابی موجود نیست.");
            File destinationFile = new File(target, name);
            if (destinationFile.exists()) throw new Exception("فایل مقصد موجود است؛ هیچ فایلی بازنویسی نشد.");
            values.put(MediaStore.MediaColumns.DATA, destinationFile.getAbsolutePath());
        }
        destination = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);
        if (destination == null) throw new Exception("ایجاد فایل بازیابی انجام نشد.");
        // Log the exact new row before writing it. Retry can only delete this
        // app-owned insertion; never overwrite another file at the destination.
        try {
            entry.put("restoredUri", destination.toString()); entry.put("status", "restoring"); write(root);
        } catch (Exception error) {
            try {
                verifyOwnedDestination(entry, destination);
                if (resolver.delete(destination, null, null) != 1) throw new Exception("پاک‌سازی فایل ناتمام انجام نشد.");
            } catch (Exception rollback) { error.addSuppressed(rollback); }
            throw error;
        }
        boolean published = false;
        try {
            try (InputStream in = new FileInputStream(backup); OutputStream out = resolver.openOutputStream(destination, "w")) {
                if (out == null) throw new Exception("نوشتن فایل بازیابی ممکن نیست.");
                digest(in, out); out.flush();
            }
            if (!validRestoredFile(entry, destination))
                throw new Exception("صحت فایل بازیابی تأیید نشد؛ نسخه امن حفظ شد.");
            publish(resolver, destination); published = true;
            entry.put("status", "restored"); write(root); return destination.toString();
        } catch (Exception error) {
            if (!published) {
                try {
                    verifyOwnedDestination(entry, destination);
                    if (resolver.delete(destination, null, null) != 1) throw new Exception("پاک‌سازی بازیابی ناتمام انجام نشد.");
                    entry.remove("restoredUri"); entry.put("status", "deleted"); write(root);
                } catch (Exception rollback) { error.addSuppressed(rollback); }
            }
            throw error;
        }
    }
    private boolean validRestoredFile(JSONObject entry, Uri uri) throws Exception {
        try (InputStream in = context.getContentResolver().openInputStream(uri)) {
            return in != null && digest(in, null).equals(entry.getString("sha256"));
        }
    }
    private void publish(ContentResolver resolver, Uri uri) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues ready = new ContentValues(); ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (resolver.update(uri, ready, null, null) != 1) throw new Exception("انتشار فایل بازیابی انجام نشد.");
        }
    }
    private Uri findRestoreDestination(JSONObject entry) throws Exception {
        if (entry.has("restoredUri")) {
            Uri uri = audioUri(entry.getString("restoredUri"));
            if (exists(uri.toString())) return uri;
        }
        if (!entry.has("restoreName")) return null;
        try (Cursor cursor = context.getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            new String[]{MediaStore.MediaColumns._ID}, MediaStore.MediaColumns.DISPLAY_NAME + " = ?",
            new String[]{entry.getString("restoreName")}, null)) {
            if (cursor == null) throw new Exception("بررسی عملیات بازیابی ممکن نیست.");
            if (!cursor.moveToFirst()) return null;
            long id = cursor.getLong(0);
            if (cursor.moveToNext()) throw new Exception("عملیات بازیابی مبهم است؛ هیچ فایلی حذف نشد.");
            return android.content.ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
        }
    }
    private void verifyOwnedDestination(JSONObject entry, Uri uri) throws Exception {
        // Old interrupted restores lack a marker: preserve them for manual inspection.
        if (!entry.has("restoreName")) throw new Exception("مالکیت فایل ناتمام تأیید نشد؛ هیچ فایلی حذف نشد.");
        String ownership = Build.VERSION.SDK_INT >= 29 ? MediaStore.MediaColumns.OWNER_PACKAGE_NAME : MediaStore.MediaColumns.DATA;
        try (Cursor cursor = context.getContentResolver().query(uri,
            new String[]{MediaStore.MediaColumns.DISPLAY_NAME, ownership}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst() || !entry.getString("restoreName").equals(cursor.getString(0)))
                throw new Exception("شناسه فایل بازیابی تأیید نشد.");
            String expected = Build.VERSION.SDK_INT >= 29 ? context.getPackageName() :
                new File(new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
                    "Ritmo Restored"), entry.getString("restoreName")).getAbsolutePath();
            if (!expected.equals(cursor.getString(1))) throw new Exception("مالکیت فایل بازیابی تأیید نشد.");
        }
    }
    void finishRestore(String token) throws Exception {
        JSONObject root = read(), items = root.getJSONObject("items"), entry = items.getJSONObject(token);
        if (!"restored".equals(entry.getString("status")) || !exists(entry.getString("restoredUri")) ||
            !validRestoredFile(entry, audioUri(entry.getString("restoredUri"))))
            throw new Exception("بازیابی تأیید نشد؛ نسخه امن حفظ شد.");
        dispose(root, token, "finalizing");
    }
    void permanent(String token) throws Exception {
        JSONObject root = read(), items = root.getJSONObject("items"), entry = items.getJSONObject(token);
        if (!"deleted".equals(entry.getString("status")) && !"purging".equals(entry.getString("status")) &&
            !("copying".equals(entry.getString("status")) && !exists(entry.getString("uri"))))
            throw new Exception("عملیات ناتمام است؛ ابتدا بازیابی را کامل کنید.");
        dispose(root, token, "purging");
    }
}
