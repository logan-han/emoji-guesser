# 🎮 Emoji Guesser

[![codecov](https://codecov.io/gh/logan-han/emoji-guesser/graph/badge.svg?token=pWvcAae7JM)](https://codecov.io/gh/logan-han/emoji-guesser)

Emoji Guesser is a fun, real-time multiplayer game where players test their emoji interpretation skills. One player describes a secret word using only emojis, while others race to guess the word.

## ✨ Features

-   **Real-time Multiplayer:** Play with friends; every move reaches the others as it happens.
-   **Emoji-only Descriptions:** Challenge your creativity by describing words using a wide selection of emojis.
-   **Dynamic Hint System:** The game provides progressively revealing hints to help guessers.
-   **Scoring System:** Earn points for guessing correctly and for describing effectively.
-   **Public & Private Games:** Join public games or create private lobbies for friends.
-   **Cross-Platform:** Available on Web and Android.

## 🛠️ Tech Stack

-   **Web Frontend:** React, TypeScript, Vite, Emoji Picker
-   **Android App:** Kotlin, Jetpack Compose, Material3, OkHttp
-   **Game Server:** TypeScript on Vercel Functions (Sydney). Actions are plain `POST /api/action` requests; each player follows their game over a Server-Sent Events stream (`GET /api/events`), which also drives the round clock and notices players who drop out.
-   **Database:** Neon Postgres (Vercel Marketplace): games, their event log and who is still connected.
-   **CI/CD:** GitHub Actions for tests and the Android release, Vercel's Git integration for the web app and API, Codecov for coverage.

## 📂 Project Structure

```
emoji-guesser/
├── android/         # Android app (Kotlin, Jetpack Compose)
├── frontend/        # The Vercel project: web app (src/), game server (server/), functions (api/)
├── .github/         # GitHub Actions CI/CD workflows
└── dev-setup.sh     # Local development setup script
```

## 🚀 Getting Started

### Prerequisites

-   Node.js (v24 or later)
-   Yarn
-   For Android: Android Studio, JDK 17

### Local Development

```bash
./dev-setup.sh
cd frontend
yarn dev
```

The dev server serves the game API itself, from memory, at `http://localhost:3000/api`, so two browser tabs can play a whole game with no database. `yarn test` runs the web and server suites (the SQL store runs against PGlite), and `yarn test:e2e` plays a two-player game through Playwright.

## 📱 Android App

The Android app provides a native mobile experience with the same real-time multiplayer functionality.

### Building the Android App

1.  **Open in Android Studio:**
    ```bash
    cd android
    ```
    Open the `android` folder in Android Studio.

2.  **Point it at a game server (optional):**
    The app talks to `https://emoji.han.life/api`. Set `API_URL` as an environment variable, or in `android/local.properties`, to use another one.

3.  **Build Debug APK:**
    ```bash
    ./gradlew assembleDebug
    ```

4.  **Build Release APK:**
    ```bash
    ./gradlew assembleRelease
    ```

### Android CI/CD

The Android app has its own GitHub Actions workflow (`.github/workflows/android.yml`) that:

1.  **Runs Tests:** Unit tests are executed on every push/PR.
2.  **Builds APK/AAB:** Creates both debug and release artifacts.
3.  **Publishes to Play Store:** Automatically uploads to the internal testing track on main branch pushes.

### Android CI/CD Configuration

The Android app is configured for fully automated builds:

- **Keystore**: Generated once with `generate-keystore.sh`, then base64-encoded and stored as the `KEYSTORE_BASE64` GitHub secret. CI decodes it back to `app/keystore.jks` on every run so each release is signed with the same upload key.
- **Signing credentials**: Read from secrets `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. For local release builds, copy `keystore.properties.example` to `keystore.properties` and fill it in; that file is gitignored and must never be committed.
- **Game server**: `API_URL` (env var or `local.properties`) overrides the default `https://emoji.han.life/api`.

**Required secrets for Play Store publishing:**

| Secret | Description |
|--------|-------------|
| `KEYSTORE_BASE64` | Base64-encoded release keystore (`base64 -i app/release-keystore.jks`) |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Signing key alias |
| `KEY_PASSWORD` | Signing key password |
| `PLAY_STORE_SERVICE_ACCOUNT_JSON` | Google Play service account JSON (optional) |

The Play Store upload step only runs if `PLAY_STORE_SERVICE_ACCOUNT_JSON` is configured. See `android/play-store/README.md` for the listing copy, privacy policy, and Data Safety checklist.

## 🚢 Deployment

A push to `main`:

1.  **Runs the tests:** web and game server, end to end in a browser, and Android (`android.yml`).
2.  **Deploys the web app and the game server:** Vercel builds `frontend/` (Root Directory) and serves it at https://emoji.han.life, with the functions in `frontend/api/` in `syd1` next to the Neon database (`DATABASE_URL` comes from the Neon integration). The tables create themselves on first use; `frontend/server/sqlStore.ts` holds the schema.
3.  **Releases Android:** the AAB is built and uploaded to the Google Play internal testing track.

## 📜 Available Scripts

### Frontend (`/frontend`)

-   `yarn dev`: Start the development server, game server included.
-   `yarn build`: Build the app for production.
-   `yarn test`: Run the web and game server tests.
-   `yarn test:coverage`: Run tests and generate a coverage report.
-   `yarn test:e2e`: Run the Playwright suite, including a real two-player game.

### Android (`/android`)

-   `./gradlew assembleDebug`: Build debug APK.
-   `./gradlew assembleRelease`: Build release APK.
-   `./gradlew bundleRelease`: Build release AAB for Play Store.
-   `./gradlew test`: Run unit tests (JVM and Robolectric).
-   `./gradlew createDebugUnitTestCoverageReport`: Run unit tests and write a JaCoCo report to `app/build/reports/coverage/test/debug/`.
-   `./gradlew lint`: Run Android lint checks.
