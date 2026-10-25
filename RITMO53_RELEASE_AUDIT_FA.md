# ممیزی نهایی Ritmo53 برای انتشار

## حکم انتشار

سورس و تست‌های موجود بررسی شدند و مسیر امن امضای Release اضافه شد، اما **APK/AAB امضاشده و آماده‌ی بارگذاری ساخته نشد**. این محیط کلید امضای قابل دسترس، npm، Android SDK و نسخه‌ی Gradle موردنیاز را ندارد؛ دسترسی شبکه‌ی sandbox هم اجازه‌ی دریافت Gradle را نداد. فایل خروجی Release یا موفقیت Build محلی جعل نشده است.

## نسخه‌ی دقیق بررسی‌شده

- مخزن عمومی: [lidaazarivand-tech/ritmo53](https://github.com/lidaazarivand-tech/ritmo53)، شاخه‌ی `main`.
- آخرین Commit مشاهده‌شده: `68a09c7aeb15bbb0eb78ae0dab9fc40df52ec6c7`، پیام `Update Ritmo project`، زمان ثبت `2026-10-25T19:03:06Z`. صفحه‌ی مخزن یک Commit و بدون Tag نشان می‌داد.
- آرشیو شاخه‌ی `main` با ۲۲۱ فایل دریافت شد. فایل‌های پروژه‌ی استخراج‌شده با آرشیو GitHub پیش از تغییرات این ممیزی، بایت‌به‌بایت مطابق بودند.
- فایل ZIP مخزن `.git` ندارد. Commit واقعی از صفحه‌ی عمومی GitHub تأیید شد؛ برای کار محلی، نقطه‌ی بازگشت محلی و شاخه‌ی `audit/ritmo53-release` ساخته شد. Commit محلی `c3cce7a4c09fe3909c7ac6b6a11e9acaa1ebadf8` یک snapshot واردشده است، نه Commit upstream.

## یافته‌های مهم و اصلاح

- **Release signing در Gradle تعریف نشده بود.** در `android/app/build.gradle` امضای Release اضافه شد. propertyهای Gradle کاربر با نام‌های `ritmoStoreFile`, `ritmoStorePassword`, `ritmoKeyAlias`, `ritmoKeyPassword` اولویت دارند؛ aliasهای `RITMO_RELEASE_STORE_FILE`, `RITMO_RELEASE_STORE_PASSWORD`, `RITMO_RELEASE_KEY_ALIAS`, `RITMO_RELEASE_KEY_PASSWORD` هم در Gradle Properties پشتیبانی می‌شوند و نام‌های `RITMO_RELEASE_*` در Environment نیز خوانده می‌شوند. هیچ مقدار محرمانه در سورس قرار نگرفته است. درخواست بسته‌بندی Release بدون تنظیم کامل امضا با خطای روشن متوقف می‌شود.
- در ZIP قبلی فقط نام‌های `RITMO_RELEASE_*` تنظیم شده بود. فایل `%USERPROFILE%\.gradle\gradle.properties` در محیط حاضر و mountهای قابل دسترس وجود نداشت، پس نمی‌شد propertyهای شخصی را مستقیم تطبیق داد. برای سازگاری با هر دو نام‌گذاری، propertyهای دقیق `ritmoStoreFile`, `ritmoStorePassword`, `ritmoKeyAlias`, `ritmoKeyPassword` با اولویت در Gradle اضافه شدند. فقط نام propertyها بررسی شد و هیچ مقداری چاپ نشد.
- **تست regression برای قرارداد امضا** در `tests/release-signing.test.mjs` افزوده شد؛ وجود secretهای hardcoded و نبود الگوهای ignore برای keystore را بررسی می‌کند.
- مشکل مسیر Windows در `tests/recovery-regressions.test.mjs` در upstream **از قبل اصلاح شده بود**: `fileURLToPath` و `new URL('..', import.meta.url)` از قبل وجود داشتند؛ همان فایل تغییر داده نشد.
- هیچ کد پخش، رابط کاربری، Dependency، Lockfile، مجوز Android یا نسخه‌ی برنامه تغییر نکرد. هیچ فایل یا قابلیت حذف نشد.
- اختلاف نام نسخه باقی است: `package.json` و Gradle نسخه‌ی `1.1.6`، `versionCode 10106` دارند، درحالی‌که README برچسب `RITMO 47` را دارد و نام مخزن Ritmo53 است. این مورد بدون دانستن سیاست نسخه و نسخه‌ی فعلی فروشگاه‌ها تغییر داده نشد.

## قابلیت‌ها و پیکربندی بررسی‌شده

- ورودی اصلی React: `src/main.tsx` به `src/RitmoAppClean.tsx` می‌رود. سورس شامل پخش پس‌زمینه‌ی Media3/MediaSession، صف، فهرست‌های پخش، مرتب‌سازی دستی، پوسته‌های پلیر، متن ترانه، اکولایزر ۱۰ باند، سرعت/صدا، تایمر خواب، تنظیمات و بازیابی، ویدئو و مدیریت Safe Area است.
- تست‌های موجود playback, queue, backup, lyrics, sort/order, player skins, seek و مسیرهای Android را پوشش می‌دهند. اجرای آزمون روی دستگاه واقعی انجام نشد.
- `applicationId`: `com.adelapp.larkplayer`; `minSdk 24`, `targetSdk 36`, `compileSdk 36`; Android Gradle Plugin `8.13.0`; Gradle Wrapper `8.14.3`.
- `package-lock.json` با اطلاعات ریشه‌ی `package.json` تطبیق داده شد. `.gitignore` خروجی‌ها، فایل‌های env محلی، keystore و تنظیمات محلی را پوشش می‌دهد؛ Wrapper حفظ شده است.
- Manifest از cleartext traffic جلوگیری می‌کند. مجوزهای رسانه، اعلان و foreground media playback تعریف شده‌اند. ارزیابی نهایی رفتار مجوزها روی دستگاه انجام نشد.
- اسکن ثابت فایل‌های موجود، `.env.example` را تنها فایل env یافت؛ الگوی کلید خصوصی یا API key رایج تطبیق پیدا نکرد. این بررسی تضمین نبود هر نوع secret نیست.

## امضا و ابزارهای محلی

- مسیرهای متناظر با `%USERPROFILE%\RitmoSigning\ritmo-release.jks` و `%USERPROFILE%\.gradle\gradle.properties` در محیط لینوکس حاضر موجود نبودند. پروفایل Windows کاربر در این محیط Mount نشده، پس محتوای آن قابل بررسی نبود.
- فایل keystore و تنظیمات امضای کاربر در محیط قابل مشاهده نبودند؛ `apksigner`, Android SDK و Android Studio نیز موجود نبودند. `keytool` موجود است، اما keystoreای برای بررسی وجود نداشت.
- برای ساخت امن، تنظیمات بالا را فقط در فایل خصوصی `%USERPROFILE%\.gradle\gradle.properties` یا environment محلی وارد کنید. مسیر Windows را در Gradle Properties با `/` بنویسید. رمزها را در سورس، ZIP یا GitHub قرار ندهید. از همان کلید موجود برای به‌روزرسانی استفاده کنید؛ کلید جدید جایگزین سازگار با نسخه‌ی منتشرشده نیست.

## تست‌ها و Build

- خط مبنای آرشیو upstream، اجرای مستقیم Node از پوشه‌ی جدا: **۲۴۸ موفق، ۰ ناموفق، ۰ ردشده**.
- پس از اصلاح امضا و افزودن دو تست: اجرای مستقیم `node --experimental-strip-types --test tests/*.test.mjs` از مسیر دارای فاصله: **۲۵۰ موفق، ۰ ناموفق، ۰ ردشده**. این اجرا از Node بود، نه `npm test`.
- `git diff --check`: موفق.
- نصب وابستگی و فرمان‌های `npm ci`, `npm test`, `npm run lint`, `npm run build`: **اجرانشده/مسدود**؛ هر چهار فرمان با `npm: command not found` و کد خروجی ۱۲۷ متوقف شدند. `node_modules` هم وجود نداشت.
- Gradle: اجرای `bash ./gradlew :app:assembleRelease --stacktrace` تلاش کرد Gradle `8.14.3` را بگیرد، اما با `UnknownHostException: services.gradle.org` متوقف شد؛ هیچ task اندرویدی اجرا نشد و APK/AAB تولید نشد.
- JDK محلی ۱۷ است؛ Workflow اصلی GitHub از JDK 21 و Android SDK 36 استفاده می‌کند. دستگاه/شبیه‌ساز و `adb` وجود ندارد.
- GitHub Actions برای Commit upstream `68a09c7` یک اجرای موفق `Build Android APK #1` با زمان ۲ دقیقه و ۵۴ ثانیه گزارش می‌کرد. Workflow آن `npm ci`, build وب، Capacitor sync، lint، Node tests، Gradle tests و `assembleDebug` را اجرا می‌کند. این CI مربوط به Commit upstream است و **تغییر امضای محلی این ممیزی را اعتبارسنجی نمی‌کند**؛ خروجی Release نیست.

## کافه‌بازار و مایکت

- [راهنمای رسمی بازار](https://developers.cafebazaar.ir/fa/guidelines/developers-panel/app-release) پذیرش APK و AAB را شرح می‌دهد. برای AAB، راهنما فایل رمزنگاری‌شده‌ی Bundle Signer را هم لازم می‌داند. بازار در مرحله‌ی بارگذاری APK، `VersionCode`, `VersionName`, `TargetSDK`, `MinSDK` و معماری را نمایش می‌دهد.
- راهنمای بازار آیکون PNG مربع ۵۱۲×۵۱۲ با حداکثر ۳ مگابایت و دست‌کم یک Screenshot (حداکثر ۱ مگابایت، حداکثر ۱۲ تصویر) می‌خواهد. `public/branding/ritmo-icon.png` ابعاد ۵۱۲×۵۱۲ و حجم ۲۵۵٬۲۸۲ بایت دارد و از نظر این معیار مناسب است. اسکرین‌شات‌های آماده‌ی صفحه‌ی فروشگاه در سورس یافت نشدند و باید از اجرای نهایی برنامه گرفته و در پنل بارگذاری شوند.
- [راهنمای مایکت](https://myket.ir/kb/pages/app-release/) مسیر بارگذاری APK و تکمیل اطلاعات برنامه، اطلاعات نسخه/تغییرات و تصاویر را مشخص می‌کند. [اعلان Target SDK مایکت](https://myket.ir/kb/pages/target-sdk-34/) می‌گوید از ۱ آبان ۱۴۰۵ ارسال نسخه‌ی جدید با Target SDK پایین‌تر از ۳۴ پذیرفته نمی‌شود. Target SDK این پروژه ۳۶ است و حد این اعلان را برآورده می‌کند.
- یک APK **Release امضاشده** می‌تواند برای بارگذاری بازار و مایکت استفاده شود؛ AAB فقط برای بازار در راهنمای فعلی دیده شد و به فرایند Bundle Signer نیاز دارد. هیچ بسته‌ی امضاشده‌ای در این ممیزی ساخته نشد.
- مالک حساب باید تأیید کند `versionCode 10106` از نسخه‌ی منتشرشده بالاتر است، امضای آن با کلید قبلی یکسان است، اطلاعات ناشر و متن انتشار را تکمیل کند، اسکرین‌شات‌ها و توضیحات را در پنل‌ها بارگذاری کند و درخواست بررسی هر فروشگاه را ثبت کند.

## خروجی و وضعیت Git

- هیچ APK/AAB تولید یا اعتبارسنجی نشد؛ خروجی بسته‌ی نصب در پروژه وجود ندارد.
- تغییرات فقط در `android/app/build.gradle` و فایل تازه‌ی `tests/release-signing.test.mjs` هستند. تغییرات بررسی و `git diff --check` اجرا شد. Commit نهایی و Push انجام نشد.
- خروجی ZIP نهایی باید شامل سورس، Workflowها، Lockfile و Gradle Wrapper باشد؛ `.git`, `node_modules`, cache، کلید و خروجی موقت باید حذف بمانند.

## آنچه برای نهایی‌کردن انتشار لازم است

1. در Windows یا محیط دارای JDK 21، Node 22، npm، Android SDK 36 و شبکه، تنظیمات خصوصی امضا را ثبت کنید و `npm ci`, `npm run lint`, `npm test`, `npm run build`, `npx cap sync android` و سپس `android\\gradlew.bat test assembleRelease` را اجرا کنید.
2. APK را با `apksigner verify --verbose --print-certs` اعتبارسنجی کنید و package/versionCode را از APK بررسی کنید؛ نصب و اجرای Playback، اعلان و safe area را روی دستگاه انجام دهید.
3. امضای به‌دست‌آمده را با کلید نسخه‌ی قبلی تطبیق دهید، و `versionCode` را با پنل فروشگاه مقایسه کنید.
4. اسکرین‌شات‌های واقعی برنامه و اطلاعات فهرست فروشگاه را تهیه کنید. فقط پس از این بررسی‌ها، APK را برای بررسی در پنل‌های بازار و مایکت بارگذاری کنید.
