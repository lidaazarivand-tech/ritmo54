# RITMO 47 | گزارش اصلاح نهایی

## Chromium

`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright node verification/browser-smoke.mjs` با Chromium واقعی اجرا شد: **28/28 بررسی موفق**.

Lyrics آزموده شد: جست‌وجوی دستی ابتدا `/api/get` را با `track_name=ترانه جستجو` و `artist_name=خواننده` می‌زند؛ جست‌وجوی LRCLIB سپس structured search و `q=ترانه جستجو خواننده` را امتحان می‌کند و در آخر fallback عنوان‌تنها با `q=ترانه جستجو` دارد. تست هر دو query را بررسی کرد، نتیجه‌های fixture را در UI انتخاب کرد و متن ترانه را دید؛ نتیجهٔ همگام، empty، rate-limit و جلوگیری از نمایش پاسخ آهنگ قبلی هم آزموده شد. Lyrics جست‌وجوی زنده اینترنت نبود، پاسخ‌ها fixture بودند.

Drag در Chromium: ردیف زیر نشانگر transform زنده و غیرصفر داشت، ردیف‌های میانی transform جابه‌جایی گرفتند، ترتیب نهایی بررسی شد و پس از ترک و بازگشت به صفحه از storage بازیابی شد. Drag دوم، لغو با Escape، لمس و auto-scroll نیز بررسی شدند. بررسی کتابخانه/علاقه‌مندی/گروه‌ها/هر پلی‌لیست علاوه بر تست‌های منطق و storage، تست Node منبعی مستقل دارد؛ تعامل بصری Chromium در harness برای صفحهٔ PlaylistDetail انجام شد، نه کل اپلیکیشن.

## Node

اجرای نهایی `node --experimental-strip-types --test tests/*.test.mjs`: **237 تست موفق، 0 ناموفق، 0 skip**.

تست Node پیشین که شکست می‌خورد: `all reorder surfaces use the shared FLIP helper and persist their existing order sources`. خطا: `The input did not match the regular expression /captureVerticalPositions\(listRef\.current/.` علت: پیاده‌سازی صحیح از alias محلی `rowContainer` استفاده می‌کرد و assertion قدیمی فقط عبارت inline را می‌پذیرفت. Stack آن در `tests/reorder-motion.test.mjs:31:9` بود؛ assertion به قرارداد alias و FLIP تغییر کرد، تست حذف یا ضعیف نشد.

## Android URI و پخش

`ACTION_VIEW` اکنون URIهای صوتی `content://` از MediaStore و DocumentsProviderهای سازگار را بدون فرض مسیر فایل/MediaStore می‌پذیرد. برنامه با `ContentResolver` متادیتای اختیاری می‌خواند، stream را با سقف 1 GiB به فایل app-private کپی می‌کند و URI محدود و پایدار FileProvider را از مسیر پخش Media3 موجود استفاده می‌کند؛ grant موقت فقط هنگام کپی لازم است و فایل داخلی برای صف پایدار می‌ماند. URIهای `file://` عمداً رد می‌شوند؛ MIME ورودی فقط یک فیلتر `audio/*` دارد. مسیرهای حذف/تغییر MediaStore برای فایل importشده فعال نیستند.

تست‌های Node و بررسی سورس این قرارداد را پوشش می‌دهند؛ **پخش روی گوشی واقعی NOT VERIFIED** چون Android SDK، Gradle distribution و دستگاه/شبیه‌ساز در دسترس نبودند. Android build با Wrapper پیش از کامپایل متوقف شد: تلاش دانلود Gradle از `services.gradle.org` با `UnknownHostException` شکست خورد. `npm ci`, lint/TypeScript، Vite build و Capacitor sync هم `NOT RUN` هستند: npm/npx/tsc نصب نیستند. GitHub Actions اجرا نشد.

## فایل‌های تغییرکرده

`android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/com/adelapp/larkplayer/MainActivity.java`, `NativeMediaPlugin.java`, `RecoveryPolicy.java`, `android/app/src/main/res/xml/file_paths.xml`, `android/app/src/test/java/com/adelapp/larkplayer/RecoveryPolicyTest.java`, `src/RitmoAppClean.tsx`, `tests/android-incoming-audio.test.mjs`, `tests/manual-song-order.test.mjs`, `tests/player-scope.test.mjs`, `tests/reorder-motion.test.mjs`, `verification/browser-entry.tsx`, `verification/browser-smoke.mjs`, `verification/RESULTS.json`, `RITMO47-REPORT_FA.md`.

اصلاحات قبلی Cassette/Midnight Orbit، پنجره‌های مرکزی و Drag موجود حفظ شده‌اند. `file://`, پخش روی دستگاه، Buildها و CI: **NOT VERIFIED**. هیچ commit یا push انجام نشده است.

## GitHub Actions TypeScript repair | 2026-10-23

Run بررسی‌شده: `https://github.com/lidaazarivand-tech/ritmo47/actions/runs/40010804183`، شکست در `src/components/PlaylistDetail.tsx:58,83`. علت دقیق این بود که نوع inline مربوط به `gesture` فیلد `before` را اعلام نمی‌کرد، با اینکه هنگام ساخت state مقدار snapshot ثبت و سپس در `finishGesture` و `findTarget` خوانده می‌شد. این فیلد اکنون با نوع واقعی `VerticalSnapshot` از helper مشترک اعلان شده است؛ هیچ `any` یا خاموش‌سازی typecheck استفاده نشده.

تست‌های مرتبط: **21/21** موفق. کل Node suite: **237/237** موفق. Chromium دوباره اجرا شد و **28/28** بررسی موفق شد. TypeScript check مستقیم برای `PlaylistDetail.tsx` با React type declarations موجود موفق شد؛ typecheck کامل پروژه به دلیل نصب‌نبودن `vite/client` در وابستگی‌های محیطی قابل اجرا نیست. `npm ci` و Web Build `NOT RUN` چون npm و Vite نصب نیستند. Android APK build `NOT RUN`: Android SDK و Gradle distribution در محیط موجود نیست و Wrapper برای دریافت Gradle به اینترنت نیاز دارد.

فایل‌های این اصلاح CI: `src/components/PlaylistDetail.tsx`, `tests/playlist-detail.test.mjs`. Workflow در `.github/workflows/android-apk.yml` بررسی شد: دستورات npm و Gradle با package scripts و مسیر پروژه هماهنگ‌اند و خطای گزارش‌شده از TypeScript بوده است. هشدارهای `actions/checkout@v4`, `setup-node@v4`, `setup-java@v4` درباره runtimeهای Node قدیمی/نسخه اکشن‌ها جدا از خطای `before` هستند و در این تغییر دست‌نخورده ماندند.

دسترسی write به GitHub یا checkout دارای `.git` در این محیط موجود نیست؛ بنابراین هیچ commit/push انجام نشد و **اجرای جدید Actions / چراغ سبز APK، NOT VERIFIED**. ZIP تحویلی شامل اصلاح type و تست است، اما تایید نهایی remote CI نیازمند push از سوی دارنده دسترسی است.
