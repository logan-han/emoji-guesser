#!/bin/bash

# Local development setup for Emoji Guesser
set -e
echo "🛠️  Setting up Emoji Guesser..."

command -v node >/dev/null 2>&1 || { echo "❌ Node.js 24 or later is required."; exit 1; }
command -v yarn >/dev/null 2>&1 || { echo "❌ Yarn is required (npm install -g yarn)."; exit 1; }

cd frontend
yarn install

echo "✅ Setup complete!"
echo ""
echo "🚀 cd frontend && yarn dev"
echo "   The dev server runs the game server in memory, so open two tabs and play."
