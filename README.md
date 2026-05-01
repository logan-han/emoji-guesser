# 🎮 Emoji Guesser

[![codecov](https://codecov.io/gh/logan-han/emoji-guesser/graph/badge.svg?token=pWvcAae7JM)](https://codecov.io/gh/logan-han/emoji-guesser)

Emoji Guesser is a fun, real-time multiplayer game where players test their emoji interpretation skills. One player describes a secret word using only emojis, while others race to guess the word.

## ✨ Features

-   **Real-time Multiplayer:** Play with friends using WebSockets for instant communication.
-   **Emoji-only Descriptions:** Challenge your creativity by describing words using a wide selection of emojis.
-   **Dynamic Hint System:** The game provides progressively revealing hints to help guessers.
-   **Scoring System:** Earn points for guessing correctly and for describing effectively.
-   **Public & Private Games:** Join public games or create private lobbies for friends.
-   **Cross-Platform:** Available on Web and Android.

## 🛠️ Tech Stack

-   **Web Frontend:** React, TypeScript, Create React App, Emoji Picker
-   **Android App:** Kotlin, Jetpack Compose, Material3, OkHttp WebSockets
-   **Backend:** Node.js, TypeScript, Serverless Framework
-   **Infrastructure:** AWS Lambda, API Gateway (WebSockets), Supabase Postgres and Supabase Realtime for game state persistence and sync.
-   **CI/CD:** GitHub Actions for automated testing and deployment, Codecov for test coverage tracking.

## 📂 Project Structure

```
emoji-guesser/
├── android/         # Android app (Kotlin, Jetpack Compose)
├── backend/         # Serverless backend (Node.js, TypeScript)
├── frontend/        # React web frontend
├── .github/         # GitHub Actions CI/CD workflows
├── deploy.sh        # Manual deployment script
└── dev-setup.sh     # Local development setup script
```

## 🚀 Getting Started

### Prerequisites

-   Node.js (v22 or later)
-   Yarn
-   Serverless Framework (`npm install -g serverless`)
-   Configured AWS Credentials
-   Supabase project with the schema in `backend/supabase/schema.sql` applied
-   For Android: Android Studio, JDK 17

### Local Development

1.  **Run the setup script:**
    This will install all dependencies for both the frontend and backend.
    ```bash
    ./dev-setup.sh
    ```

2.  **Deploy the Backend:**
    The frontend requires a running backend to connect to.
    Configure these environment variables before deploying:
    ```bash
    export SUPABASE_URL=https://your-project.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
    export SUPABASE_PUBLISHABLE_KEY=your-publishable-key
    export SUPABASE_GAMES_TABLE=games
    ```
    ```bash
    cd backend
    yarn sls deploy
    ```

3.  **Configure Frontend:**
    After deploying, the WebSocket URL will be printed to the console.
    -   Copy the `wss://...` URL.
    -   Create a `.env` file in the `frontend` directory by copying the example: `cp frontend/.env.example frontend/.env`.
    -   Paste the WebSocket URL into `frontend/.env` for the `REACT_APP_WS_URL` variable.
    -   Add your Supabase URL and anon or publishable key for the `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` variables.

For GitHub Actions deployments, configure these repository secrets:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Supabase project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend-only service role key |
| `SUPABASE_PUBLISHABLE_KEY` | Frontend Supabase publishable key |

4.  **Start the Frontend:**
    ```bash
    cd frontend
    yarn start
    ```
    The application will be available at `http://localhost:3000`.

## 📱 Android App

The Android app provides a native mobile experience with the same real-time multiplayer functionality.

### Building the Android App

1.  **Open in Android Studio:**
    ```bash
    cd android
    ```
    Open the `android` folder in Android Studio.

2.  **Configure WebSocket URL:**
    Update the `WS_URL` in `app/build.gradle.kts` or set it as an environment variable.

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

- **Keystore**: Auto-generated during CI using `generate-keystore.sh`
- **Signing credentials**: Stored in `keystore.properties` (committed to private repo)
- **WebSocket URL**: Automatically fetched from backend deployment

**Optional secret for Play Store publishing:**

| Secret | Description |
|--------|-------------|
| `PLAY_STORE_SERVICE_ACCOUNT_JSON` | Google Play service account JSON (optional) |

The Play Store upload step only runs if this secret is configured.

## 🚢 Deployment

This project is configured for continuous deployment using GitHub Actions. A push to the `main` branch will automatically trigger the following:

1.  **Run Tests:** Frontend, backend, and Android tests are executed.
2.  **Deploy Backend:** The Serverless backend is deployed to the `prod` stage on AWS.
3.  **Build & Deploy Frontend:** The React application is built and synced to an S3 bucket, with a CloudFront invalidation to ensure the latest version is served.
4.  **Build & Deploy Android:** The Android AAB is built and uploaded to Google Play internal testing track.

For manual deployment, you can use the `deploy.sh` script after configuring your `AWS_PROFILE`.

```bash
./deploy.sh
```

## 📜 Available Scripts

### Backend (`/backend`)

-   `yarn deploy`: Deploy the service to the `dev` stage.
-   `yarn deploy:prod`: Deploy the service to the `prod` stage.
-   `yarn test`: Run backend tests.
-   `yarn logs`: Tail the logs for the default function.
-   `yarn remove`: Remove the deployed service from AWS.

### Frontend (`/frontend`)

-   `yarn start`: Start the development server.
-   `yarn build`: Build the app for production.
-   `yarn test`: Run frontend tests.
-   `yarn test:coverage`: Run tests and generate a coverage report.

### Android (`/android`)

-   `./gradlew assembleDebug`: Build debug APK.
-   `./gradlew assembleRelease`: Build release APK.
-   `./gradlew bundleRelease`: Build release AAB for Play Store.
-   `./gradlew test`: Run unit tests.
-   `./gradlew lint`: Run Android lint checks.
