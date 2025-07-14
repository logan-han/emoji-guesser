# 🎮 Emoji Guesser

[![codecov](https://codecov.io/gh/logan-han/emoji-guesser/graph/badge.svg?token=pWvcAae7JM)](https://codecov.io/gh/logan-han/emoji-guesser)

Emoji Guesser is a fun, real-time multiplayer game where players test their emoji interpretation skills. One player describes a secret word using only emojis, while others race to guess the word.

## ✨ Features

-   **Real-time Multiplayer:** Play with friends using WebSockets for instant communication.
-   **Emoji-only Descriptions:** Challenge your creativity by describing words using a wide selection of emojis.
-   **Dynamic Hint System:** The game provides progressively revealing hints to help guessers.
-   **Scoring System:** Earn points for guessing correctly and for describing effectively.
-   **Public & Private Games:** Join public games or create private lobbies for friends.

## 🛠️ Tech Stack

-   **Frontend:** React, TypeScript, Create React App, Emoji Picker
-   **Backend:** Node.js, TypeScript, Serverless Framework
-   **Infrastructure:** AWS Lambda, API Gateway (WebSockets), DynamoDB for data persistence.
-   **CI/CD:** GitHub Actions for automated testing and deployment, Codecov for test coverage tracking.

## 📂 Project Structure

```
emoji-guesser/
├── backend/         # Serverless backend (Node.js, TypeScript)
├── frontend/        # React frontend application
├── .github/         # GitHub Actions CI/CD workflows
├── deploy.sh        # Manual deployment script
└── dev-setup.sh     # Local development setup script
```

## 🚀 Getting Started

### Prerequisites

-   Node.js (v20 or later)
-   Yarn
-   Serverless Framework (`npm install -g serverless`)
-   Configured AWS Credentials

### Local Development

1.  **Run the setup script:**
    This will install all dependencies for both the frontend and backend.
    ```bash
    ./dev-setup.sh
    ```

2.  **Deploy the Backend:**
    The frontend requires a running backend to connect to.
    ```bash
    cd backend
    yarn sls deploy
    ```

3.  **Configure Frontend:**
    After deploying, the WebSocket URL will be printed to the console.
    -   Copy the `wss://...` URL.
    -   Create a `.env` file in the `frontend` directory by copying the example: `cp frontend/.env.example frontend/.env`.
    -   Paste the WebSocket URL into `frontend/.env` for the `REACT_APP_WS_URL` variable.

4.  **Start the Frontend:**
    ```bash
    cd frontend
    yarn start
    ```
    The application will be available at `http://localhost:3000`.

## 🚢 Deployment

This project is configured for continuous deployment using GitHub Actions. A push to the `main` branch will automatically trigger the following:

1.  **Run Tests:** Frontend and backend tests are executed.
2.  **Deploy Backend:** The Serverless backend is deployed to the `prod` stage on AWS.
3.  **Build & Deploy Frontend:** The React application is built and synced to an S3 bucket, with a CloudFront invalidation to ensure the latest version is served.

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
