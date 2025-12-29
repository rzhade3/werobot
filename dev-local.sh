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
OPENAI_API_KEY=your-github-models-api-key-here
OPENAI_API_ENDPOINT=https://models.github.ai/inference/chat/completions
OPENAI_MODEL=openai/gpt-4.1
EOF
    echo -e "${GREEN}Created .dev.vars - please update with your API keys${NC}"
fi

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

# Start Durable Objects Worker
echo -e "${BLUE}Step 2: Starting Durable Objects Worker on port 8788...${NC}"
cd durable-objects-worker
npx wrangler dev --port 8788 --local --var ENVIRONMENT:development > ../durable-objects.log 2>&1 &
DO_PID=$!
cd ..
sleep 3

# Start Pages dev server
echo -e "${BLUE}Step 3: Starting Cloudflare Pages dev server on port 8787...${NC}"
npx wrangler pages dev frontend/public --port 8787 --local \
  --binding DB=local --binding SESSIONS=local \
  --service DURABLE_OBJECTS_WORKER=werobot-durable-objects \
  --compatibility-date=2024-01-01 \
  --compatibility-flag=nodejs_compat > pages.log 2>&1 &
PAGES_PID=$!
sleep 5

# Start frontend dev server
echo -e "${BLUE}Step 4: Starting React frontend on port 3000...${NC}"
cd frontend
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
echo -e "  Frontend:  ${BLUE}http://localhost:3000${NC}"
echo -e "  Backend:   ${BLUE}http://localhost:8787${NC}"
echo -e "  WebSocket: ${BLUE}ws://localhost:8787${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Logs:"
echo "  Durable Objects: tail -f durable-objects.log"
echo "  Pages/API:       tail -f pages.log"
echo "  Frontend:        tail -f frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for all background processes
wait
