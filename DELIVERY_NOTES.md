# Ritmo work-in-progress

This archive is **not a verified final APK**. The user-supplied Ritmo logo is included unchanged at `public/branding/Ritmo.png`. Its existing icon symbol is cropped for the Android launcher, browser favicon, and current header icon without altering the original artwork.

Implemented: visible app name, removed bundled demo tracks from the runtime, MediaStore audio/video scanner, Media3 music service/session, native video view, rescan, basic library grouping, search, favorites, recently played, resume positions, queue actions, and existing UI preservation.

Validation: esbuild syntax/module-resolution check passed. A complete npm/TypeScript and Android build could not run in the restricted sandbox: npm is unavailable, the Gradle distribution is not cached, and the sandbox has no internet access. Android device testing (permissions, foreground notification, media controls, playback, and video formats) remains required.

Offline Android additions in this iteration: native Media3/PiP video support, local media analysis, on-device bookmarks and listening modes, plus a small Files-attached offline tools panel that preserves the existing layout. No network/API is used by these additions.

Known limitations: the current equalizer affects the HTML audio path, not the new native Media3 audio path. Imported browser `blob:` files are session-only and intentionally not persisted as broken references. No pre-existing Settings screen exists, so rescan is in Files. Full device QA is required before release. Gradle could not run in this sandbox because its distribution is not cached and the sandbox has no internet access.

## UI / player fixes (2026-10-14)

The latest patch updates the active `src/RitmoAppClean.tsx` player path: bottom-dock ordering and direct More-to-track-actions behavior, no duplicate top-menu operation item, text-only sleep timer option with an active pause deadline, a full-height 10-band EQ page with presets and saved gains, browser audio EQ filters, Android Media3 system-equalizer integration, and standard range-based seek interaction. See `PATCH_REPORT_FA.md` for the test results and validation limitations.
