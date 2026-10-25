# گزارش رفع چهار ایراد ریتمو

## یافته‌ها و ریشهٔ ایرادها

### ۱) نام‌گذاری لیست پخش
مسیر ساخت، یک `<dialog>` معمولی و فرم RTL است، نه bottom sheet. در مسیر «افزودن آهنگ به لیست پخش»، لایهٔ انتخاب لیست باز می‌ماند هم‌زمان با بازشدن فرم ساخت؛ این حالت دو لایهٔ روی‌هم می‌سازد. Activity هم `windowSoftInputMode` را تعیین نکرده بود، در حالی که فرم بلافاصله input را focus می‌کند و `MainActivity` برای IME inset جداگانه اعمال می‌کند. این ترکیب می‌تواند باعث overlay/viewport نامناسب شود. پنل فرم حالا محدود، تیره و دارای backdrop است، picker پیش از آن بسته می‌شود، `adjustResize` فعال شده، و submit در هر بار بازبودن فرم فقط یک playlist می‌سازد. لغو نام را پاک می‌کند و هیچ playlist اضافه نمی‌کند. رنگ صفحه‌کلید Gboard تحت کنترل تم خود اندروید/Gboard است، نه CSS برنامه؛ روی دستگاه واقعی هنوز باید بررسی شود که بخش سفید مشاهده‌شده، خود صفحه‌کلید بوده یا سطح اپ.

### ۲) متن ترانه و جست‌وجوی آنلاین
عنوان/هنرمند نمونهٔ ارسالی شامل پسوند سایت (`Www.ArdabilMusic.Com`) بود. این اطلاعات هم در فیلدهای قابل‌دیدن فرم و هم در lookup دقیق به‌کار می‌رفت و باعث می‌شد نام فایل با نام کاتالوگ یکی نباشد. نرمال‌سازی provider از قبل تا حدی در کد بود؛ اما فیلدهای نمایشی هنوز مقدار خام را نشان می‌دادند. حالا پسوند دامنه پیش از نمایش، lookup و تطبیق پاک می‌شود، بدون تغییر نام اصلی در کتابخانه.

**آزمون واقعی سرویس:** LRCLIB برای جست‌وجوی دقیق «Yar Yar + Adel Azarivand» یک آرایهٔ خالی برگرداند. جست‌وجوی فقط «Yar Yar» چند نسخه از هنرمندان دیگر برگرداند، بنابراین برنامه نباید آن‌ها را به این آهنگ نسبت دهد. برای کنترل مثبت، lookup دقیق مستندشدهٔ «I Want to Live / Borislav Slavov / Baldur’s Gate 3 / 233s» پاسخ واقعی با `plainLyrics` و LRC زمان‌دار برگرداند. این ثابت می‌کند سرویس و schema زنده‌اند، نه اینکه آهنگِ نمونه در کاتالوگ موجود باشد. در نبود نتیجهٔ مجاز، برنامه متن نمی‌سازد.

### ۳) نوار پیمایش اندروید و اسکرول پخش‌کننده
`MainActivity` از قبل system bars و IME inset را روی میزبان WebView مصرف می‌کرد؛ بنابراین علت، نبود کامل inset در Java نبود. اما در پوستهٔ Nocturne ریشهٔ fullscreen `overflow:hidden` و shell با `height:100%`/`min-height:0` داشت، و SVG بزرگ seek از `touch-action:none` استفاده می‌کرد. پس صفحه در همان ناحیهٔ بزرگ اجازهٔ gesture عمودی نمی‌داد و محتوای بلند clip می‌شد. حالا ریشه اسکرول عمودی دارد، shell می‌تواند از viewport بلندتر شود، SVG اجازهٔ pan عمودی می‌دهد و فقط مسیر باریک seek gesture را می‌گیرد. برای Reference skins نیز ریشهٔ player عمودی scrollable شد. dock پایین از padding اضافهٔ ۳۰px که با موقعیت console تداخل داشت به inset واقعی/حداقل ۱۲px برگشت؛ فاصلهٔ console با ارتفاع dock هماهنگ شد. `adjustResize` نیز هم‌زمان صفحه‌کلید را به‌درستی resize می‌کند.

### ۴) ترتیب آهنگ‌ها
مقایسه‌گر قبلی برای حالت `recent` آهنگ‌های بدون رتبه را با `recent.length` می‌ساخت و در حالت نزولی همان مقدار را هم معکوس می‌کرد؛ بنابراین موارد نامشخص می‌توانستند به ابتدای لیست بیایند. artist/album خالی و duration نامعتبر هم در برخی ترتیب‌ها مثل مقدار عادی مقایسه می‌شدند. الگوریتم به تابع خالص `sortMedia` منتقل شد: کپی مرتب‌شده (بدون mutation)، Persian/Unicode `Intl.Collator`، ترتیب نزولی واقعی، مقدارهای ناشناخته همیشه در انتها، و tie-break ثابت با عنوان/شناسه. همهٔ گزینه‌های فعلی name, artist, album, duration, recent, added پوشش آزمون دارند. ترتیب دستی playlist و رفتار صف پخش تغییر نکرده و sorting کتابخانه همچنان فقط صف کتابخانه را طبق رفتار موجود همگام می‌کند.

## تغییر فایل‌ها

- `src/RitmoAppClean.tsx`: اتصال sort خالص، جلوگیری از overlay هم‌زمان، جلوگیری از submit تکراری playlist و پاک‌کردن وضعیت هنگام لغو.
- `src/utils/mediaSort.ts`: الگوریتم مشترک sort پایدار و locale-aware.
- `src/components/PlayerSkinMenus.tsx`: پاک‌سازی metadata آلوده برای فیلدهای جست‌وجو و عنوان نمایش lyrics.
- `src/components/NocturnePlayerSkin.css`, `src/components/ReferencePlayerSkins.css`: اسکرول عمودی بدون بستن seek control.
- `src/components/PlayerSkinMenus.css`, `src/index.css`: حذف padding اضافی dock که با console هم‌پوشانی داشت.
- `android/app/src/main/AndroidManifest.xml`: تنظیم IME به `adjustResize`.
- آزمون‌های `media-sort`, `player-scope`, `user-requested-fixes`, `player-startup-seek`, و آزمون‌های موجود: coverage مقایسه‌گر، picker/modal، metadata lyrics، gesture scroll، inset و رفتارهای قبلی.
- `BUGFIX_REPORT_FA.md`, `README.md`: گزارش و محدودیت‌های تحویل.

## راستی‌آزمایی

- `node --experimental-strip-types --test tests/*.test.mjs`: **206 از 206 موفق** (نتیجهٔ نهایی باید از آخرین اجرا باشد).
- آزمون‌های deterministic شامل Persian/English، duplicate title, metadata ناقص، هر شش روش مرتب‌سازی در هر دو جهت، عدم mutation، cancel/confirm و duplicate-submit فرم، درخواست lyrics لغوشده، متن فارسی و LRC زمان‌دار هستند.
- درخواست زنده به endpoint دقیق LRCLIB برای نمونهٔ دارای متن: پاسخ JSON و plain/synced برگشت. درخواست دقیق نمونهٔ کاربر: نتیجه خالی؛ جست‌وجوی عنوان تنها نسخه‌های هنرمندان دیگر را نشان داد و به‌درستی نباید auto-select شوند.
- `npm ci`, `npm run lint`, `npm run build` اجرا نشدند: npm در محیط موجود نیست. Gradle wrapper تا دانلود Gradle 8.14.3 پیش رفت اما به‌علت نبود دسترسی شبکه به `services.gradle.org` متوقف شد؛ Android SDK تنظیم نشده، JDK موجود 17 است و workflow JDK 21 می‌خواهد. APK/device/emulator test انجام نشد.
- پروژه ZIP ورودی است و `.git`, branch و remote ندارد؛ GitHub push انجام نشد. Lockfile و dependencyها تغییر نکردند. بررسی whitespace با مقایسهٔ نهایی در برابر ZIP اصلی انجام می‌شود؛ `git diff --check` روی checkout واقعی قابل اجرا نیست.

## وضعیت پذیرش

1. Playlist dialog: **کد اصلاح شد و آزمون رفتاری/ساختاری موفق؛ نمایش واقعی با Gboard هنوز روی اندروید تأیید نشده.**
2. Lyrics: **نرمال‌سازی و API واقعی بررسی شد؛ LRCLIB برای نمونهٔ کاربر نتیجه ندارد، بنابراین نمایش متن آن آهنگ هنوز به منبع مجاز/فایل LRC نیاز دارد.**
3. Android player/insets: **کد اصلاح شد و آزمون ساختاری موفق؛ روی APK/device تأیید نشده.**
4. Sorting: **کد و هر شش sort mode با داده‌های تستی، فارسی/انگلیسی، جهت‌ها و مقادیر ناقص تأیید شدند؛ رفتار UI در build نهایی هنوز روی دستگاه دیده نشده.**
