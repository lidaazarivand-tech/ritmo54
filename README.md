# ریتمو / Ritmo

Persian/RTL local music player using React 19, TypeScript, Vite, Capacitor 8,
and Android Media3 1.5.1. The production entry is `src/main.tsx` ->
`src/RitmoAppClean.tsx`. Older `App.tsx`/Lark components remain intact but are
not the active interface.

## Delivery and verification status

The active lyrics engine, native embedded lyrics, playlist controls, Android player insets, and library sorting received targeted fixes. The Songs screen exposes four modes: Persian/English name, newest added, shortest duration, and persisted manual drag-and-drop. Root causes and verification limits are in [the Persian bug-fix report](BUGFIX_REPORT_FA.md). The full project ZIP intentionally contains no `.git` history, local dependencies, APKs, SDK paths, or signing material. A Vite production build, Capacitor sync, Gradle build, and device test were not run in the delivery environment, so this is not a release-certified APK.

## Online lyrics providers

LRCLIB is the primary full-lyrics provider. The app uses its documented exact lookup and search APIs, sends a `Lrclib-Client` identifier, uses the available album/duration metadata, respects rate limits by spacing requests, and supports both plain and timestamped results. LRCLIB's public API documentation confirms anonymous access and browser CORS, but does not itself establish the copyright license for every underlying lyric record; verify rights for your intended distribution, especially commercial use.

Genius is optional metadata assistance only. The official API requires an access token and does not provide complete song lyrics through search; the token entered in the lyrics panel is kept in memory only and is never written into the project, APK, or local storage. The app does not scrape Genius pages. The official API's browser CORS behavior was not verified here. Musixmatch was not wired in: its API requires a private key and an applicable lyrics license, and its display rules include attribution, view tracking, and regional restrictions. A secure server-side integration and approved credentials are required before enabling it.

## Active functionality

Android library scanning supports songs, videos, playlists, folders, artists,
albums, favorites, queue editing, four selectable player skins, eight app themes,
background Media3 playback, notification controls, Recently Deleted, hidden
library entries, settings backup/restore, an in-player 10-band equalizer, and
in-app online lyrics lookup. Older Lark components remain in the repository but
are not part of the active interface.

The browser has an explicit audio file picker and plays files in the current
session. Browser audio bytes/object URLs are not persisted: select the same
files after reload to reconnect their stable IDs with saved memberships.
Native video playback, Android media scanning, and recovery are Android-only.
The lyrics screen can read embedded MP3 ID3 plain and timestamped lyrics, search LRCLIB, and import a user-selected `.lrc` or plain-text file. It does not automatically scan neighboring `.lrc` files because Android scoped-storage access to non-media files is not guaranteed.
Settings backups include favorites, playlists, recent items, player/app preferences, equalizer gains, bookmarks and supported native playback preferences; they do not contain music files or the transient playback queue/current track. Re-select local files after restoring if the library IDs need reconnecting.

Package ID: `com.adelapp.larkplayer`. Version: `1.1.6` / `10106` (RITMO 47).
Minimum API: 24. Compile/target API: 36.

## Build and test

Use **Node 22.18+ with npm**, **JDK 21**, and Android SDK 36. Internet access is
needed for a first install and Gradle dependency resolution. Keep the supplied
`package-lock.json`; use `npm ci`, not a different package manager.

```bash
npm ci
npm run lint
npm test
npm run build
npx cap sync android
cd android
chmod +x gradlew
./gradlew test
./gradlew assembleDebug
# With a connected test device/emulator:
./gradlew connectedDebugAndroidTest
```

On Windows use `gradlew.bat` instead of `./gradlew`; skip `chmod`.
Configure Android SDK discovery through `ANDROID_HOME` or an ignored
`android/local.properties`. `npm test` includes a Java compiler harness, so a
JDK is needed even when testing without Android dependencies.

Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
Open `android/` in Android Studio only after building web assets and running
Capacitor sync. Generated Capacitor/Cordova folders are recreated by sync.
The workflow `.github/workflows/android-apk.yml` builds a debug APK and runs
type checking, Node regressions, and Gradle unit tests. Instrumentation/device
checks are not run by that workflow.

## Data safety and release gates

Deleting original Android audio requires both a verified private backup and
Android consent where applicable. Recovery files stay in `noBackupFilesDir`
and must never be added to settings exports. Interrupted partial backups whose
original is missing are retained for inspection, not silently discarded.
Legacy interrupted restores without an ownership marker are preserved rather
than automatically deleted. SAF export refuses existing non-empty documents.

Before releasing, execute the Android/API-level matrix in the audit report,
including interrupted copy/restore/purge, revoked permissions, Bluetooth,
notification permission, foreground-service restrictions, and process death.
Cross-store backup restoration is not a fully crash-atomic distributed
transaction across WebView storage, native preferences, and live playback.

## GitHub upload instructions

The ZIP deliberately contains source, not `.git` history, dependencies, APKs,
SDK paths, or signing material. Extract it and enter the folder containing
`package.json`, `src/`, and `android/`, not its parent folder.

1. Create an empty GitHub repository. Do not initialize it with a separate
   README/license/gitignore when importing this tree.
2. Install dependencies and run the build/test commands above. Resolve failures
   before publishing a release; the supplied debug workflow is not release signing.
3. Review local staging:

```bash
git init -b main
git add .
git status --short
git diff --cached --check
git ls-files
git fsck --full
```

4. **Run the following only when you choose to authorize a commit/upload.**
   Set your actual Git identity first if Git requests it:

```bash
git config user.name "YOUR NAME"
git config user.email "YOUR EMAIL"
git commit -m "Audit and harden Ritmo data recovery and playback"
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

Replace both URL placeholders. Authenticate through your Git credential
manager/GitHub CLI or SSH; never paste tokens into source/configuration. If
uploading to an existing repository, clone it and review the changes instead
of force-pushing over its history. No commit or push was performed during
this audit.

5. Open **Actions > Build Android APK** and inspect the checks and
   `ritmo-android-apk` artifact. Its APK is debug-signed, not a release build.

## Secrets, signing, and license

Copy `.env.example` to an ignored local `.env` only if you use features that
require it. Never place secrets in Vite/browser-exposed environment values.
Keep release keystores, signing passwords, local SDK paths, and service-account
JSON outside Git. Release signing must be configured locally or with GitHub
encrypted secrets; this repository has no verified release-signing setup.

No license file was supplied. Confirm ownership and add your intended license
before public distribution; the old README's Apache-2.0 claim was unsupported.
