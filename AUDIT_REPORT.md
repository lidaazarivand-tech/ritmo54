# گزارش فنی ممیزی و اصلاح Ritmo

تاریخ: 2026-10-04. ورودی: `ritmo-abi-nahayi18-main.zip`.

## نتیجه و مرز اطمینان

اصلاحات در کد واقعی اجرا شده‌اند؛ نسخه اصلی بدون تغییر نگهداری شد و هیچ فایل
ورودی حذف نشد. تست‌های قابل اجرا و بررسی ساختاری از اصلاحات پشتیبانی می‌کنند،
اما **آمادگی انتشار و بیلد Android تأیید نشده است**. نبود npm، وابستگی‌های
پروژه، اینترنت محیط اجرا، SDK/emulator و JDK 21 اجازه تأیید بیلد کامل را نداد.
نسخه موجود Java 17 فقط برای تست منطق مستقل و parsing کد استفاده شد.

**72 تست Node موفق، صفر شکست و صفر skip**؛ این عدد شامل تست‌های رفتاری،
mock، تست‌های قرارداد سورس و یک تست کامپایل/اجرای واقعی Java است و به معنای
72 تست Android روی دستگاه نیست. گزارش اجرای نهایی داخل بسته شواهد قرار دارد.
سه تست JUnit جدید و چهار تست instrumentation جدید نوشته شدند، ولی در Gradle
اجرا نشده‌اند. دو تست نمونه قدیمی نیز حفظ شدند.

README جدید، این گزارش و شواهد اجرای این نوبت مرجع هستند. گزارش‌های قبلی،
`VALIDATION_RESULTS.json` و `metadata.json` ورودی تاریخی‌اند؛ ادعاهای قدیمی
آن‌ها درباره بیلد، پوسته‌ها، EQ یا قابلیت‌های غیر فعال تأیید این نوبت نیست.

## کشف پروژه و خط مبنا

تمام 123 فایل اولیه فهرست شدند. منابع TypeScript/TSX/CSS، هفت فایل Java
اصلی Android، تست‌ها، فایل‌های Gradle، manifest، XML resources، workflow،
manifests/lockfile و مستندات توسط بررسی‌کنندگان تقسیم‌شده خوانده شدند.
تصاویر و JAR به صورت ساختاری بررسی شدند، نه ممیزی پیکسل یا decompile کامل.
منابع وابستگی‌های npm/Media3 داخل آرشیو موجود نبودند.

ورودی فعال: `src/main.tsx` و `src/RitmoAppClean.tsx`.
معماری: React 19 + TypeScript، Vite/Tailwind، Capacitor 8، Java Android،
MediaStore، Media3 1.5.1 با MediaSessionService و ExoPlayer. مشخصات پروژه:
API 24 حداقل، compile/target API 36، AGP 8.13.0، Gradle 8.14.3.
تنظیمات UI در localStorage، پخش/بوکمارک در SharedPreferences، و فایل‌های
Recently Deleted همراه AtomicFile journal در `noBackupFilesDir` نگهداری می‌شوند.

در خط مبنا، اجرای مستقیم Node 44 تست موفق و دو فایل تست ناموفق در بارگذاری
داشت؛ علت هر دو نبود `@capacitor/core` بود، نه شکست assertion رفتار برنامه.
اسکریپت `npm test` اصلاً وجود نداشت. بیلد Gradle در دانلود distribution
متوقف شد. فایل رنگ‌های مورد اشاره AppTheme نیز موجود نبود.

## ایرادهای تأییدشده و اصلاحات

در جدول زیر «اصلاح سورس» یعنی کد تغییر کرده و روش بررسی مشخص دارد؛ جایگزین
تأیید اجرای Android نیست. هیچ خرابی فرضی صرفاً بر اساس گزارش‌های قدیمی
به عنوان خرابی تأییدشده پذیرفته نشد.

| شدت | علت، فایل و اثر | اصلاح واقعی | شواهد و مرز بررسی |
|---|---|---|---|
| High | `NativeMediaPlugin.deleteSong/performDeleteSong`: توکن بکاپ اختیاری بود؛ فراخوانی مستقیم می‌توانست حذف را بدون نسخه امن آغاز کند. | توکن در Java و TypeScript اجباری شد؛ validation قبل از consent/delete اجرا می‌شود. | تست قرارداد سورس ترتیب را بررسی می‌کند. حذف روی دستگاه NOT VERIFIED. |
| High | `RecentlyDeletedStore.prepare`: شکست کپی یک رکورد `copying` مسدودکننده باقی می‌گذاشت. | rollback با وضعیت پایدار `cancelling`، پاک‌سازی ایمن وقتی اصل موجود است، و recovery در list/prepare. آخرین کپی ناقص با اصل مفقود عمداً حفظ می‌شود؛ حذف دائمی آن فقط با تأیید کاربر و بررسی native مجاز است. | بازبینی مستقل مسیر خطا؛ قطع واقعی کپی و permission failures NOT VERIFIED. |
| High | `RecentlyDeletedStore.restore`: insert پیش از ثبت URI انجام می‌شد؛ مرگ فرایند می‌توانست row گمشده/تکراری بسازد. | نام یکتای عملیات پیش از insert ثبت می‌شود؛ retry آن row را پیدا می‌کند و از ابهام چند row جلوگیری می‌کند. | تست قرارداد سورس؛ process-kill واقعی MediaStore NOT VERIFIED. |
| High | همان restore: شکست write/hash/publish فوراً rollback نمی‌کرد؛ retry هم URI journal را بدون اثبات مالکیت حذف می‌کرد. | rollback با marker، نام و مالک Android یا مسیر اختصاصی قدیمی؛ مقصد صحیح و کامل adopt می‌شود؛ نسخه خصوصی تا تکمیل memberships حفظ می‌شود. | بازبینی مستقل و قرارداد سورس؛ رفتار واقعی MediaStore/IS_PENDING روی APIها NOT VERIFIED. |
| High | `RecentlyDeletedStore.permanent/finishRestore/list`: فایل قبل از commit حذف می‌شد. | فازهای `purging/finalizing/cancelling` قبل از unlink پایدار می‌شوند؛ اجرای بعدی آن‌ها را تکمیل می‌کند. finishRestore hash مقصد را نیز بررسی می‌کند. | قرارداد سورس؛ تست instrumentation برای purge interruption نوشته شده، اجرا نشده. |
| Medium | journal تاریخ بزرگ می‌پذیرفت و جمع retention overflow می‌کرد؛ اعتبار رکوردها ناقص بود. | انقضای saturating، رد ID تکراری و metadata نامعتبر، status validation و بررسی واقعی hash/size پیش از `recoverable:true`. | منطق Java واقعاً کامپایل/اجرا شد؛ instrumentation تاریخ overflow و journal خراب نوشته شده، اجرا نشده. |
| High | `SettingsBackupPlugin`: سه فایل preferences جداگانه با rollback صرفاً در حافظه restore می‌شدند. | AtomicFile rollback journal پیش از commit گروه‌ها؛ بازیابی قبل از فعالیت WebView و سرویس؛ شکست recovery نوشتن بیشتر برنامه را متوقف می‌کند. | بازبینی مستقل و Java syntax؛ kill بین commit گروه‌ها NOT VERIFIED. |
| Medium | export اندروید با `"wt"` می‌توانست document موجود را truncate کند. | برای provider بدون atomic replace، document غیرخالی/اندازه نامعلوم رد می‌شود؛ خروجی جدید read-back و byte verification دارد. | سورس بررسی شد. رفتار SAF providerها و قطع export NOT VERIFIED. فایل جدید ناقص در صورت interruption ممکن است باقی بماند؛ بکاپ قبلی نباید بازنویسی شود. |
| High | `RitmoAppClean`: storage errors در `save()` بلعیده می‌شدند؛ favorites داخل state updater side effect داشت. | خطا قابل مشاهده شد؛ favorites پیش از state save می‌شود؛ writes گروه اصلی UI journal دارند؛ JSON خراب بدون اجازه بازنویسی نمی‌شود. | تست‌های واقعی storage با quota/security-like faults و بازبینی call sites؛ سایر تغییرات UI روی شکست write ممکن است موقتاً در حافظه بمانند و به کاربر هشدار داده می‌شود. |
| Medium | restore memberships دو setItem مستقل داشت؛ شکست دوم باعث وضعیت نیمه‌کاره می‌شد. | favorites/playlists/recent یک rollback transaction می‌گیرند؛ حذف private copy بعد از آن است. | تست رفتاری شکست write دوم، journal failure، crash-recovery fixture و rollback failure موفق. |
| Medium | hidden-library detach موفق و state read ناموفق فقط local tombstone را rollback می‌کرد. | شکست detach rollback می‌شود؛ پس از detach موفق، شکست state فقط reconcile و خطا می‌دهد، نه rollback نیمه عملیات. | بازبینی مستقل؛ bridge disconnect واقعی NOT VERIFIED. |
| Medium | mute از backup allowlist/snapshot/apply حذف شده بود. | boolean mute در validate، snapshot، restore و effective output وارد شد؛ بکاپ قدیمی بدون mute همچنان پذیرفته می‌شود. | round-trip و rejection غیرboolean اجرا شد؛ audio output روی Android NOT VERIFIED. |
| High | `RitmoPlaybackService.persistQueue`: controller بدون localConfiguration، URI آهنگ تازه را خالی ذخیره می‌کرد. | URI در metadata extras حمل می‌شود؛ fallback فقط URI شناخته‌شده است؛ array ناقص publish نمی‌شود. queue save failure به API/UI برمی‌گردد. | قرارداد سورس و بازبینی مستقل؛ IPC/Media3 device behavior NOT VERIFIED. |
| High | restore صف، موقعیت آهنگ قبلی را برای current ID مفقود استفاده می‌کرد و entry غیرقابل‌دسترسی را بی‌خبر حذف می‌کرد. | match current ID و queueIndex ذخیره می‌شود؛ mismatch از صفر؛ position clamp و float/repeat validation. URI موقتاً غیرقابل دسترس در صف می‌ماند و خطای موجود پخش به UI می‌رسد. queryهای sync هنگام startup حذف شدند. | تست واقعی Java حدود position/URI؛ قرارداد سورس queueIndex و restore guard. دوام resume/notification روی دستگاه NOT VERIFIED. |
| High | queue JSON خراب پس از restore failure می‌توانست با صف خالی onDestroy بازنویسی شود. | guard مشترک جلوی events/destruction/deleted-track cleanup را می‌گیرد؛ فقط replacement کامل و معتبر می‌تواند repair کند. | قرارداد سورس و بازبینی مستقل. |
| Medium | queue mutation پیش از persistence باعث live/durable divergence روی شکست write می‌شد. | play و تمام modifyQueue actions ابتدا candidate کامل را persist می‌کنند، سپس command واقعی Media3 را اجرا می‌کنند؛ طراحی کنترل‌ها عوض نشده. | تست قرارداد ترتیب و بازبینی مستقل. همزمانی system-controller/IPC failure پس از commit NOT VERIFIED. |
| Medium | native saveBookmark/setPlaybackMode و playback preferences موفقیت را بدون نتیجه write گزارش می‌کردند. | validation و commit-result handling؛ شکست save در API رد/در UI مشاهده می‌شود. | قرارداد سورس؛ failure واقعی filesystem روی Android NOT VERIFIED. |
| High | play/add/next/video URI دلخواه می‌پذیرفتند. | validator مشترک MediaStore audio/video با ID agreement، بدون query/fragment، و validation مجدد video activity. | 16 assertion واقعی Java شامل URI تهی، نامرتبط، mismatch و unsafe scheme. |
| Medium | service exported بدون مجوز controller بود؛ cleartext/mixed content باز بود. | own UID یا controller trusted برای session؛ HTTP و mixed content خاموش. export برای media-system compatibility حفظ شد. | سورس و manifest بررسی شد. API دقیق Media3 1.5.1 و Bluetooth compatibility به دلیل نبود dependency JAR/build NOT VERIFIED؛ current Android docs API را معرفی می‌کند. |
| Build blocker | `styles.xml` به سه color غیرموجود اشاره داشت. | `res/values/colors.xml` اضافه شد، با رنگ‌های سازگار با طراحی موجود. | XML inventory و parse موفق؛ Android resource linking NOT RUN. |
| Medium | browser active app هیچ مسیر import نداشت؛ README قابلیت‌های inactive را تبلیغ می‌کرد. | file picker صوتی کوچک در رابط فعال، stable IDs، audio error feedback و revoke object URLs؛ README مسیر فعال/قدیمی را تفکیک می‌کند. | syntax/source review؛ تست browser render/playback واقعی NOT VERIFIED. |
| Medium | اسکریپت test و workflow checks ناقص بودند. | test command بدون dependency جدید، typecheck/Node tests و Gradle test به CI اضافه شد؛ wrapper executable شد. | Node مستقیم اجرا شد؛ workflow YAML parse و paths بررسی شدند؛ اجرای GitHub Actions NOT RUN. |

## تغییرات و حفظ فایل‌ها

25 فایل محتوایی ایجاد/اصلاح شد؛ executable bit فایل `android/gradlew` نیز
اصلاح شد. `package-lock.json` و dependency specifications دست‌نخورده‌اند.
هیچ source، asset، test قبلی، گزارش ورودی یا user-data file حذف نشده است.

فایل‌های native تغییر یافته:
`RecentlyDeletedStore.java`, `NativeMediaPlugin.java`, `RitmoPlaybackService.java`,
`SettingsBackupPlugin.java`, `MainActivity.java`, `RitmoVideoActivity.java`,
فایل جدید `RecoveryPolicy.java`، `AndroidManifest.xml` و `colors.xml`.

فایل‌های frontend/config:
`src/RitmoAppClean.tsx`, `src/components/PlayerSettings.tsx`,
`src/utils/nativeMedia.ts`, `src/utils/settingsBackup.ts`,
فایل جدید `src/utils/storageTransaction.ts`, `capacitor.config.ts`,
`package.json`, `.github/workflows/android-apk.yml`, `README.md`.

تست‌های جدید:
`tests/recovery-regressions.test.mjs`,
`android/app/src/test/java/com/adelapp/larkplayer/RecoveryPolicyTest.java`,
`android/app/src/androidTest/java/com/adelapp/larkplayer/RecoveryJournalTest.java`.
این گزارش نیز به ریشه اضافه شد.
سه فایل `android/build.gradle`، `index.html` و
`src/components/EqualizerModal.tsx` فقط برای حذف trailing whitespace/blank
EOF قدیمی اصلاح شدند تا staging اولیه نیز `diff --check` تمیز داشته باشد؛
منطق آن‌ها تغییر نکرد.

## نتایج اجرا

| بررسی | نتیجه واقعی |
|---|---|
| خط مبنای Node | 44 موفق؛ 2 فایل در module loading مسدود |
| Node نهایی، بدون mock کردن Capacitor package | 72 موفق، 0 شکست، 0 skip |
| Java policy | یک Node test که منبع واقعی `RecoveryPolicy.java` را کامپایل و 16 assertion را اجرا می‌کند |
| TypeScript/TSX syntax | 33 فایل با esbuild cache ابزار محیط parse شد؛ نسخه ابزار cache با dependency پروژه یکسان نیست؛ این production build نیست |
| Java syntax | 12 فایل اصلی/تست parse شد؛ import resolution/typecheck/linking انجام نشده |
| XML و workflow YAML | parse موفق؛ schema/اجرای workflow و resource linking تأیید نشده |
| npm ci/lint/test/build | NOT RUN: npm موجود نیست؛ npx و وابستگی‌های پروژه نیز موجود نیستند |
| TypeScript project typecheck | BLOCKED: `vite/client` وجود ندارد؛ cached TypeScript فقط مانع dependency را گزارش کرد |
| cap sync android | NOT RUN: npx/Capacitor CLI dependencies موجود نیستند |
| Gradle test/assembleDebug | NOT RUN: distribution قابل دانلود نبود؛ wrapper گزارش UnknownHost داد، یک تلاش با محدودیت زمانی خاتمه یافت |
| JUnit/instrumentation روی Android | NOT RUN؛ 3 unit test و 4 instrumentation test جدید باقی است |
| APK/release signing | NOT RUN؛ هیچ APK تحویل یا upload نشد |

اسکریپت‌های اصلی مورد نیاز:

```bash
npm ci
npm run lint
npm test
npm run build
npx cap sync android
cd android
./gradlew test
./gradlew assembleDebug
./gradlew connectedDebugAndroidTest
```

برای Git و دستورهای دقیق upload به بخش GitHub در [README](README.md) مراجعه
کنید. انجام commit/push فقط به انتخاب و احراز هویت خود کاربر است.

## چک‌لیست GitHub

PASSهای زیر بررسی محلی مشخص‌اند، نه گواهی build یا SCA/security کامل.

| Check | Result |
|---|---|
| Git repository integrity | PASS: init محلی، بدون nested .git/submodule؛ fsck موفق برای repository بدون commit |
| `.gitignore` | PASS: dependencies/build/local secrets ignored؛ source، assets، lockfile و wrapper ignored نیستند |
| Large file scan | PASS: هیچ فایل >50MB یا >100MB؛ بزرگ‌ترین فایل ورودی حدود 1.27MB |
| Secret scan | PASS برای pattern scan محلی؛ هیچ secret واقعی تشخیص داده نشد؛ اعتبارنامه خارجی و binary semantic scan NOT VERIFIED |
| Filename/path validation | PASS: بدون case collision، broken symlink یا filename ناسازگار شناسایی‌شده |
| Git staging validation | PASS: source files staged، cached diff check موفق، wrapper mode 100755 |
| Dependency consistency | PASS فقط برای تطبیق کامل 15 production و 9 dev root dependency با lock؛ npm ci/registry resolution NOT RUN |
| Fresh clone validation | NOT RUN: commit/remote وجود ندارد و مجوز commit/push داده نشده؛ staged-tree export و تست آن جداگانه بررسی شد |
| npm build | NOT RUN |
| Android debug build | NOT RUN |
| Automated tests | PASS: 72 Node tests؛ Android tests NOT RUN |

Local Git staging انجام شد، ولی هیچ commit یا push انجام نشده است.
ZIP نهایی عمداً `.git`، dependencies، APK، cache یا اطلاعات machine-specific
را ندارد. ریشه قابل upload پوشه‌ای است که `package.json` و `android/` دارد.
Gradle wrapper JAR از نظر ZIP CRC و Main class صحیح است؛ provenance یا
distribution checksum آن با upstream تأیید نشده است.

## بازبینی مستقل و محدودیت‌های باقی‌مانده

بررسی‌کننده مستقل diffها را با نسخه اصلی مقایسه و تست Node را اجرا کرد.
ایرادهای جدید مثل restored-original بدون hash، overwrite صف در onDestroy،
stale storage error پس از restore و mutation-before-save در بازبینی رفع شدند.
تست source-contract صرفاً ترتیب کد را کنترل می‌کند؛ به عنوان اجرای واقعی
MediaStore یا recovery پس از قتل فرایند معرفی نمی‌شود.

موارد مهم برای انتشار:

1. **High، مرز معماری:** restore پشتیبان هنوز یک distributed crash-atomic
   transaction بین localStorage، SharedPreferences و live playback نیست.
   هر store recovery خود را دارد و خطاهای درون فرایند rollback می‌شوند؛
   process death بین storeها می‌تواند snapshotهای مخلوط ایجاد کند. این
   محدودیت پنهان یا به عنوان کاملاً رفع‌شده اعلام نشده است.
2. **Android runtime NOT VERIFIED:** consent حذف در API 24/28/29/30/33/36،
   MediaStore owner columns، orphan marker lookup، publish failure، SAF provider
   behavior، hash/read failure، revoke permission و process death باید با فایل‌های
   تست اجرا شوند. روی موسیقی واقعی بدون نسخه مستقل backup تست نکنید.
3. **Playback NOT VERIFIED:** Bluetooth/headset/lockscreen، audio focus/ducking،
   Android 13 notification permission، foreground-service restrictions،
   disconnect/reconnect و lifecycle/position persistence هنوز تست دستگاه ندارند.
4. **Performance NOT VERIFIED:** hash کردن backupها روی executor است، نه UI
   thread، اما کتابخانه trash بزرگ می‌تواند refresh را کند کند. preference
   commit در player callbacks و queue serialization به profiling دستگاه نیاز دارد.
5. legacy interrupted restore بدون marker خودکار حذف نمی‌شود. اصل مفقود با
   partial copy حفظ می‌شود؛ byte-perfect recovery قابل تضمین نیست. برنامه
   اجازه حذف دائمی آگاهانه می‌دهد، نه حذف خاموش داده‌ها.
6. Web audio import فقط session-local است؛ metadata/media files به صورت
   library database جدید بازنویسی نشده‌اند. تست browser UI، accessibility
   runtime و performance هنوز NOT VERIFIED.
7. dependency advisory/SCA، provenance wrapper، release keystore، workflow
   run و availability دقیق نسخه‌های registry بدون شبکه NOT VERIFIED.
8. هیچ TODO/debug placeholder به جای قابلیت واقعی اضافه نشده است. نمونه
   تست‌های اولیه و فایل `git` خالی اولیه حفظ شدند؛ فایل خالی، `.git` نیست.

## شواهد تحویل

بسته شواهد شامل logs تست خط مبنا/نهایی، موانع npm/Gradle، Java syntax check،
scan امنیت/فایل، inventory و hash فایل‌ها، Git staging/ignore/fsck و نتیجه
اجرای تست روی staged export است. ZIP پروژه فقط سورس و تنظیمات لازم را دارد.

تنها مرجع عمومی استفاده‌شده برای توضیح policy کنترل session:
[Android MediaSession.ControllerInfo](https://developer.android.com/reference/androidx/media3/session/MediaSession.ControllerInfo).
این مستند فعلی به تنهایی جای compile نسخه دقیق Media3 1.5.1 نیست.
