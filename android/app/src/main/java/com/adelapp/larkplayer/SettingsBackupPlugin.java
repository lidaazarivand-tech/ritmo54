package com.adelapp.larkplayer;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.AtomicFile;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "SettingsBackup")
public class SettingsBackupPlugin extends Plugin {
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private static final String[] GROUPS = {"ritmo_bookmarks", "ritmo_playback", "ritmo_playback_state"};
    private static final Object PREFERENCES_LOCK = new Object();
    private ActivityResultLauncher<Intent> saveLauncher;
    private ActivityResultLauncher<Intent> openLauncher;
    private PluginCall pending;
    private String pendingContent;
    private boolean finishingPicker;
    private Runnable pickerTimeout;
    private volatile boolean destroyed;
    private final AtomicBoolean preferencesBusy = new AtomicBoolean();
    private final AtomicBoolean fileBusy = new AtomicBoolean();
    private static final class FileTask {
        final android.os.CancellationSignal cancellation = new android.os.CancellationSignal();
        volatile boolean cancelled;
        volatile java.io.Closeable stream;
        void check() throws java.io.InterruptedIOException {
            if (cancelled || Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException("document operation cancelled");
        }
        void cancel() {
            cancelled = true; cancellation.cancel();
            try { if (stream != null) stream.close(); }
            catch (Exception error) { Log.w("RitmoBackup", "document cancellation close failed (" + error.getClass().getSimpleName() + ")"); }
        }
    }
    private FileTask activeFile;
    private final Handler main = new Handler(Looper.getMainLooper());
    // Keep preference operations isolated from document-provider I/O. Some cloud
    // document providers can block while opening/reading a stream; they must never
    // stall future backup preference reads behind the same single-thread queue.
    // Leases above these bounded executors prohibit accumulating timed-out requests.
    private final ExecutorService preferenceIo = new ThreadPoolExecutor(0, 2, 30L, TimeUnit.SECONDS, new SynchronousQueue<>());
    private final ExecutorService fileIo = new ThreadPoolExecutor(0, 2, 30L, TimeUnit.SECONDS, new SynchronousQueue<>());
    private final ExecutorService cancellationIo = new ThreadPoolExecutor(0, 1, 30L, TimeUnit.SECONDS, new SynchronousQueue<>());
    private void cancelFile(FileTask task) {
        task.cancelled = true;
        // CancellationSignal may call a remote document provider. Never wait for it on UI.
        try { cancellationIo.execute(task::cancel); }
        catch (RejectedExecutionException error) { Log.w("RitmoBackup", "document cancellation worker unavailable; file lease retained"); }
    }

    @Override public void load() {
        // Plugins can load after Activity STARTED. The lifecycle-owner register
        // overload throws then and leaves the JS call waiting forever.
        // The owner-free overload is intentional; unregister explicitly on destroy.
        saveLauncher = getActivity().getActivityResultRegistry().register(
            "ritmo-settings-save-backup", new ActivityResultContracts.StartActivityForResult(),
            result -> finishPicker(result.getResultCode(), result.getData(), true));
        openLauncher = getActivity().getActivityResultRegistry().register(
            "ritmo-settings-open-backup", new ActivityResultContracts.StartActivityForResult(),
            result -> finishPicker(result.getResultCode(), result.getData(), false));
    }
    private void submit(PluginCall call, Runnable work) {
        // Do not queue retries behind an uninterruptible OS storage call.
        // Keep the lease until the actual worker exits, even if its caller timed out.
        if (destroyed || !preferencesBusy.compareAndSet(false, true)) {
            call.reject("عملیات تنظیمات قبلی هنوز پایان نیافته است؛ پس از پایان آن دوباره تلاش کنید."); return;
        }
        try {
            preferenceIo.execute(() -> {
                try { work.run(); }
                finally { preferencesBusy.set(false); }
            });
        } catch (RejectedExecutionException error) {
            preferencesBusy.set(false);
            call.reject("اجرای عملیات تنظیمات ممکن نشد؛ دوباره تلاش کنید.", error);
        }
    }
    private void submitFile(PluginCall call, Runnable work) {
        if (!fileBusy.compareAndSet(false, true)) {
            completePicker(call, null, new IllegalStateException("previous document operation is still stopping"), false); return;
        }
        try {
            fileIo.execute(() -> { try { work.run(); } finally { fileBusy.set(false); } });
        } catch (RejectedExecutionException error) {
            fileBusy.set(false); completePicker(call, null, error, false);
        }
    }
    private void completePicker(PluginCall call, JSObject result, Exception error, boolean saving) {
        main.post(() -> {
            // Ignore duplicate results or a worker completing after Activity destruction.
            if (pending != call || destroyed) return;
            if (pickerTimeout != null) main.removeCallbacks(pickerTimeout);
            pickerTimeout = null;
            activeFile = null;
            pending = null; pendingContent = null; finishingPicker = false;
            if (error == null) call.resolve(result);
            else call.reject(saving
                ? "ذخیره پشتیبان کامل نشد؛ فایل انتخاب‌شده ممکن است ناقص باشد. پشتیبان قبلی را نگه دارید و دوباره تلاش کنید."
                : "خواندن پشتیبان انجام نشد.", error);
        });
    }
    private static SharedPreferences preferences(Context context, String group) {
        return context.getSharedPreferences(group, Context.MODE_PRIVATE);
    }
    private static boolean supported(String group, String key) {
        if (group.equals("ritmo_bookmarks")) return validId(key);
        if (group.equals("ritmo_playback")) return key.equals("mode");
        return group.equals("ritmo_playback_state") &&
            (key.equals("volume") || key.equals("speed") || key.equals("shuffle") || key.equals("repeat"));
    }
    private static boolean validId(String value) {
        return !value.isEmpty() && value.length() <= 4096 && value.chars().noneMatch(c -> c < 32);
    }
    private static JSONObject snapshot(Context context) throws Exception {
        JSONObject groups = new JSONObject();
        for (String group : GROUPS) {
            if (Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException("settings read cancelled");
            JSONObject entries = new JSONObject();
            for (Map.Entry<String, ?> row : preferences(context, group).getAll().entrySet()) {
                if (!supported(group, row.getKey())) continue;
                Object value = row.getValue();
                String type;
                if (value instanceof String) type = "string";
                else if (value instanceof Long) type = "long";
                else if (value instanceof Integer) type = "int";
                else if (value instanceof Float) type = "float";
                else if (value instanceof Boolean) type = "boolean";
                else throw new IllegalArgumentException("نوع داده ذخیره‌شده پشتیبانی نمی‌شود.");
                entries.put(row.getKey(), new JSONObject().put("type", type).put("value", value));
            }
            groups.put(group, entries);
        }
        return groups;
    }
    private static boolean number(Object value, double min, double max) {
        if (!(value instanceof Number)) return false;
        double n = ((Number) value).doubleValue();
        return !Double.isNaN(n) && !Double.isInfinite(n) && n >= min && n <= max;
    }
    private static void validate(JSONObject groups) throws Exception {
        Iterator<String> names = groups.keys();
        while (names.hasNext()) {
            String group = names.next();
            if (!group.equals(GROUPS[0]) && !group.equals(GROUPS[1]) && !group.equals(GROUPS[2]))
                throw new IllegalArgumentException("گروه داده نامعتبر است.");
            JSONObject entries = groups.getJSONObject(group);
            if (entries.length() > 100000) throw new IllegalArgumentException("تعداد داده‌ها بیش از حد مجاز است.");
            Iterator<String> keys = entries.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (!supported(group, key)) throw new IllegalArgumentException("کلید داده نامعتبر است.");
                JSONObject entry = entries.getJSONObject(key);
                if (entry.length() != 2) throw new IllegalArgumentException("ساختار داده نامعتبر است.");
                String type = entry.getString("type");
                Object value = entry.get("value");
                boolean valid = false;
                if (group.equals("ritmo_bookmarks"))
                    valid = type.equals("long") && number(value, 0, 9007199254740991L) &&
                        ((Number) value).doubleValue() == Math.floor(((Number) value).doubleValue());
                else if (group.equals("ritmo_playback"))
                    valid = type.equals("string") && value instanceof String &&
                        (value.equals("focus") || value.equals("sleep") || value.equals("workout"));
                else if (key.equals("volume")) valid = type.equals("float") && number(value, 0, 1);
                else if (key.equals("speed")) valid = type.equals("float") && number(value, 0.5, 2);
                else if (key.equals("shuffle")) valid = type.equals("boolean") && value instanceof Boolean;
                else if (key.equals("repeat"))
                    valid = type.equals("int") && number(value, 0, 2) &&
                        ((Number) value).doubleValue() == Math.floor(((Number) value).doubleValue());
                if (!valid) throw new IllegalArgumentException("مقدار داده نامعتبر است.");
            }
        }
    }
    private static void replace(Context context, JSONObject groups) throws Exception {
        for (String group : GROUPS) {
            SharedPreferences pref = preferences(context, group);
            SharedPreferences.Editor editor = pref.edit();
            for (String key : pref.getAll().keySet()) if (supported(group, key)) editor.remove(key);
            JSONObject entries = groups.optJSONObject(group);
            if (entries != null) {
                Iterator<String> keys = entries.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    JSONObject entry = entries.getJSONObject(key);
                    switch (entry.getString("type")) {
                        case "string": editor.putString(key, entry.getString("value")); break;
                        case "long": editor.putLong(key, entry.getLong("value")); break;
                        case "int": editor.putInt(key, entry.getInt("value")); break;
                        case "float": editor.putFloat(key, (float) entry.getDouble("value")); break;
                        case "boolean": editor.putBoolean(key, entry.getBoolean("value")); break;
                        default: throw new IllegalArgumentException("نوع داده نامعتبر است.");
                    }
                }
            }
            if (!editor.commit()) throw new IllegalStateException("ذخیره تنظیمات انجام نشد.");
        }
    }
    private static AtomicFile transaction(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), "settings-restore.json"));
    }
    static synchronized void recoverPreferences(Context context) throws Exception {
        AtomicFile journal = transaction(context);
        if (!journal.getBaseFile().exists() && !new File(journal.getBaseFile() + ".bak").exists()) return;
        try (FileInputStream stream = journal.openRead(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = stream.read(buffer)) != -1) {
                if (bytes.size() + count > MAX_BYTES) throw new IllegalStateException("ثبت بازیابی نامعتبر است؛ داده‌ها حفظ شدند.");
                bytes.write(buffer, 0, count);
            }
            JSONObject old = new JSONObject(bytes.toString("UTF-8"));
            validate(old); replace(context, old); verifyPreferences(context, old);
        }
        clearTransaction(journal);
    }
    private static void clearTransaction(AtomicFile journal) throws Exception {
        journal.delete();
        if (journal.getBaseFile().exists() || new File(journal.getBaseFile() + ".bak").exists())
            throw new IllegalStateException("تکمیل ثبت بازیابی انجام نشد.");
    }
    private static void restoreTransaction(Context context, JSONObject input) throws Exception {
        synchronized (PREFERENCES_LOCK) {
            validate(input); recoverPreferences(context);
            JSONObject old = snapshot(context); validate(old);
            byte[] bytes = old.toString().getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_BYTES) throw new IllegalStateException("تنظیمات قبلی بیش از حد مجاز است؛ تغییری انجام نشد.");
            AtomicFile journal = transaction(context);
            FileOutputStream stream = journal.startWrite();
            try { stream.write(bytes); journal.finishWrite(stream); }
            catch (Exception error) { journal.failWrite(stream); throw error; }
            try {
                replace(context, input);
                verifyPreferences(context, input);
                clearTransaction(journal);
            } catch (Exception error) {
                try { recoverPreferences(context); }
                catch (Exception rollback) { error.addSuppressed(rollback); }
                throw error;
            }
        }
    }
    private static void verifyPreferences(Context context, JSONObject input) throws Exception {
        JSONObject actual = snapshot(context); validate(actual);
        for (String group : GROUPS) {
            JSONObject desired = input.optJSONObject(group), stored = actual.optJSONObject(group);
            if (desired == null) desired = new JSONObject();
            if (stored == null || stored.length() != desired.length())
                throw new IllegalStateException("بررسی تنظیمات بازیابی‌شده ناموفق بود.");
            Iterator<String> keys = desired.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                JSONObject want = desired.getJSONObject(key), got = stored.getJSONObject(key);
                String type = want.getString("type");
                boolean equal = type.equals(got.getString("type")) && ("float".equals(type)
                    ? Float.floatToIntBits((float) want.getDouble("value")) == Float.floatToIntBits((float) got.getDouble("value"))
                    : want.get("value").toString().equals(got.get("value").toString()));
                if (!equal) throw new IllegalStateException("بررسی تنظیمات بازیابی‌شده ناموفق بود.");
            }
        }
    }
    @PluginMethod public void exportPreferences(PluginCall call) {
        Log.i("RitmoBackup", "preferences export requested");
        submit(call, () -> {
            final AtomicBoolean settled = new AtomicBoolean();
            final Thread worker = Thread.currentThread();
            final Runnable deadline = () -> {
                if (settled.compareAndSet(false, true)) {
                    worker.interrupt();
                    Log.w("RitmoBackup", "preferences export deadline exceeded; worker lease retained");
                    call.reject("خواندن تنظیمات اندروید متوقف شد؛ عملیات خواندن لغو شد. اگر ذخیره‌سازی دستگاه پاسخ ندهد، درخواست جدید صف نمی‌شود.");
                }
            };
            main.postDelayed(deadline, 15000);
            try {
                final JSONObject snapshot;
                // Export is read-only. Do not run rollback here or export a half-restored state.
                // Explicit recovery is available on a restore retry, not on startup/playback.
                AtomicFile recovery = transaction(getContext());
                if (recovery.getBaseFile().exists() || new File(recovery.getBaseFile() + ".bak").exists())
                    throw new IllegalStateException("بازیابی قبلی ناتمام است؛ ابتدا بازیابی را دوباره اجرا کنید.");
                Log.i("RitmoBackup", "preferences snapshot started");
                snapshot = snapshot(getContext());
                if (Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException("settings export cancelled");
                validate(snapshot);
                verifyPreferences(getContext(), snapshot);
                JSObject result = new JSObject();
                result.put("preferences", snapshot);
                if (settled.compareAndSet(false, true)) {
                    Log.i("RitmoBackup", "preferences snapshot validated");
                    call.resolve(result);
                }
            } catch (Exception e) {
                Log.w("RitmoBackup", "preferences export failed (" + e.getClass().getSimpleName() + ")");
                if (settled.compareAndSet(false, true)) call.reject("خواندن تنظیمات پشتیبان انجام نشد. " + e.getMessage(), e);
            } finally { main.removeCallbacks(deadline); }
        });
    }
    @PluginMethod public void restorePreferences(PluginCall call) {
        JSObject input = call.getObject("preferences");
        if (input == null) { call.reject("اطلاعات پشتیبان نامعتبر است."); return; }
        submit(call, () -> {
            try {
                Log.i("RitmoBackup", "preferences restore started");
                restoreTransaction(getContext(), input);
                Log.i("RitmoBackup", "preferences restore read-back verified");
                call.resolve();
            } catch (Exception e) {
                Log.w("RitmoBackup", "preferences restore failed (" + e.getClass().getSimpleName() + ")");
                call.reject("بازیابی تنظیمات انجام نشد.", e);
            }
        });
    }
    /** Explicit retry recovery. Never run this on Activity/service startup. */
    @PluginMethod public void recoverSettings(PluginCall call) {
        submit(call, () -> {
            try {
                Log.i("RitmoBackup", "explicit settings recovery started");
                synchronized (PREFERENCES_LOCK) { recoverPreferences(getContext()); }
                call.resolve();
            } catch (Exception error) { call.reject("بازیابی قبلی هنوز ناتمام است؛ داده‌ها برای بررسی حفظ شدند.", error); }
        });
    }
    @PluginMethod public void saveFile(PluginCall call) {
        String content = call.getString("content");
        String name = call.getString("name", "Ritmo-backup.json");
        if (content == null || content.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES ||
            !name.matches("[\\p{L}\\p{N} _().-]{1,80}\\.json")) {
            call.reject("اطلاعات پشتیبان نامعتبر یا بیش از حد مجاز است."); return;
        }
        main.post(() -> {
            if (destroyed) { call.reject("عملیات پشتیبان قطع شد؛ دوباره تلاش کنید."); return; }
            if (pending != null || fileBusy.get()) { call.reject("عملیات فایل قبلی هنوز تمام نشده است."); return; }
            pending = call; pendingContent = content; finishingPicker = false;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, name);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try { saveLauncher.launch(intent); }
            catch (Exception e) { pending = null; pendingContent = null; call.reject("انتخابگر محل ذخیره باز نشد.", e); }
        });
    }
    @PluginMethod public void openFile(PluginCall call) {
        main.post(() -> {
            if (destroyed) { call.reject("عملیات پشتیبان قطع شد؛ دوباره تلاش کنید."); return; }
            if (pending != null || fileBusy.get()) { call.reject("عملیات فایل قبلی هنوز تمام نشده است."); return; }
            pending = call; pendingContent = null; finishingPicker = false;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            // Providers may label a valid JSON backup as text or octet-stream.
            intent.setType("*/*");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try { openLauncher.launch(intent); }
            catch (Exception e) { pending = null; call.reject("انتخابگر پشتیبان باز نشد.", e); }
        });
    }
    private void finishPicker(int resultCode, Intent data, boolean saving) {
        PluginCall call = pending;
        String content = pendingContent;
        if (call == null || finishingPicker || destroyed) return;
        if (resultCode != Activity.RESULT_OK) {
            if (pickerTimeout != null) main.removeCallbacks(pickerTimeout);
            pickerTimeout = null;
            pending = null; pendingContent = null; finishingPicker = false;
            JSObject result = new JSObject(); result.put("cancelled", true); call.resolve(result);
            return;
        }
        if (data == null || data.getData() == null) {
            if (pickerTimeout != null) main.removeCallbacks(pickerTimeout);
            pickerTimeout = null;
            pending = null; pendingContent = null; finishingPicker = false;
            call.reject("فایل انتخاب‌شده قابل دسترسی نیست."); return;
        }
        Uri uri = data.getData();
        finishingPicker = true;
        FileTask task = new FileTask();
        activeFile = task;
        pickerTimeout = () -> {
            if (pending != call || destroyed) return;
            cancelFile(task);
            pending = null; pendingContent = null; finishingPicker = false; pickerTimeout = null;
            activeFile = null;
            Log.w("RitmoBackup", "document deadline exceeded; cancellation requested");
            call.reject("خواندن یا ذخیره فایل پشتیبان بیش از حد طول کشید. فایل دیگری انتخاب کنید یا دوباره تلاش کنید.");
        };
        main.postDelayed(pickerTimeout, 30000);
        submitFile(call, () -> {
            try {
                task.check();
                Log.i("RitmoBackup", saving ? "document write started" : "document read started");
                JSObject result = new JSObject();
                if (saving) {
                    if (content == null) throw new IllegalStateException("اطلاعات پشتیبان در دسترس نیست.");
                    // Prepare the entire bounded payload before opening/truncating the document.
                    byte[] payload = content.getBytes(StandardCharsets.UTF_8);
                    if (payload.length > MAX_BYTES) throw new IllegalArgumentException("فایل پشتیبان بیش از حد مجاز است.");
                    // SAF has no universal atomic replacement. Refuse existing/non-empty documents.
                    try (android.database.Cursor cursor = getContext().getContentResolver().query(uri,
                        new String[]{android.provider.OpenableColumns.SIZE}, null, null, null, task.cancellation)) {
                        if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0) && cursor.getLong(0) > 0)
                            throw new IllegalStateException("یک فایل جدید و خالی انتخاب کنید؛ پشتیبان قبلی بازنویسی نمی‌شود.");
                    }
                    task.check();
                    android.os.ParcelFileDescriptor descriptor = getContext().getContentResolver().openFileDescriptor(uri, "wt", task.cancellation);
                    if (descriptor == null) throw new IllegalStateException("فایل قابل نوشتن نیست.");
                    try (OutputStream stream = new android.os.ParcelFileDescriptor.AutoCloseOutputStream(descriptor)) {
                        task.stream = stream; task.check();
                        stream.write(payload); stream.flush();
                    }
                    task.check();
                    descriptor = getContext().getContentResolver().openFileDescriptor(uri, "r", task.cancellation);
                    if (descriptor == null) throw new IllegalStateException("فایل قابل بررسی نیست.");
                    try (InputStream stream = new android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
                        task.stream = stream; task.check();
                        BackupFileIO.verify(stream, payload);
                    }
                } else {
                    android.os.ParcelFileDescriptor descriptor = getContext().getContentResolver().openFileDescriptor(uri, "r", task.cancellation);
                    if (descriptor == null) throw new IllegalStateException("فایل قابل خواندن نیست.");
                    try (InputStream stream = new android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
                        task.stream = stream; task.check();
                        result.put("content", BackupFileIO.readUtf8(stream, MAX_BYTES));
                    }
                }
                task.check();
                Log.i("RitmoBackup", saving ? "document write verified" : "document read complete");
                result.put("cancelled", false);
                completePicker(call, result, null, saving);
            } catch (Exception e) {
                completePicker(call, null, e, saving);
            }
        });
    }
    @Override protected void handleOnDestroy() {
        destroyed = true;
        if (activeFile != null) cancelFile(activeFile);
        if (saveLauncher != null) saveLauncher.unregister();
        if (openLauncher != null) openLauncher.unregister();
        if (pending != null) pending.reject("عملیات انتخاب فایل قطع شد؛ دوباره تلاش کنید.");
        if (pickerTimeout != null) main.removeCallbacks(pickerTimeout);
        pickerTimeout = null;
        pending = null; pendingContent = null; finishingPicker = false; preferenceIo.shutdownNow(); fileIo.shutdownNow();
        cancellationIo.shutdown();
        super.handleOnDestroy();
    }
}
