# گزارش اصلاحات محدود Player در Ritmo

تاریخ: ۲۰۲۶/۱۰/۰۲

این گزارش فقط مربوط به اصلاحات این تحویل است. گزارش‌های قبلی موجود در پروژه، گزارش این نسخه نیستند.

## روش بررسی و حدود اعتبار نتایج

مسیر فعال قبل از تغییر شناسایی شد: `index.html → src/main.tsx → src/RitmoAppClean.tsx`.
Player فعال همان تابع `Player` در `RitmoAppClean.tsx` است و ظاهر دستگاه‌ها از `PlayerSkins.tsx` و `PlayerSkins.css` می‌آید.
`src/App.tsx` و Playerهای قدیمی مسیر اجرا نیستند و تغییر نکردند.

در این محیط اینترنت در دسترس نیست و وابستگی‌های دقیق پروژه، npm، Vite و بسته‌های Capacitor نصب نیستند. بنابراین هیچ نصب یا تغییر dependency انجام نشد.
برای تست رابط، کد واقعی مسیر فعال با ابزار موجود محیط به یک **بسته آزمایشی مجزا** تبدیل شد؛ فقط مرز ارتباط با Capacitor/Android شبیه‌سازی شد.
رندر، تعامل‌ها، CSS پوسته‌ها و انتخاب وضعیت مشترک از کد اصلاح‌شده هستند، اما فایل‌های صوتی و MediaStore واقعی اندروید نیستند.
برای کلاس‌های utility در بسته آزمایشی از Tailwind 3.4.18 موجود محیط استفاده شد، نه Tailwind 4 پروژه. CSS اختصاصی Player و Settings بدون تغییر وارد تست شد.
به همین دلیل تست مرورگر، جای Build اصلی Vite، Android WebView یا تست گوشی واقعی را نمی‌گیرد.
ابزار تست، داده نمونه، declarationهای آزمایشی و شبیه‌سازها وارد ZIP پروژه نشده‌اند.

## ۱. تغییرات انجام‌شده

* حالت پخش به یک دکمه آیکونی چرخه‌ای تبدیل شد: Normal → Shuffle → Repeat Song → Repeat Queue → Normal.
* آیکون‌های چهار حالت متفاوت‌اند: `ListStart`، `Shuffle`، `Repeat1` و `Repeat`. حالت‌های غیرعادی با رنگ/قاب فعال مشخص می‌شوند؛ نام حالت در عنوان دکمه و وضعیت قابل‌خواندن برای screen reader موجود است.
* منطق اصلی `modeFlags`، `setModes`، `queueStep` و `shuffleQueue` تغییر نکرد.
* بالای Player فقط سه کنترل با ترتیب منطقی RTL قرار دارد: Favorite، Theme و Speed.
* متن «در حال پخش» از Player حذف شد؛ آیکون سرعت به Gauge/Speedometer تبدیل شد و گزینه‌ها و منطق سرعت قبلی باقی ماند.
* کاست: بدنه لایه‌دار، لبه ضخیم، پیچ فلزی، پنجره شیشه‌ای، حلقه نوار، Hubهای طبیعی‌تر و سایه‌های محدود اضافه شد. کاور در محدوده Label و کمی بزرگ‌تر است.
* Vinyl: Platter فلزی، شیارهای صفحه، انعکاس محدود، کاور مرکزی بزرگ‌تر، Spindle و Tonearm دارای عمق ایجاد شد.
* رادیو: بافت بدنه، Grill بافته‌شده، قاب نمایشگر، شیشه نمایشگر، Tuner و ولوم‌های دارای عمق اصلاح شد.
* Reelها، Vinyl و Waveform فقط هنگام پخش حرکت می‌کنند و هنگام Pause در همان وضعیت متوقف می‌شوند؛ Tonearm با وضعیت پخش تغییر می‌کند. کاهش حرکت سیستم نیز رعایت شده است.
* Dropdown کوچک پوسته از Player حذف و پنل اختصاصی دارای سه Preview واقعی جایگزین شد.
* در صفحه «تنظیمات → پوسته» همین کامپوننت Preview نمایش داده می‌شود. گزینه‌های قبلی رنگ‌بندی برنامه هم حفظ شده‌اند.
* انتخاب Player و Settings از همان `playerSkin` و همان کلید `ritmo_player_skin` استفاده می‌کند؛ سیستم ذخیره‌سازی جدا ساخته نشد.
* بزرگ/کوچک شدن کاور با Expanded حذف شد. Expanded فقط حالت چیدمان است، نه Zoom. ورود پوسته هم انیمیشن Zoom یا جابه‌جایی کاور ندارد.
* بستن Player و تغییر چیدمان Expanded به پایین منتقل شدند تا بالای Player فقط سه آیکون خواسته‌شده باشد.
* در مسیر فعال، کنترل مستقل برای تغییر «اندازه نمایش Volume» یافت نشد. کنترل واقعی Volume و Mute عیناً حفظ شدند و کنترل اضافی جدیدی ساخته نشد.
* Sort «تاریخ اضافه شدن» با دو جهت «جدیدترین» و «قدیمی‌ترین» اضافه شد.
* زمان از `MediaStore.DATE_ADDED` فقط خوانده و از ثانیه به میلی‌ثانیه تبدیل می‌شود؛ تاریخ فایل و Metadata آهنگ نوشته یا تغییر داده نمی‌شود.
* آهنگ فاقد تاریخ معتبر، در هر دو جهت در انتهای نتیجه قرار می‌گیرد؛ تاریخ فرضی ایجاد نشده است.
* با تأیید جداگانه کاربر، فقط مقدار `added` به اعتبارسنجی Sort در Backup اضافه شد تا Sort جدید پشتیبان‌گیری را خراب نکند.

## ۲. فایل‌های تغییرکرده

دقیقاً هفت فایل از نسخه ورودی تغییر کرده‌اند:

1. `src/RitmoAppClean.tsx`
2. `src/components/PlayerSkins.tsx`
3. `src/components/PlayerSkins.css`
4. `src/components/PlayerSettings.tsx`
5. `src/utils/nativeMedia.ts`
6. `android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java`
7. `src/utils/settingsBackup.ts`

## ۳. فایل‌های اضافه‌شده

1. `tests/player-scope.test.mjs`: پانزده تست Sort و کنترل‌های Scope، بدون dependency جدید.
2. `tests/sort-backup.test.mjs`: دو تست سازگاری Sort جدید با اعتبارسنجی و بازیابی Backup.
3. `PLAYER_SCOPE_REPORT_FA.md`: همین گزارش تحویل.

## ۴. فایل‌های حذف‌شده

هیچ فایل پروژه حذف نشده است.
UI حذف‌شده فقط Dropdown قدیمی حالت پخش، Dropdown ساده پوسته، متن بالای Player و رفتار تغییر اندازه کاور است.
هیچ قابلیت صوتی، Library، Playlist، Restore یا Storage حذف نشده است.

## ۵. دلیل تغییر هر فایل

| فایل | دلیل مستقیم |
| --- | --- |
| `RitmoAppClean.tsx` | کنترل آیکونی حالت پخش، آیکون Speed، ترتیب سه کنترل، اتصال پنل پوسته، حفظ Expanded بدون Zoom، بستن پنل پوسته قبل از Player با Back، افزودن Sort و اتصال `addedAt` |
| `PlayerSkins.tsx` | جزئیات فیزیکی هر سه دستگاه و کامپوننت مشترک Preview برای دو ورودی Settings/Player، مدیریت Dialog و بازگشت Focus |
| `PlayerSkins.css` | عمق و جنس دستگاه‌ها، توقف/حرکت مکانیزم‌ها، چیدمان Responsive و حذف وابستگی اندازه کاور به Expanded |
| `PlayerSettings.tsx` | نمایش Preview واقعی سه پوسته با همان state موجود؛ حفظ انتخاب رنگ‌بندی برنامه و سایر صفحات Settings |
| `nativeMedia.ts` | تعریف فیلد اختیاری `addedAt` در پاسخ Scan |
| `NativeMediaPlugin.java` | فقط افزودن `DATE_ADDED` به انتهای projection و پاسخ Scan؛ ایندکس‌های فعلی Artwork و Metadata حفظ شدند |
| `settingsBackup.ts` | فقط افزودن یک مقدار مجاز `added` در همان فهرست Sort، با تأیید صریح کاربر؛ هیچ تغییر دیگری در Backup/Restore |

## ۶. تعداد و نتیجه تست‌ها

**آخرین دور تست: ۷۶ تست موفق، صفر تست ناموفق.**

### تست‌های Node: ۳۷ موفق

* ۸ تست موجود Playback Mode و Queue.
* ۷ تست موجود Settings، Hidden/Deleted محلی و رنگ‌بندی.
* ۵ تست موجود Backup و ترجیحات Player.
* ۱۵ تست جدید Scope در `player-scope.test.mjs`.
* ۲ تست جدید Sort/Backup در `sort-backup.test.mjs`.

۳۰ تست Playback/Settings/Scope بدون شبیه‌سازی Capacitor اجرا شدند.
۷ تست Backup با یک Loader صرفاً آزمایشی اجرا شدند که فقط `isNativePlatform=false` و registration بدون عملیات Native را فراهم می‌کند.
منطق واقعی create/validate/restore در JavaScript اجرا شد، ولی Export/Import فایل اندروید یا SharedPreferences واقعی اجرا نشد.

فرمان اجرای کامل در محیطی با dependencyهای اصلی و Node 22:

```sh
node --experimental-strip-types --test tests/*.test.mjs
```

### تست‌های مرورگر: ۳۹ موفق

* ۱۸ تست Responsive: سه پوسته × سه اندازه × دو حالت Normal/Expanded.
* چرخه چهار حالت، چهار آیکون متفاوت و ارسال فرمان Mode به مرز Native: یک تست.
* ترتیب RTL سه کنترل، Favorite و ورودی Speed: یک تست.
* حرکت و توقف مکانیزم هر سه پوسته: سه تست.
* Previewها، انتخاب پوسته و اشتراک وضعیت Settings/Player: یک تست.
* Escape و بازگشت Focus: یک تست.
* Back اندروید شبیه‌سازی‌شده، بستن پنل پوسته بدون بستن Player: یک تست.
* هماهنگی Tonearm با Play/Pause: یک تست.
* ثابت ماندن اندازه کاور هنگام Expanded: یک تست.
* ذخیره هر سه پوسته از هر دو ورودی پس از Reload: شش تست.
* Responsive پنل Player و صفحه Settings: سه تست.
* Sort جدیدترین/قدیمی‌ترین، جستجو و ذخیره Sort: یک تست.
* ورودی Next/Previous، Seek، Volume، Mute و باز شدن Queue: یک تست.

### بررسی تکمیلی

کامپایل بسته آزمایشی با esbuild موفق بود؛ این **Build اصلی پروژه نیست**.
TypeScript مسیر فعال با تنظیمات و declarationهای آزمایشی خارج از پروژه موفق بود؛ این **Lint اصلی پروژه نیست**.
عدم تغییر فایل‌های محافظت‌شده با مقایسه بایت‌به‌بایت با نسخه استخراج‌شده اولیه بررسی شد.
manifest و lockfile از نظر نسخه و مجموعه dependencyها با هم تطبیق داده شدند.

## ۷. تست‌هایی که اجرا نشدند یا کامل نشدند

| مورد | وضعیت و دلیل |
| --- | --- |
| `npm run build` اصلی Vite | **NOT RUN**؛ npm و dependencyهای اصلی نصب نیستند و محیط اینترنت ندارد |
| `cap sync android` | **NOT RUN**؛ Capacitor پروژه نصب نیست |
| Gradle / APK / AAB | **NOT RUN**؛ dependencyهای پروژه و Android SDK لازم موجود نیست؛ JDK محیط 17 است، Workflow از 21 استفاده می‌کند |
| GitHub Actions واقعی | **NOT RUN**؛ به اجرای CI این repository متصل نیستیم و چیزی Push نشده است |
| Lint اصلی با tsconfig پروژه | تکمیل نشد؛ اجرای compiler موجود به‌دلیل نبود typeهای `vite/client` متوقف شد، نه خطای تأییدشده در کد |
| Android WebView و گوشی واقعی | **NOT RUN** |
| صوت واقعی Play/Pause/Next/Previous/Speed/Seek | **NOT RUN**؛ مرورگر فقط ورودی و ارسال فرمان به شبیه‌ساز را تست کرده است |
| Background Playback، Notification و Media Session واقعی | **NOT RUN**؛ فایل‌های مربوط تغییر نکردند، اما تست دستگاه انجام نشده است |
| Scan واقعی MediaStore و تاریخ واقعی دستگاه | **NOT RUN**؛ منبع و ایندکس‌های projection در کد بررسی شدند |
| Queue واقعی سرویس Android و انتهای آهنگ | **NOT RUN**؛ الگوریتم JS و UI/ارسال فرمان بررسی شدند |
| Recently Deleted واقعی، حذف/بازیابی فایل، Retention | **NOT RUN**؛ تست State محلی جای عملیات Android نیست |
| فایل Backup/Restore واقعی اندروید | **NOT RUN**؛ فقط منطق اعتبارسنجی/بازیابی داده با Storage آزمایشی اجرا شد |
| Playlist روی دستگاه و مجوزهای Hidden Files | **NOT RUN**؛ مسیرهای مربوط تغییر نکردند |

هیچ مورد اجرا‌نشده‌ای به عنوان تست موفق یا Build موفق اعلام نشده است.

## ۸. وضعیت Responsive هر سه Theme

اندازه‌های مرورگر:

| اندازه | ابعاد |
| --- | --- |
| کوچک | 320 × 568 |
| متوسط | 390 × 844 |
| بزرگ | 430 × 932 |

| پوسته | Normal در سه اندازه | Expanded در سه اندازه |
| --- | --- | --- |
| Cassette | PASS در محیط آزمایشی مرورگر | PASS در محیط آزمایشی مرورگر |
| Gramophone / Vinyl | PASS در محیط آزمایشی مرورگر | PASS در محیط آزمایشی مرورگر |
| Retro Radio | PASS در محیط آزمایشی مرورگر | PASS در محیط آزمایشی مرورگر |

در تست‌ها عرض Scroll با عرض Container، قرارگیری دستگاه داخل Stage، قرارگیری کاور داخل قاب، عدم برخورد کنترل‌ها و خروج‌نکردن از عرض بررسی شد.
در گوشی کوتاه، Player امکان Scroll **عمودی** دارد تا کنترل‌های پایین قابل دسترسی باشند؛ Scroll افقی یا بریدگی کنترل ایجاد نشد.
پنل Preview از Player و صفحه Preview Settings هم در هر سه اندازه بررسی شدند.
هر سه پوسته در 390 × 844 جداگانه بازبینی تصویری شدند.
این نتایج مربوط به مرورگر آزمایشی با محدودیت‌های ابتدای گزارش هستند؛ تأیید نهایی Android WebView هنوز لازم است.

## ۹. وضعیت Playback Mode

PASS در تست الگوریتم JS و UI مرورگر:

| حالت | آیکون | رفتار موجود |
| --- | --- | --- |
| Normal | ListStart | بدون Shuffle، بدون Repeat |
| Shuffle | Shuffle | Shuffle با Repeat خاموش |
| Repeat Song | Repeat1 | تکرار یک آهنگ |
| Repeat Queue | Repeat | تکرار صف |

چهار حالت با لمس یک دکمه چرخه می‌شوند؛ مقدار فرمان Native همان قرارداد قبلی 0، 1، 2 و 3 است.
فایل `src/utils/playbackMode.ts` و منطق Queue اصلی تغییر نکرده‌اند.
رفتار صوتی چهار حالت روی Android: **NOT RUN**.

## ۱۰. وضعیت Queue

هیچ بازنویسی Queue، Shuffle traversal یا الگوریتم Next/Previous انجام نشد.
هشت تست موجود شامل مرز Normal، تکرار آهنگ، تکرار صف، صف خالی/تک‌عضوی و Shuffle traversal موفق‌اند.
ورودی باز کردن Queue و ارسال فرمان Next/Previous در مرورگر موفق بود.
سرویس Native پخش، ترتیب واقعی Queue روی Android و انتقال هنگام پایان آهنگ: **NOT RUN**.

## ۱۱. وضعیت Recently Deleted

منطق حذف، Recoverable copy، Restore، Permanent Delete و Retention تغییر نکرد.
تغییر Java فقط در متد خواندن Scan است؛ بخش‌های Trash دست‌نخورده‌اند.
تست‌های State محلی مرتبط با حذف/بازیابی و reopen موجود موفق‌اند.
حذف یا Restore واقعی فایل دستگاه: **NOT RUN**؛ سالم‌بودن کامل عملیات Native ادعا نمی‌شود.

## ۱۲. وضعیت Sort

«تاریخ اضافه شدن»، «جدیدترین» و «قدیمی‌ترین» در UI موجود هستند.
Sort بر اساس زمان ثبت رسانه در MediaStore است، نه تاریخ آخرین ویرایش فایل.
این زمان لزوماً زمان شروع دانلود نیست؛ مبنا زمان اضافه‌شدن/فهرست‌شدن رسانه توسط Android است.
در داده فاقد `DATE_ADDED` معتبر، آهنگ به آخر لیست می‌رود و تاریخ جعلی ذخیره نمی‌شود.
Sort فقط نتیجه نمایش را مرتب می‌کند؛ Queue و ترتیب دستی Playlist بازنویسی نشده‌اند.
تست ترتیب دو جهت، تاریخ نامعتبر/ناموجود، tie-break، Search و حفظ ترتیب Playlist موفق بود.
گزینه و جهت Sort در کلیدهای قبلی ذخیره می‌شوند و تست اعتبارسنجی/بازیابی Backup برای هر دو جهت موفق است.
خواندن DATE_ADDED از دستگاه واقعی: **NOT RUN**.

## ۱۳. وضعیت package.json و package-lock.json

هر دو فایل **بایت‌به‌بایت بدون تغییر** هستند.
نسخه هر دو `1.1.2` است و مجموعه dependencies و devDependencies با Root lockfile تطبیق دارد.
هیچ dependency، script یا version تغییر یا اضافه نشده است.
پکیج‌ها در این محیط نصب نشدند؛ موفقیت `npm ci` ادعا نمی‌شود.
`capacitor.config.ts`، `vite.config.ts`، `tsconfig.json`، Gradle، Java version تنظیم‌شده CI و Application ID تغییر نکردند.

## ۱۴. وضعیت GitHub Actions

Workflow ورودی بایت‌به‌بایت حفظ شد.
ادعای موفق‌بودن Actions قبلی، اطلاعات اعلام‌شده کاربر است؛ اجرای تازه یا وضعیت آنلاین آن در این تحویل بررسی نشده است.
Workflow همچنان Node 22، Java 21، Android SDK 36 و مسیرهای Build/Upload قبلی را دارد.
هیچ Workflow، Gradle، Capacitor، Node setting یا dependency برای این UI تغییر نکرد.

در ZIP هیچ `node_modules`، `dist`، build output، APK، AAB، keystore، داده شبیه‌ساز یا فایل محیط تست اضافه نشده است.
هیچ secret یا credential جدیدی اضافه نشد. Gradle wrapper موجود پروژه حفظ شده است.

## ۱۵. آیا تغییر خارج از Scope انجام شد؟

**خیر.** تنها استثنای توافق‌شده، افزودن یک مقدار مجاز Sort در `settingsBackup.ts` بود که کاربر جداگانه تأیید کرد.
Home، سایر بخش‌های Library، Playlist، Notification، Background Playback، Media Session، مجوزهای Android Storage، Trash و فایل‌های Build دست‌نخورده‌اند.
رنگ‌بندی سراسری برنامه تغییر نکرد و قابلیت رنگ‌بندی قبلی Settings حذف نشد.

### UNRELATED ISSUE FOUND

بازبینی خودکار تصویر، هشدار خوانایی برای برخی متن‌های ریز/کم‌رنگ Library (مانند مدت آهنگ و متن ثانویه) نشان داد.
این هشدار، بررسی کامل استاندارد دسترس‌پذیری نیست؛ خارج از Scope است و هیچ اصلاحی برای آن انجام نشد.
مشکل عملکردی خارج از Scope دیگری در بررسی محدود حاضر به‌طور قطعی تأیید نشد.

## وضعیت نهایی

**NOT READY**

علت دقیق: Build اصلی Vite، Sync/Build اندروید، GitHub Actions جدید و تست واقعی سرویس پخش/Storage روی Android اجرا نشده‌اند.
۷۶ تست موفق، شواهد اصلاحات کد و رابط در محیط آزمایشی‌اند؛ تضمین Build یا Regression کامل روی دستگاه نیستند.
برای اعلام GITHUB READY، پروژه باید با dependencyهای قفل‌شده در محیط CI موجود Build شود و تست‌های Native ذکرشده انجام شوند.
