# گزارش اصلاحات محدود Ritmo

## خلاصه وضعیت تحویل

تغییرات روی همین پروژه ارسالی انجام شد. مسیر فعال همچنان `src/main.tsx` → `src/RitmoAppClean.tsx` است. از `App.tsx` قدیمی استفاده نشده، Dependency جدید اضافه نشده و نسخه‌های وابستگی‌ها تغییر نکرده‌اند. تمام محتوای CSS قبلی، شامل متغیرهای رنگ و قواعد تم آبی فعلی، عیناً حفظ شده و فقط قواعد محدود اجزای درخواستی به انتهای فایل اضافه شده‌اند.

**ساختار پروژه برای ارسال و Commit آماده شده است، اما Build اندروید، موفقیت GitHub Actions و عملکرد روی گوشی هنوز تأیید عملی نشده‌اند.** این محیط اینترنت، Android SDK، نصب وابستگی‌های همین پروژه و مرورگر اجرایی ندارد. تست‌های منطقی با API اندروید شبیه‌سازی‌شده، جای تست واقعی Media3 و Android را نمی‌گیرند. نتیجه بررسی Notification، اصلاح یک نقص واقعی اتصال و تکمیل Artwork است، نه اثبات علت تمام موارد گاه‌به‌گاه روی دستگاه.

## ۱. فایل‌های تغییرکرده

| فایل | تغییر |
| --- | --- |
| `src/RitmoAppClean.tsx` | Bottom Sheet، جزئیات و تأیید حذف، دیالوگ نام Playlist، گزینه‌های قابل لمس، اصلاح Artists، Search و Progress/Seek |
| `src/index.css` | فقط CSS افزوده برای اجزای بالا، با همان متغیرهای تم |
| `src/utils/nativeMedia.ts` | قرارداد `deleteSong` و نتیجه حذف/وضعیت صف |
| `android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java` | حذف واقعی تک‌فایل، مجوز و تأیید سیستم، پاک‌سازی صف، بازیابی اتصال Controller و Artwork URI |
| `android/app/src/main/java/com/adelapp/larkplayer/RitmoPlaybackService.java` | BitmapLoader مشترک برای Notification و Lock Screen، کاور جایگزین محدود، SessionActivity و پاک‌سازی صف ذخیره‌شده |
| `android/app/src/main/AndroidManifest.xml` | فقط `WRITE_EXTERNAL_STORAGE` با `maxSdkVersion="28"` |
| `android/gradlew` | فقط مجوز اجرا؛ محتوای اسکریپت تغییر نکرده است |
| `.gitignore` | افزودن فایل‌های محلی ویرایشگر، موقت و تنظیمات امضا/Google Services |
| `.gitattributes` | فایل جدید برای LF در gradlew، CRLF در فایل Windows و حفظ فایل‌های باینری |
| `FIX_REPORT.md` | همین گزارش |

فایل‌های `src/main.tsx`، `src/App.tsx`، `RitmoVideoActivity.java`، `package.json`، `package-lock.json`، GitHub Actions، Gradle Wrapper JAR/properties و تنظیمات Build موجود بدون تغییر محتوا حفظ شدند. هیچ فایل موجود پروژه حذف نشد.

## ۲. علت و اصلاح هر ۱۰ مورد

### ۱) منوی سه‌نقطه

**علت:** Action Menu از `Overlay` مشترک با `fixed inset-0` استفاده می‌کرد؛ بنابراین تمام صفحه را می‌پوشاند.

**اصلاح:** فقط Action Menu آهنگ/ویدیو به `AppDialog` با کلاس `ritmo-bottom-sheet` منتقل شد. منو از پایین، با عرض محدود، ارتفاع وابسته به محتوا، گوشه‌های گرد بالایی و رعایت safe-area نمایش داده می‌شود. روی صفحه‌های کوچک فقط خود Sheet اسکرول می‌شود. Settings، Queue و Pickerهای موجود تبدیل به طراحی جدید نشدند. ظاهر از رنگ‌های فعلی استفاده می‌کند.

### ۲) حذف آهنگ واقعی

**علت:** مسیر فعال اصلاً گزینه یا API حذف فایل نداشت؛ حذف از Playlist/Queue فقط ارجاع برنامه را حذف می‌کرد.

**اصلاح:** برای آهنگ بومی اندروید، گزینه «حذف آهنگ» و تأیید داخل برنامه اضافه شد. حذف وب یا حذف ویدیو اضافه نشده است.

مسیر بومی:

* ورودی فقط یک URI تک‌آهنگ MediaStore با شناسه متناظر پذیرفته می‌شود؛ URI مجموعه، مسیر فایل آزاد، query، fragment و ویدیو رد می‌شوند.
* Android 11 و بالاتر: `MediaStore.createDeleteRequest` فقط برای همان URI؛ سیستم پس از تأیید حذف را انجام می‌دهد.
* Android 10: حذف مستقیم و در صورت `RecoverableSecurityException`، تأیید سیستم و تکرار حذف همان ردیف.
* Android 7 تا 9: درخواست Runtime Permission نوشتن در حافظه اشتراکی؛ مجوز در Manifest فقط تا API 28 تعریف شده است.
* پس از حذف، نبود ردیف در MediaStore بررسی می‌شود. لغو یا رد مجوز، لیست‌های برنامه را تغییر نمی‌دهد.
* بعد از موفقیت، تمام تکرارهای همان آهنگ در صف بومی، حتی آیتم در حال پخش، حذف می‌شوند. صف ذخیره‌شده سرویس هم پاک‌سازی می‌شود.
* Songs، گروه‌های مشتق‌شده Artists/Albums/Folders، Favorites، Recent، Queue، همه Playlistها و ارجاع کاور Playlist به‌روزرسانی می‌شوند.
* پاسخ قدیمی Poll که قبل از حذف شروع شده، پس از حذف معتبر نیست و کنار گذاشته می‌شود. Scan در حال اجرا نیز آهنگ حذف‌شده را دوباره وارد لیست نمی‌کند.

اگر اتصال سرویس درست بعد از حذف فیزیکی قطع شود، نتیجه حذف همچنان موفق برگردانده می‌شود، ارجاع ذخیره‌شده صف پاک می‌شود و هشدار بررسی اتصال نمایش داده می‌شود؛ به‌دروغ «حذف ناموفق» اعلام نمی‌شود. حذف فیزیکی و مجوزهای سیستم هنوز نیازمند تست دستگاه‌اند.

### ۳) جزئیات فایل

**علت:** عنوان «اطلاعات فایل» و همان Overlay تمام‌صفحه استفاده می‌شد.

**اصلاح:** عنوان «جزئیات فایل»، Dialog اختصاصی وسط صفحه، اطلاعات نام/خواننده/آلبوم/مدت/نوع/نام فایل/پوشه/نشانی و دکمه واضح «بستن» در پایین. `alert()` استفاده نشده است. Dialog با `<dialog>.showModal()`، استایل برنامه، Focus Trap مرورگر، Escape، Back اندروید و بازگردانی فوکوس بدون اسکرول پیاده شده است؛ Dialog پیش‌فرض بدون استایل نیست.

### ۴) ظاهر گزینه‌های Playlist

**علت:** عملیات ساخت، افزودن آهنگ، انتخاب کاور، پخش و حذف لیست عمدتاً فقط متن رنگی بودند.

**اصلاح:** گزینه‌های مستقل با حداقل ارتفاع ۴۸ پیکسل، padding، border، پس‌زمینه فعلی و فاصله ۱۲ پیکسل. عملیات Playlist روی موبایل می‌شکنند و هرکدام محدوده لمس جدا دارند. دکمه بازگشت و عملیات Picker مربوط به Playlist نیز ظاهر قابل لمس دارند. رفتار حذف Playlist، ترتیب آهنگ‌ها و ذخیره قبلی تغییر نکرده است.

### ۵) ساخت Playlist

**علت:** `createPlaylist` در مسیر فعال مستقیماً `prompt()` را فراخوانی می‌کرد.

**اصلاح:** Dialog داخل برنامه با Label، Input دارای autofocus، دکمه تأیید و لغو، Enter برای ثبت و رد نام خالی/فقط فاصله. نام trim می‌شود؛ ساختار قبلی `{ id, name, trackIds }` و کلید `ritmo_playlists` حفظ شده‌اند. لغو، داده‌ای ذخیره نمی‌کند. ساخت از Picker هم همان Dialog را استفاده می‌کند و Picker زیر آن باقی می‌ماند.

### ۶) خواننده‌ها

**علت‌های مشخص در کد:** تغییر route، موقعیت اسکرول مشترک document را حفظ می‌کرد؛ Artists هیچ Reset نداشت. تب خواننده‌ها در نوار افقی نیز الزاماً قابل مشاهده نمی‌شد. نام‌های طولانی هم محدودیت شکستن متن مختص Artists نداشتند.

**اصلاح:** `useLayoutEffect` فقط برای Artists، در ورود، انتخاب خواننده و برگشت از جزئیات، Scroll بالا/افقی document را صفر می‌کند. تب انتخاب‌شده فقط در scroll container خودش به محدوده دید آورده می‌شود، نه با `scrollIntoView` که Header را عمودی جابه‌جا کند. نام بلند با CSS محدود به Artists می‌شکند. Albums و Songs Reset جدید ندارند. جای Header یا طرح کلی صفحه تغییر نکرده است.

تست منطقی این مسیر اجرا شد؛ تأیید هندسه واقعی Header/Scroll در WebView روی گوشی همچنان لازم است.

### ۷) Search Box

**علت:** جستجوی Header یک Input شفاف بدون سطح مستقل و Picker یک Input با گردی کم داشت.

**اصلاح:** فقط کادرهای جستجو، pill-shaped با `border-radius: 999px`، پس‌زمینه کم‌تأکید از توکن موجود تم، border فعلی، متن/آیکون خوانا، `min-width: 0` و Focus Ring شدند. هیچ متغیر رنگ یا رنگ‌بندی سراسری تغییر نکرد.

### ۸) Notification

**نقص واقعی یافت‌شده:** Controller فقط یک بار هنگام load ساخته می‌شد؛ پس از قطع Session، Controller/Future قبلی باقی می‌ماند و درخواست‌های بعدی اتصال سالم را دوباره ایجاد نمی‌کردند. سرویس اصلی قبلاً MediaSessionService بود و مجوزهای Foreground/Media Playback/Notifications در Manifest وجود داشتند؛ Notification دوم یا سرویس موازی لازم نبود.

**اصلاح:**

* اتصال و اجرای فرمان‌ها روی همان Controller Looper انجام می‌شوند.
* `MediaController.Listener.onDisconnected` اتصال ازکارافتاده را کنار می‌گذارد؛ درخواست بعدی Controller جدید را به همان سرویس متصل می‌کند.
* نتیجه اتصال قدیمی اجازه بازنویسی اتصال جدید را ندارد؛ callbackهای Player از Controller همان اتصال استفاده می‌کنند.
* `SessionActivity` برای بازکردن Activity فعلی از اعلان اضافه شد.
* مالک Notification و Foreground lifecycle همچنان Media3 است؛ `super.onUpdateNotification` حفظ شد. هیچ `NotificationManager.notify` یا Notification دوم اضافه نشده.
* خطای شروع Foreground فقط در حالت پخش واقعی و سرویس ongoing پاک می‌شود.
* درخواست اعلان در اولین Scan و مسیر درخواست/تنظیمات موجود حفظ شدند. شناسه کانال موجود با سورس Media3 1.5.1 تطبیق داده شد: `default_channel_id`.
* رفتار پیش‌فرض MediaSessionService برای ادامه پخش فعال هنگام بسته‌شدن Activity/حذف task تغییر نکرد. هندل Audio Focus و Becoming Noisy هم حفظ شد.

**محدودیت:** نبود اعلان روی همه دستگاه‌ها تنها از روی سورس قابل تشخیص قطعی نیست؛ تنظیمات کانال، محدودیت سازنده و Logcat هنگام وقوع مشکل باید روی گوشی بررسی شوند. اعلان‌های MediaSession در Android 13+ استثناهای مجوز دارند؛ رد POST_NOTIFICATIONS به‌تنهایی دلیل قطعی نبود کنترل رسانه نیست. پایداری Notification/Lock Screen/Background روی دستگاه هنوز تأیید نشده است.

### ۹) کاور پیش‌فرض Notification

**علت:** MediaItemهای پخش/افزودن به صف/بازگردانی صف، Artwork برای Session نداشتند؛ کاور UI برنامه مستقل بود.

**اصلاح:** در هر سه مسیر، Artwork URI وارد Metadata می‌شود و یک BitmapLoader در همان MediaSession، ابتدا تصویر واقعی را به‌صورت async و خارج از Player Thread می‌خواند. تصویر embedded واقعی یا Artwork Data استخراج‌شده استفاده می‌شود.

در نبود تصویر قابل خواندن، کاور اختصاصی کم‌رنگ با نماد موسیقی و نام Ritmo، داخل سرویس ساخته می‌شود. اندازه ۲۵۶×۲۵۶ با RGB_565، حدود ۱۲۸ KiB؛ فقط یک نمونه کاور جایگزین برای عمر سرویس و کش آخرین درخواست با `CacheBitmapLoader`. تصویر واقعی نیز sampled decode می‌شود و سمت بزرگ‌تر آن حداکثر ۲۵۶ پیکسل است. داده تصویر خراب/بیش از محدودیت ایمنی ۱۶ MiB نیز به کاور جایگزین می‌رسد. فایل تصویری بزرگ، Dependency یا کش نامحدود اضافه نشده است.

این Artwork مشترک Notification و Lock Screen است؛ رندر واقعی آن هنوز نیازمند تست اندروید است.

### ۱۰) Seek Bar / Progress

**علت:** CSS قبلی track مربوط به range را یک رنگ ثابت می‌کرد؛ accent رنگ بخش طی‌شده در WebView را به‌تنهایی نمی‌ساخت. همچنین Poll قدیمی می‌توانست Position جدید Seek را بازنویسی کند.

**اصلاح:** فقط Seek Bar پخش‌کننده از درصد `position / duration`، بخش آبی و باقی‌مانده با رنگ border موجود می‌سازد. داده از `NativeMedia.state()` می‌آید که `MediaController.getCurrentPosition()` و `getDuration()` را از Media3 می‌خواند؛ انیمیشن ساختگی یا تایمر Position جدید اضافه نشده است. Poll موجود ۵۰۰ میلی‌ثانیه‌ای حفظ شده است.

Seek به میلی‌ثانیه ارسال می‌شود، UI بلافاصله مقدار انتخابی را نمایش می‌دهد و پاسخ آخرین Seek با وضعیت Player تطبیق می‌کند. Revision و Pending Seek مانع بازنویسی Position با پاسخ قدیمی Poll/Seek می‌شوند. مدت نامعلوم، Seek را غیرفعال می‌کند و درصد بین صفر و صد محدود است. Volume Bar تغییر نکرد.

## ۳. تست‌هایی که واقعاً اجرا شدند

### بررسی کد و ساختار

* Parse/Transpile نحوی هر ۲۴ فایل TS/TSX زیر `src`: بدون خطای نحوی.
* Type Check مستقل مسیر فعال با TypeScript 5.6 نصب‌شده محیط، React 18 types موجود و declarationهای حداقلی Capacitor: صفر diagnostic. **این تست `npm run lint` با TypeScript/React قفل‌شده پروژه نیست.**
* Parse نحوی هر چهار فایل Java با Parser کامپایلر JDK 17 و UTF-8: صفر خطا. **این تست Compile علیه Android SDK و Media3 نیست.**
* Parse CSS و تمام XMLهای Android: موفق.
* Parse فایل GitHub Actions YAML، وجود push/manual trigger و ۱۳ مرحله موجود: موفق.
* `sh -n android/gradlew`: موفق.
* CRC/ساختار JAR و وجود `GradleWrapperMain.class`: موفق.
* مقایسه بایت‌به‌بایت فایل‌های حفظ‌شده، ابتدای CSS و مسیر فعال: موفق.

### ۱۵ سناریوی منطقی

با یک harness مستقل Node برای Hookها و JSX مسیر فعال، همراه Native API شبیه‌سازی‌شده، این سناریوها اجرا و پاس شدند:

1. Scan اولیه و دریافت snapshot وضعیت Player.
2. Action Menu از نوع Bottom Sheet اختصاصی.
3. جزئیات وسط صفحه، نام فایل، دکمه بستن و پاک‌شدن Scroll Lock.
4. نام Playlist، رد نام خالی، trim و حفظ Playlistهای قبلی.
5. لغو ساخت Playlist بدون تغییر storage.
6. کلاس گزینه‌های مستقل عملیات Playlist.
7. Reset فقط Artists، ورود/جزئیات/Back و عدم Reset اضافی Albums/Songs.
8. بازوبسته‌شدن Search با کلاس محدود کادر گرد.
9. لغو تأیید داخلی حذف بدون فراخوانی API حذف.
10. لغو پاسخ Native/System بدون تغییر لیست‌ها.
11. خطای مجوز حذف با پیام قابل مشاهده و حفظ داده.
12. پاک‌سازی آیتم/تکرارهای صف، Favorite/Recent، Playlist و کاور؛ کنارگذاشتن Poll قدیمی؛ حفظ ویدیو نامرتبط.
13. Position و درصد Progress و تبدیل ۹۰ ثانیه Seek به ۹۰۰۰۰ میلی‌ثانیه.
14. Bottom Sheet ویدیو، حفظ مسیر پخش مستقل و عدم نمایش حذف آهنگ برای ویدیو.
15. ادامه ذخیره‌سازی Favorites پس از حذف.

**این‌ها تست منطق React با شبیه‌سازی‌اند، نه تست مرورگر، Screenshot، صدای واقعی، فایل واقعی یا Media3 واقعی.**

### اجراهای انجام‌نشده/ناموفق به علت محیط

`npm ci`، `npm run build`، `npm run lint` واقعی، `npx cap sync android` و `assembleDebug` اجرا نشدند؛ وابستگی‌های همین پروژه و npm در محیط موجود نیستند و محیط اینترنت ندارد. `gradlew --version` واقعاً امتحان شد و Wrapper تا مرحله دانلود Gradle رسید، اما دانلود به علت نبود اینترنت انجام نشد. APK تولید نشده است.

## ۴. تست‌های لازم روی Android واقعی

* Android 7 تا 9: مجوز حذف پذیرفته/ردشده، حذف فقط تک‌آهنگ و باقی‌ماندن فایل‌های هم‌پوشه.
* Android 10: فایل متعلق به برنامه دیگر، تأیید RecoverableSecurityException و لغو.
* Android 11+: تأیید/لغو سیستم، حذف فایل درحال‌پخش و تکراری‌های صف؛ بررسی واقعی فایل از Files/MediaStore.
* Android 13 تا 16: اعلان با مجوز پذیرفته/ردشده، کانال خاموش/روشن، Lock Screen و دکمه‌های Play/Pause/Next.
* رفتن به Home، قفل صفحه، حذف از Recents، قطع و بازیابی Session، پخش طولانی و محدودیت باتری سازنده.
* آهنگ دارای Artwork واقعی، بدون Artwork، تصویر خراب و تصویر بزرگ.
* Seek سریع و متوالی، پخش عادی، Pause/Resume، Next/Previous، تغییر مدت و برگشت از پس‌زمینه.
* Audio/Video Playback، PiP موجود، Favorites، Playlistهای قبلی، ترتیب Playlist، Navigation و Back.
* هندسه Bottom Sheet و Dialog، Keyboard، Artists و Header در ابعاد موبایل/WebView، نام‌های بلند و حفظ رنگ‌های فعلی.

## ۵. بررسی GitHub

* ۲۴ نسخه top-level موجود در lock با rangeهای `package.json` سازگارند؛ name/version/dependencies/devDependencies ریشه lock نیز مطابق package.json هستند.
* **نکته از قبل موجود:** ۱۸ وابستگی top-level در lock فاقد `resolved`/`integrity` هستند. نبود این فیلدها به‌تنهایی ناسازگاری package/lock را ثابت نمی‌کند، اما این محیط نمی‌تواند دریافت نسخه‌ها از registry یا موفقیت `npm ci` را تأیید کند. lock حدسی بازتولید یا نسخه‌ها بی‌دلیل تغییر داده نشدند.
* Gradle Wrapper JAR، properties و اسکریپت‌ها حفظ و بررسی شدند؛ `gradlew` executable است و در آزمایش Git با mode `100755` ثبت شد.
* فایل Actions عیناً حفظ شد؛ مرحله `chmod +x android/gradlew` قبلی همچنان وجود دارد و مشکل ازدست‌رفتن mode در Upload وب/Windows را برای CI پوشش می‌دهد.
* تست واقعی `git add`، `git diff --check`، Commit، `git fsck` و Push به **remote bare محلی آزمایشی** موفق بود. به GitHub حساب کاربر Push نشده و احراز هویت/محدودیت‌های repository بررسی نشده است.
* ۱۲ مسیر وابستگی/build/local/secrets/temp با `git check-ignore` بررسی و ignored شدند؛ ۱۲ مسیر ضروری شامل Wrapper، Actions و `.env.example` ignored نیستند.
* `.gitattributes` برای پایان‌خط صحیح، `.gitignore` برای build/secrets/temp؛ فایل Git داخلی آزمایش و ابزارهای تست وارد پوشه پروژه تحویلی نشده‌اند.
* فایل‌های اصلی Build، Gradle، Capacitor، Entry و Branding موجودند. هیچ فایل ضروری حذف نشده است.
* بسته ZIP، فایل‌های مخفی `.github`، `.gitignore` و `.gitattributes` و مجوز اجرای Wrapper را شامل می‌شود. APK، node_modules، dist، cache، secrets یا خروجی تست در ZIP پروژه نیستند.

## ۶. آمادگی Upload

**برای Upload/Commit از نظر ساختار فایل و بررسی محلی آماده است؛ «Build-ready تأییدشده» یا «بدون خطای GitHub Actions» اعلام نمی‌شود.** در اولین محیط دارای اینترنت، Node 22.12+، JDK 21 و SDK 36، همان workflow موجود یا مراحل زیر باید موفق شوند:

1. ZIP را Extract کنید؛ محتویات پوشه پروژه، شامل فایل‌های مخفی، باید در ریشه repository باشند. خود ZIP را به‌جای سورس Upload نکنید.
2. `npm ci`
3. `npm run lint` و `npm run build`
4. `npx cap sync android`
5. `chmod +x android/gradlew` و سپس `cd android && ./gradlew assembleDebug`
6. APK خروجی را روی گوشی نصب و سناریوهای بخش ۴ را اجرا کنید.

اگر با Git محلی از Windows Commit می‌کنید و mode اجرا از دست رفت، `git update-index --chmod=+x android/gradlew` را قبل از Commit اجرا کنید. اگر `npm ci` مشکل registry/lock گزارش کرد، باید در محیط دارای اینترنت علت همان خطا بررسی شود؛ در این تحویل چیزی حدسی در lock نوشته نشده است.
