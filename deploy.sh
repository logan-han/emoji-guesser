#!/bin/bash

# Deployment script for Emoji Guesser
set -e

echo "🚀 Starting deployment..."

# Check if required environment variables are set
if [ -z "$AWS_PROFILE" ] && [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "❌ AWS credentials not configured. Please set AWS_PROFILE or AWS credentials."
    exit 1
fi

# Deploy backend
echo "📦 Deploying backend..."
cd backend
yarn install
yarn sls deploy --stage prod

# Get WebSocket URL
echo "🔗 Getting WebSocket URL..."
WS_URL=$(yarn sls info --stage prod --verbose | grep -o 'wss://[^[:space:]]*' | head -1)
echo "WebSocket URL: $WS_URL"

# Build and prepare frontend
echo "🎨 Building frontend..."
cd ../frontend
yarn install

# Create production environment file
echo "REACT_APP_WS_URL=${WS_URL}" > .env.production

# Build frontend
yarn build

echo "✅ Deployment complete!"
echo "📋 Next steps:"
echo "1. Deploy the frontend build/ folder to your hosting service"
echo "2. Update your DNS settings if needed"
echo "3. Test the application"
echo ""
echo "Frontend build is ready in: ./frontend/build/"
echo "WebSocket URL: $WS_URL"
