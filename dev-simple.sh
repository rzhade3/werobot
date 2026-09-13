#!/bin/bash

# Simple Local Development - Frontend Only
# The frontend will proxy API requests through the development setup

echo "🤖 Starting We, Robot - Simple Dev Mode"
echo ""
echo "This runs only the frontend with mock/production API."
echo "For full local backend, use ./dev-local.sh instead."
echo ""

# Function to load env files safely
load_env_file() {
    local file="$1"
    if [ -f "$file" ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            line=$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
            if [[ -n "$line" && ! "$line" =~ ^# ]]; then
                export "$line" 2>/dev/null || true
            fi
        done < "$file"
    fi
}

load_env_file ".dev.vars"
load_env_file ".env"

FRONTEND_PORT="${FRONTEND_PORT:-${PORT:-3000}}"
HOST="${HOST:-localhost}"
FRONTEND_URL="http://${HOST}:${FRONTEND_PORT}"

cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Starting React development server on port ${FRONTEND_PORT}..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎮 Frontend running at: ${FRONTEND_URL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PORT="${FRONTEND_PORT}" npm start
