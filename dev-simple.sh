#!/bin/bash

# Simple Local Development - Frontend Only
# The frontend will proxy API requests through the development setup

echo "🤖 Starting We, Robot - Simple Dev Mode"
echo ""
echo "This runs only the frontend with mock/production API."
echo "For full local backend, use ./dev-local.sh instead."
echo ""

cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Starting React development server..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎮 Frontend running at: http://localhost:3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npm start
