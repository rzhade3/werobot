#!/bin/bash

# Local Development Script for We, Robot
# This script starts all necessary services for local development

set -e

echo "🤖 Starting We, Robot Local Development Environment"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .dev.vars exists
if [ ! -f ".dev.vars" ]; then
    echo -e "${RED}Error: .dev.vars file not found in root directory${NC}"
    echo "Creating .dev.vars with default values..."
    cat > .dev.vars << 'EOF'
# Configurable Ports for Local Development
# FRONTEND_PORT=3000
# PAGES_PORT=8787

# Optional: External API fallback (only works in non-production)
# OPENAI_API_KEY=your-api-key-here
# OPENAI_API_ENDPOINT=https://models.github.ai/inference/chat/completions
# OPENAI_MODEL=openai/gpt-4.1
EOF
    echo -e "${GREEN}Created .dev.vars - Cloudflare AI will be used by default${NC}"
    echo -e "${GREEN}You can optionally configure external API fallback for development${NC}"
fi

# Function to load env files safely
load_env_file() {
    local file="$1"
    if [ -f "$file" ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            # Trim leading/trailing whitespace
            line=$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
            # Ignore comments and empty lines
            if [[ -n "$line" && ! "$line" =~ ^# ]]; then
                export "$line" 2>/dev/null || true
            fi
        done < "$file"
    fi
}

load_env_file ".dev.vars"
load_env_file ".env"

# Environment Variable Configurations with Defaults
PAGES_PORT="${PAGES_PORT:-${BACKEND_PORT:-8787}}"
FRONTEND_PORT="${FRONTEND_PORT:-${PORT:-3000}}"
HOST="${HOST:-localhost}"

FRONTEND_URL="http://${HOST}:${FRONTEND_PORT}"
BACKEND_URL="http://${HOST}:${PAGES_PORT}"
WS_URL="ws://${HOST}:${PAGES_PORT}"

# Function to kill background processes on exit
cleanup() {
    echo ""
    echo -e "${BLUE}Shutting down services...${NC}"
    kill $(jobs -p) 2>/dev/null || true
    exit
}

trap cleanup EXIT INT TERM

echo -e "${BLUE}Step 1: Installing dependencies...${NC}"

# Install frontend dependencies if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Install backend dependencies if needed
if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

echo ""
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Apply any pending local D1 migrations. Wrangler records applied migrations,
# so each migration runs only once.
echo -e "${BLUE}Step 2: Applying local database migrations...${NC}"
npx wrangler \
  --config local/wrangler.toml \
  d1 migrations apply werobot \
  --local \
  --persist-to local/.wrangler/state > /dev/null
echo -e "${GREEN}✓ Local database migrations applied${NC}"
echo ""

# Start the Pages API and Durable Objects worker together.
# The local config omits the remote Workers AI binding.
echo -e "${BLUE}Step 3: Starting local backend on port ${PAGES_PORT}...${NC}"
(
  cd local
  ../node_modules/.bin/wrangler \
    --config wrangler.toml \
    --config ../durable-objects-worker/wrangler.toml \
    pages dev public \
    --port "${PAGES_PORT}" \
    --persist-to .wrangler/state \
    --local
) > pages.log 2>&1 &
BACKEND_PID=$!
sleep 5

# Start frontend dev server
echo -e "${BLUE}Step 4: Starting React frontend on port ${FRONTEND_PORT}...${NC}"
cd frontend
PORT="${FRONTEND_PORT}" \
REACT_APP_API_URL="${REACT_APP_API_URL:-${BACKEND_URL}/api}" \
REACT_APP_WS_URL="${REACT_APP_WS_URL:-${WS_URL}}" \
npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo ""
echo -e "${GREEN}✓ All services started!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎮 We, Robot is running!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  Frontend:  ${BLUE}${FRONTEND_URL}${NC}"
echo -e "  Backend:   ${BLUE}${BACKEND_URL}${NC}"
echo -e "  WebSocket: ${BLUE}${WS_URL}${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Logs:"
echo "  Backend:  tail -f pages.log"
echo "  Frontend: tail -f frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for all background processes
wait
