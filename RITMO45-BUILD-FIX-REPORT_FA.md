# RITMO 45 | گزارش رفع خطای GitHub Actions

## خطای گزارش‌شده

اجرای GitHub Actions که کاربر ارائه کرد در مرحله TypeScript با خطاهای `verification/browser-entry.tsx` متوقف شده بود. قرارداد فعال `PlaylistDetail` در `src/components/PlaylistDetail.tsx` این است: `reorderTrack(from: number, to: number)` و `visibleTrackIndexes: number[]` و `manual: boolean`. این کامپوننت دیگر propی به نام `moveTrack` ندارد.

## علت ریشه‌ای و اصلاح

- Fixture مرورگر هنوز API قدیمی را می‌فرستاد: جابه‌جایی با شناسه‌های string و callback منسوخ `moveTrack={(id,direction) ...}`.
- هم‌زمان، پارامترهای callback بدون نوع بودند و TypeScript برای `direction` و `id` خطای implicit-any می‌داد.
- `verification/browser-entry.tsx` حالا اندیس مبدأ/مقصد عددی را می‌پذیرد و با splice همان قرارداد و رفتار Drag & Drop جاری را شبیه‌سازی می‌کند؛ props لازم `visibleTrackIndexes` و `manual` نیز فراهم شده‌اند. callback منسوخ حذف شده است.
- `verification/browser-smoke.mjs` به‌روزرسانی شد تا به‌جای جابه‌جایی قدیمی روی خود ردیف/کلیدهای فلش، دستگیرهٔ فعلی ⠿ را برای Drag & Drop آزمایش کند.
- یک regression test به `tests/playlist-detail.test.mjs` افزوده شد تا قرارداد fixture، نوع عددی reorder، props لازم و نبود callback قدیمی را بررسی کند.

## نتایج واقعی

- **PASS**: `node --experimental-strip-types --test tests/*.test.mjs`، 223 تست موفق، 0 ناموفق.
- **PASS**: `node --check verification/browser-smoke.mjs`.
- **NOT RUN**: `npm ci`، `npm run build`، `npm run lint`، `npm test` از طریق npm، `npx cap sync android` و Gradle APK build؛ npm/npx/TypeScript/esbuild/Gradle/Javac و Android SDK در محیط حاضر نصب نیستند. Node tests مستقیماً با Node اجرا شدند.
- **NOT RUN**: اجرای مجدد GitHub Actions؛ دسترسی نوشتن/اجرای مجدد Workflow در مخزن انجام نشد. موفقیت نهایی GitHub تأیید نشده است.
- **NOT CONFIRMED**: هشدارهای Action version؛ گزارش ارائه‌شده فقط خطاهای TypeScript و exit code 1 را نقل کرده و متن هشدارها در دسترس نیست، بنابراین Workflow عمداً تغییر نکرد.

هیچ تغییر ظاهری/عملکردی برنامه، تنظیمات پخش، Gradle یا فایل‌های Actions انجام نشد؛ هیچ Commit یا Push انجام نشده است.
