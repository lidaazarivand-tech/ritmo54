# Ritmo: گزارش نهایی اصلاح Settings

## خلاصه و مرز قابلیت

مسیر فعال قبل از تغییر بررسی شد: `src/main.tsx` برنامه `RitmoAppClean.tsx` را بارگذاری می‌کند و Settings فعال در `PlayerSettings.tsx` است. `src/App.tsx` و صفحه‌های قدیمی مبنای پیاده‌سازی این مرحله نبودند.

در نسخه ورودی، پنهان‌سازی و سطل بازیافت وجود نداشتند؛ حذف از طریق NativeMedia فایل را به‌طور دائمی حذف می‌کرد. افزودن حداقلی این دو قابلیت با تأیید کاربر انجام شد.

**مهم: حذف جدید، حذف قابل‌بازیابی از کتابخانه Ritmo است، نه حذف فایل از حافظه دستگاه و نه سطل بازیافت سیستم اندروید.** فایل در پوشه اصلی باقی می‌ماند، فضایی آزاد نمی‌شود و ممکن است در برنامه‌های دیگر دیده شود. پیام تأیید حذف و صفحه اخیراً حذف‌شده همین موضوع را صریح می‌گویند. فایل‌هایی که قبلاً دائماً حذف شده‌اند قابل بازیابی نیستند. این قابلیت فقط برای آهنگ صوتی اسکن‌شده از MediaStore فعال است؛ حذف یا پنهان‌سازی ویدیو، فایل وب یا داده دیگر اضافه نشده است.

## 1. Files Modified

شش فایل اصلی تغییر کرده‌اند:

- `android/app/src/main/java/com/adelapp/larkplayer/NativeMediaPlugin.java`
- `src/RitmoAppClean.tsx`
- `src/components/PlayerSettings.css`
- `src/components/PlayerSettings.tsx`
- `src/index.css`
- `src/utils/nativeMedia.ts`

جزئیات:

- `RitmoAppClean.tsx`: شش گزینه نهایی، اتصال پوسته و مدیریت رکوردهای پنهان/حذف‌شده، بازیابی، ایمیل و پاک‌کردن منطق اختصاصی Settings حذف‌شده.
- `PlayerSettings.tsx`: حذف صفحات اضافی، انتخابگر واقعی پوسته، فهرست واقعی و بازیابی، اطلاعات واقعی سازنده و بازخورد.
- `PlayerSettings.css`: حفظ طراحی موجود، استایل حداقلی انتخاب پوسته و حذف CSS اختصاصی کنترل‌های Settings حذف‌شده.
- `index.css`: افزودن دو مجموعه متغیر رنگ؛ مقادیر پیش‌فرض موجود و شکل/چیدمان عناصر دست‌نخورده‌اند.
- `nativeMedia.ts`: تعریف سه عملیات native جدید برای خارج‌کردن آهنگ از صف، بررسی دسترسی فایل و بازکردن ایمیل.
- `NativeMediaPlugin.java`: همان سه عملیات، بدون تغییر موتور پخش، حذف قدیمی فایل یا اسکنر.

## 2. Files Added

- `src/utils/settingsMedia.ts`
- `src/utils/settingsTheme.ts`
- `tests/settings-state.test.mjs`
- `SETTINGS_FINAL_REPORT.md`

هیچ mock، fixture، فایل تنظیمات مخصوص محیط تست یا bundle آزمایشی وارد پروژه تحویلی نشده است. داده آزمایشی مرورگر فقط در محیط تست استفاده شد.

## 3. Files Deleted

هیچ فایل اصلی حذف نشده است. حذف گزینه‌ها و منطق اختصاصی بلااستفاده، درون فایل‌های فعال انجام شده است.

## 4. Theme implementation

سه پوسته فارسی:

1. آبیِ تیره ریتمو (`obsidian`): همان رنگ‌بندی اصلی؛ Accent روشن `#56A9DF` و Surface `#141A23`.
2. آبیِ یخی (`cyber`): Accent روشن `#8CCBFF` و Surface `#152139`.
3. فیروزه‌ای آرام (`emerald`): Accent روشن `#73D5C2` و Surface `#142720`.

از متغیرهای موجود `--ritmo-*` استفاده شده است؛ سیستم CSS موازی یا redesign اضافه نشده است. مقادیر background، surface، elevated، border، selected، accent و gradient دکمه‌ها در دو پوسته جدید تغییر می‌کنند. رنگ خطا، مورد علاقه‌ها و artwork بی‌دلیل تغییر نکرده‌اند.

شناسه در کلید موجود و سازگار با پشتیبان `lark_player_theme` ذخیره می‌شود. `data-ritmo-theme` روی ریشه سند فوراً اعمال می‌شود؛ انتخاب فعال هنگام بازکردن دوباره Settings و پس از بارگذاری مجدد حفظ می‌شود. خطای ذخیره‌سازی، انتخاب قبلی را تغییر نمی‌دهد و پیام فارسی نمایش می‌دهد.

شناسه‌های قدیمی `velvet` و `platinum` در قالب پشتیبان همچنان معتبرند، اما در رابط فعلی به پوسته اصلی fallback می‌شوند؛ قابلیت قدیمی غیرفعال به‌عنوان پوسته فعال معرفی نشده است.

## 5. Removed Settings options

ویبره، تایمر خواب، زبان و تنظیمات پخش از فهرست، metadata، صفحات و props فعال Settings حذف شدند. شمارشگر خواب، تنظیم مجدد پخش که فقط Settings استفاده می‌کرد، و CSS اختصاصی آن صفحات حذف شدند. در نسخه فعال هیچ منطق ویبره‌ای برای حذف وجود نداشت؛ ویبره یا قابلیت native غیرمرتبط دست‌کاری نشده است.

برای رعایت خواسته نهایی «فقط شش گزینه»، گزینه و صفحه «تنظیمات اعلان» هم از Settings حذف شد؛ مجوزها، اعلان پخش، notificationStatus و رفتار سالم اندروید حذف نشده‌اند.

ترتیب نهایی:

1. پوسته
2. پرونده‌های پنهان
3. اخیراً حذف‌شده
4. پشتیبان‌گیری و بازیابی
5. بازخورد
6. درباره ما

عبارت «تنظیمات پخش پشتیبان معتبر نیست» همچنان ممکن است در پیام خطای اعتبارسنجی backup دیده شود؛ این عبارت گزینه یا مسیر Settings نیست.

## 6. Recently Deleted / Restore implementation

- ذخیره واقعی در `localStorage` با کلید `ritmo_settings_media_v1`؛ دو فهرست `hidden` و `deleted`.
- رکورد شامل شناسه MediaStore، URI اصلی، عنوان، نام فایل، پوشه و تاریخ است؛ شناسه و URI اعتبارسنجی می‌شوند.
- حذف از کتابخانه، ابتدا رکورد قابل‌بازیابی را ذخیره می‌کند؛ سپس همان آهنگ و تکرارهایش، حتی آیتم درحال‌پخش، از صف native خارج می‌شوند. فایل اصلی دست‌نخورده است.
- اسکن مجدد رکوردها را دور نمی‌زند؛ فیلتر مرکزی کتابخانه موارد پنهان و حذف‌شده را کنار می‌گذارد.
- عضویت مورد علاقه‌ها، تاریخچه، ترتیب لیست‌های پخش و کاور انتخابی حفظ می‌شوند؛ هنگام نمایش یا بازیابی، همان عضویت‌ها دوباره قابل مشاهده‌اند. صف پخش جاری بعد از بازیابی خودکار بازسازی نمی‌شود.
- بازیابی ابتدا اسکن واقعی، تطبیق شناسه و URI و بازشدن فایل با دسترسی خواندن را بررسی می‌کند. سپس رکورد از فهرست حذف و آهنگ به کتابخانه برمی‌گردد.
- فایل واقعاً گم‌شده یا فاقد مجوز بازیابی نمی‌شود؛ رکورد حفظ و خطای فارسی نمایش داده می‌شود.
- ذخیره فهرست‌ها یک نوشتن واحد است؛ خطای storage نباید به موفقیت ظاهری منجر شود. داده خراب با رکورد جدید بازنویسی نمی‌شود.
- عملیات همزمان رسانه و backup محدود شده و نتیجه دیررس polling نباید وضعیت بازیابی را عقب برگرداند.
- فهرست خالی پیام مناسب دارد؛ restart با خواندن storage و اسکن اصلی، وضعیت حذف یا بازیابی را حفظ می‌کند.

پرونده‌های پنهان نیز واقعی‌اند: از منوی آهنگ «پنهان‌کردن در ریتمو»، سپس Settings > پرونده‌های پنهان > نمایش دوباره. این قابلیت رمزگذاری یا مخفی‌کردن فایل از سایر برنامه‌ها نیست.

رکوردهای پنهان/حذف‌شده متعلق به همین نصب و storage برنامه‌اند. پاک‌کردن داده برنامه یا uninstall آنها را پاک می‌کند، اما فایل اصلی روی دستگاه باقی می‌ماند. برای حفظ Scope، قالب backup قبلی توسعه داده نشده؛ این رکوردهای جدید در backup قدیمی صادر نمی‌شوند و restore backup نیز آنها را پاک نمی‌کند.

## 7. Feedback implementation

سازنده: **عادل آذری وند**

مقصد دقیق: `azarivandadel@gmail.com`

در اندروید، `Intent.ACTION_SENDTO` با `mailto:` استفاده می‌شود؛ متن موضوع «بازخورد Ritmo» است. نبود برنامه ایمیل یا خطای اجرای Intent به rejection کنترل‌شده تبدیل می‌شود و Settings پیام مناسب نمایش می‌دهد؛ ارسال نهایی را خود کاربر در برنامه ایمیل انجام می‌دهد.

در وب، `mailto:` باز می‌شود. مرورگر همیشه نبود handler ایمیل را قابل‌تشخیص نمی‌کند؛ آدرس و راهنمای ارسال دستی همیشه نمایش داده می‌شوند و خطاهای قابل‌گرفتن نیز مدیریت می‌شوند.

## 8. About implementation

Ritmo، نسخه فعلی، نام «عادل آذری وند»، ایمیل دقیق و دکمه ارسال ایمیل با همان مسیر واقعی.

نام سازنده قبلی از About فعال حذف شد. شرکت، تیم، وب‌سایت یا شبکه اجتماعی ساختگی اضافه نشده است. کارت‌ها، قلم، RTL و زبان فارسی حفظ شده‌اند.

## 9. Tests PASS

### تست‌های منطقی قابل‌تکرار داخل پروژه

دستور:

```bash
node --experimental-strip-types --test tests/settings-state.test.mjs
```

Node 22 یا جدیدتر لازم است. نتیجه اجرا: **۷ تست، ۷ PASS، صفر FAIL**.

موارد: فهرست خالی، حذف و خواندن مجدد storage، بازیابی و خواندن مجدد، حفظ metadata، hide/unhide، جلوگیری از رکورد تکراری، عدم بازنویسی داده خراب، خطای quota، شناسه نامعتبر، restore مورد ناموجود، سه پوسته، اعمال فوری، persistence و حفظ انتخاب قبلی در خطای ذخیره‌سازی.

### تست مرورگر روی رابط فعال با اتصال آزمایشی native

Chromium headless، viewport موبایل 390×844. منطق UI واقعی `RitmoAppClean` و `PlayerSettings` اجرا شد؛ MediaStore، کنترل native، ایمیل و انتخابگر فایل native با test double جایگزین شدند. **این نتیجه تست دستگاه واقعی یا Java نیست.**

برای این harness از React 18 موجود در محیط و تولید utilityهای Tailwind 3 موجود استفاده شد؛ بسته production پروژه React 19 و Tailwind 4 است. بنابراین نتیجه، تست رفتار/رابط در harness است و جایگزین build یا بررسی ظاهر نهایی APK نیست.

هفت جریان PASS، بدون خطای uncaught:

1. دقیقاً شش گزینه Settings با ترتیب موردنظر.
2. تغییر واقعی مقدار CSS سه پوسته، انتخاب فعال و حفظ انتخاب بعد از reload.
3. About و Feedback با نام/ایمیل صحیح؛ خطای شبیه‌سازی‌شده نبود برنامه ایمیل بدون crash.
4. ایجاد backup، رد فایل خراب، restore فایل معتبر و اعمال مجدد theme با فایل‌گزین native آزمایشی.
5. حذف، نمایش، reload، خطای فایل اصلی ناموجود با حفظ رکورد، بازیابی، خروج از فهرست و بازگشت کتابخانه پس از reload؛ حفظ favorite و ترتیب playlist بررسی شد.
6. پنهان‌کردن، نمایش در Settings و نمایش دوباره.
7. handlerهای Player برای سرعت 1.5، Repeat، Shuffle، Volume و Mute با اتصال native آزمایشی.

### منطق backup فعلی

بدون تغییر `settingsBackup.ts`، منطق واقعی وب برای checksum، فایل خراب، سرعت نامعتبر، سه شناسه theme، rollback در خطای applyPlayback، restore معتبر و حفظ storage غیرمرتبط/رکوردهای جدید تست شد: **PASS**.

### بررسی‌های ایستا

- parse/transpile و bundling مسیر ورودی فعال با esbuild و dependencyهای external: PASS؛ این `npm run build` نیست.
- TypeScript مسیر فعال با declarationهای محدودِ مخصوص تست برای Capacitor و typeهای موجود محیط: PASS؛ بررسی کامل dependencyهای اصلی نیست.
- بدنه `Player` و `PlayerProps` نسبت به ZIP اولیه عیناً یکسان است.
- بدنه `play` و `navigate` عیناً یکسان است؛ `setModes` از نظر منطق بدون تغییر است.
- نبود صفحات/گزینه‌های حذف‌شده در مسیر فعال Settings بررسی شد.
- هماهنگی root package-lock با package.json برای name، version، dependencies و devDependencies: PASS.
- فایل‌های ثابت با SHA-256 نسبت به ZIP اولیه مقایسه شدند.

## 10. Tests NOT RUN + دلیل

| تست | نتیجه و دلیل |
| --- | --- |
| `npm ci` | **NOT RUN — Environment limitation**: npm در محیط وجود ندارد؛ محیط اینترنت و دسترسی npm registry ندارد. |
| TypeScript کامل با dependencyهای اصلی | **NOT RUN — Environment limitation**: اجرای compiler موجود با tsconfig اصلی شروع شد، اما به‌علت نبود `vite/client` متوقف شد؛ نتیجه کامل معتبر به دست نیامد. |
| `npm run lint` | **NOT RUN — Environment limitation**: npm و dependencyهای اصلی نصب نیستند. lint پروژه همان `tsc --noEmit` است. |
| `npm run build` | **NOT RUN — Environment limitation**: npm، Vite و افزونه‌های اصلی موجود نیستند و نصب شبکه‌ای ممکن نیست. |
| Capacitor sync | **NOT RUN — Environment limitation**: Capacitor CLI و dependencyهای پروژه نصب نیستند. |
| Android Gradle build | **NOT RUN — Environment limitation**: Android SDK و Gradle distribution cache وجود ندارند؛ JDK موجود 17 است، workflow پروژه JDK 21 دارد؛ دریافت dependencyها اینترنت لازم دارد. |
| تست واحد/ابزاری Android موجود | **NOT RUN — Environment limitation**: SDK، build toolchain و دستگاه وجود ندارند. |
| MediaStore، ایمیل و پخش واقعی روی دستگاه | **NOT RUN — Environment limitation**: دستگاه یا emulator Android متصل نیست. |
| بستن کامل process و راه‌اندازی مجدد APK | **NOT RUN — Environment limitation**: persistence با تست storage/reload بررسی شده، نه process واقعی Android. |
| کیفیت صدا، پخش پس‌زمینه، سرعت/Repeat واقعی | **NOT RUN — Environment limitation**: handler مرورگر تست شده، اما دستگاه/موتور native واقعی اجرا نشده است. |
| native Backup/Restore و انتخابگر Android | **NOT RUN — Environment limitation**: Java موجود دست‌نخورده است، ولی اجرا روی Android ممکن نبود. |
| GitHub Actions روی سرور GitHub | **NOT RUN — Environment limitation**: این محیط اینترنت ندارد؛ workflow از نظر فایل/محتوا دست‌نخورده است. |

هیچ مورد اجرا‌نشده‌ای PASS اعلام نشده است.

## 11. GitHub readiness

- package.json و package-lock.json تغییر نکرده‌اند و declarationهای ریشه هماهنگ‌اند؛ قابلیت دانلود نسخه‌های dependency بدون اینترنت قابل‌بررسی نبود.
- `.gitignore` موجود مناسب و بدون تغییر است؛ node_modules، dist، build outputs، secrets و signing files را پوشش می‌دهد و Gradle wrapper را نگه می‌دارد.
- ZIP فاقد node_modules، dist، APK/AAB، keystore، signing config خصوصی، `.env` واقعی و bundle آزمایشی است.
- `.env.example` فقط placeholder موجود را دارد و تغییر نکرده است.
- بررسی الگوهای کلید خصوصی، کلید API رایج و توکن GitHub موردی پیدا نکرد؛ این بررسی محدود است، نه تضمین امنیتی کامل.
- GitHub Actions، Gradle wrapper، فایل‌های Gradle و AndroidManifest.xml تغییر نکرده‌اند.
- Application ID: `com.adelapp.larkplayer`، versionName: `1.1.2`، versionCode: `10102`؛ همگی بدون تغییر.
- dependency جدید: **صفر**. تست‌های داخل پروژه از Node استفاده می‌کنند.
- ساختار کلی پروژه و entry point حفظ شده‌اند.
- readiness ساختاری بررسی شده است؛ موفقیت CI، build APK یا انتشار production تأیید نشده و باید پس از push بررسی شود.

## 12. ZIP filename

`Ritmo-settings-final-fix.zip`

ZIP فقط پروژه اصلاح‌شده، تست منطقی و همین گزارش را در پوشه اصلی پروژه دارد؛ خروجی build، fixture، نصب dependency یا APK در آن نیست.

## 13. Scope audit

| سؤال | پاسخ |
| --- | --- |
| Player تغییر غیرضروری داشته؟ | **خیر**؛ UI کامل Player، play و حالت‌های پخش حفظ شده‌اند. فقط guard کنترل/polling برای رقابت با بازیابی اضافه شده و خارج‌کردن آیتم حذف/پنهان‌شده از صف، ضروری همین قابلیت است. |
| Library تغییر غیرضروری داشته؟ | **خیر**؛ فیلتر موارد پنهان/حذف‌شده، منوی پنهان‌کردن و تبدیل حذف دائمی به حذف قابل‌بازیابی ضروری قابلیت‌های تأییدشده‌اند. طراحی، گروه‌بندی و سایر رفتارهای Library تغییر نکرده‌اند. |
| Home تغییر غیرضروری داشته؟ | **خیر**؛ کد قدیمی/غیرفعال Home دست‌نخورده است؛ صفحه جدید ساخته نشده است. |
| Navigation تغییر غیرضروری داشته؟ | **خیر**؛ navigate و ساختار route دست‌نخورده‌اند. فقط مسیرهای Settings مطابق شش گزینه نهایی تغییر کرده‌اند. |
| Backup/Restore غیرمرتبط تغییر کرده؟ | **خیر**؛ utility و plugin اصلی backup عیناً بدون تغییرند. فقط پس از restore موفق، theme از storage دوباره در state فعال خوانده می‌شود. |
| dependency جدید اضافه شده؟ | **خیر**؛ package و lock بدون تغییرند. |
| فایل غیرمرتبط تغییر کرده؟ | **خیر**؛ شش فایل تغییرکرده مستقیم به Settings، tokens و اتصال native لازم مربوط‌اند؛ چهار فایل جدید برای همین قابلیت‌ها، تست و گزارش‌اند. |

هیچ refactor گسترده، ترجمه ناقص، تغییر Application ID/نسخه، UI ساختگی یا تغییر غیرضروری موتور پخش انجام نشده است.

## 14. Files Not Modified

این 97 فایل اصلی با مقایسه SHA-256، عیناً بدون تغییرند. `DELIVERY_NOTES.md` و `FIX_REPORT.md` گزارش‌های قبلی‌اند؛ برای این مرحله به همین گزارش مراجعه شود.

- `.env.example`
- `.gitattributes`
- `.github/workflows/android-apk.yml`
- `.gitignore`
- `DELIVERY_NOTES.md`
- `FIX_REPORT.md`
- `README.md`
- `android/.gitignore`
- `android/app/.gitignore`
- `android/app/build.gradle`
- `android/app/capacitor.build.gradle`
- `android/app/proguard-rules.pro`
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/com/adelapp/larkplayer/MainActivity.java`
- `android/app/src/main/java/com/adelapp/larkplayer/RitmoPlaybackService.java`
- `android/app/src/main/java/com/adelapp/larkplayer/RitmoVideoActivity.java`
- `android/app/src/main/java/com/adelapp/larkplayer/SettingsBackupPlugin.java`
- `android/app/src/main/res/drawable-land-hdpi/splash.png`
- `android/app/src/main/res/drawable-land-mdpi/splash.png`
- `android/app/src/main/res/drawable-land-xhdpi/splash.png`
- `android/app/src/main/res/drawable-land-xxhdpi/splash.png`
- `android/app/src/main/res/drawable-land-xxxhdpi/splash.png`
- `android/app/src/main/res/drawable-port-hdpi/splash.png`
- `android/app/src/main/res/drawable-port-mdpi/splash.png`
- `android/app/src/main/res/drawable-port-xhdpi/splash.png`
- `android/app/src/main/res/drawable-port-xxhdpi/splash.png`
- `android/app/src/main/res/drawable-port-xxxhdpi/splash.png`
- `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`
- `android/app/src/main/res/drawable/ic_launcher_background.xml`
- `android/app/src/main/res/drawable/splash.png`
- `android/app/src/main/res/layout/activity_main.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png`
- `android/app/src/main/res/values/ic_launcher_background.xml`
- `android/app/src/main/res/values/strings.xml`
- `android/app/src/main/res/values/styles.xml`
- `android/app/src/main/res/xml/file_paths.xml`
- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`
- `android/build.gradle`
- `android/capacitor.settings.gradle`
- `android/gradle.properties`
- `android/gradle/wrapper/gradle-wrapper.jar`
- `android/gradle/wrapper/gradle-wrapper.properties`
- `android/gradlew`
- `android/gradlew.bat`
- `android/settings.gradle`
- `android/variables.gradle`
- `capacitor.config.ts`
- `git`
- `index.html`
- `metadata.json`
- `package-lock.json`
- `package.json`
- `public/branding/Ritmo.png`
- `public/branding/ritmo-icon.png`
- `public/favicon.png`
- `src/App.tsx`
- `src/components/EqualizerModal.tsx`
- `src/components/FloatingMiniPlayer.tsx`
- `src/components/LarkEqualizerView.tsx`
- `src/components/LarkFoldersView.tsx`
- `src/components/LarkFullScreenPlayer.tsx`
- `src/components/LarkHeader.tsx`
- `src/components/LarkMiniPlayer.tsx`
- `src/components/LarkSongList.tsx`
- `src/components/LarkTabBar.tsx`
- `src/components/LyricsView.tsx`
- `src/components/OfflineToolsPanel.tsx`
- `src/components/QueueDrawer.tsx`
- `src/components/Spatial3DPlayer.tsx`
- `src/components/TopBar.tsx`
- `src/components/TrackUploader.tsx`
- `src/components/VinylPlayer.tsx`
- `src/components/Visualizer.tsx`
- `src/data/equalizerPresets.ts`
- `src/main.tsx`
- `src/types.ts`
- `src/utils/audioEngine.ts`
- `src/utils/settingsBackup.ts`
- `tsconfig.json`
- `vite.config.ts`

## بررسی پیشنهادی روی گوشی پس از build

1. نصب build جدید بدون پاک‌کردن داده برنامه، انتخاب هر پوسته و force stop/reopen.
2. اجرای آهنگ، تغییر سرعت و Repeat، سپس حذف همان آهنگ از کتابخانه و بررسی توقف/خروج صحیح از صف.
3. بازیابی از Settings و بررسی favorite، ترتیب playlist، پوشه و پخش آهنگ پس از force stop/reopen.
4. پنهان‌کردن/نمایش دوباره؛ بررسی حفظ عضویت لیست‌ها.
5. حذف فایل اصلی خارج از Ritmo و بررسی پیام خطا/حفظ رکورد در عملیات بازیابی.
6. بازخورد با و بدون برنامه ایمیل؛ انتخاب مقصد دقیق.
7. backup و restore واقعی از file picker اندروید و امتحان فایل خراب.
