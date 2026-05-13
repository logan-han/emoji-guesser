# Play Store release kit

Files in this folder are not bundled into the APK. They are the source of truth for the Play Console listing.

## Contents
- `listing.md` - title, descriptions, content rating, target audience.
- `data-safety.md` - answers for the Data Safety form.
- `privacy.html` - privacy policy to be hosted at `https://emojiguesser.com/privacy`.
- `screenshots/` - phone screenshots to upload (capture from emulator at 1080x2400).

## Release checklist

1. Internal smoke test on real device with `./gradlew bundleRelease`.
2. Capture screenshots from Pixel 7 emulator API 35, save under `screenshots/`.
3. Upload AAB to Play Console internal testing track.
4. Fill listing per `listing.md`.
5. Fill Data Safety per `data-safety.md`.
6. Publish `privacy.html` to the web frontend so the URL resolves.
7. Wait for Pre-Launch Report (Play Console runs it automatically), resolve any flagged issues.
8. Promote internal -> closed -> open -> production once stable.

## Push notifications

Push is scaffolded but disabled. To enable:
1. Create a Firebase project, register the Android app with package `com.emojiguesser`.
2. Download `google-services.json`, place in `android/app/`.
3. Uncomment `com.google.gms.google-services` plugin in `android/app/build.gradle.kts`.
4. Uncomment the `firebase-bom` and `firebase-messaging-ktx` lines in the same file.
5. Add a `FcmService` extending `FirebaseMessagingService` and declare it in the manifest.
6. Add a backend Lambda endpoint `registerDeviceToken` and a `device_tokens` Supabase table.
