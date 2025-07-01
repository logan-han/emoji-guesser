#!/bin/bash

# Local development script for Emoji Guesser
echo "🛠️  Starting local development environment..."

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check dependencies
echo "📋 Checking dependencies..."

if ! command_exists node; then
    echo "❌ Node.js is not installed. Please install Node.js 20 or later."
    exit 1
fi

if ! command_exists yarn; then
    echo "❌ Yarn is not installed. Please install Yarn package manager."
    exit 1
fi

# Check if serverless is installed
if ! command_exists sls; then
    echo "📦 Installing Serverless Framework..."
    npm install -g serverless
fi

# Install dependencies
echo "📦 Installing backend dependencies..."
cd backend
yarn install

echo "📦 Installing frontend dependencies..."
cd ../frontend
yarn install

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file from example..."
    cp .env.example .env
    echo "📝 Please edit frontend/.env with your WebSocket URL after deploying the backend"
fi

echo "✅ Setup complete!"
echo ""
echo "🚀 To start development:"
echo "1. Deploy backend: cd backend && yarn sls deploy"
echo "2. Update frontend/.env with the WebSocket URL"
echo "3. Start frontend: cd frontend && yarn start"
echo ""
echo "📚 Available commands:"
echo "  Backend:"
echo "    cd backend && yarn sls deploy       # Deploy to AWS"
echo "    cd backend && yarn sls logs -f default  # View logs"
echo "    cd backend && yarn sls remove       # Remove deployment"
echo ""
echo "  Frontend:"
echo "    cd frontend && yarn start           # Start dev server"
echo "    cd frontend && yarn build           # Build for production"
echo "    cd frontend && yarn test            # Run tests"
