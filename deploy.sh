#!/bin/bash
set -e

echo "🚀 Deploying WeRobot (Same-Origin Architecture)"
echo ""

# Step 1: Deploy Durable Objects Worker
echo "📦 Step 1: Deploying Durable Objects Worker..."
cd durable-objects-worker
npx wrangler deploy
cd ..
echo "✅ Durable Objects Worker deployed!"
echo ""

# Step 2: Deploy Cleanup Worker
echo "🧹 Step 2: Deploying Cleanup Worker..."
cd cleanup-worker
npm install
npx wrangler deploy
cd ..
echo "✅ Cleanup Worker deployed!"
echo ""

# Step 3: Build frontend
echo "🏗️  Step 3: Building frontend..."
cd frontend
npm install
npm run build
cd ..
echo "✅ Frontend built!"
echo ""

# Step 4: Deploy Pages (frontend + API via Functions)
echo "📤 Step 4: Deploying Pages with Functions..."
npx wrangler pages deploy frontend/build --project-name=werobot
echo ""

echo "✅ Deployment complete!"
echo ""
echo "🌐 Your app: https://werobot.pages.dev"
echo ""
echo "Architecture:"
echo "  ├─ Frontend: https://werobot.pages.dev"
echo "  ├─ API: https://werobot.pages.dev/api/*"
echo "  ├─ WebSocket: wss://werobot.pages.dev/api/ws"
echo "  └─ Durable Objects: Internal service binding (no public URL)"

echo "  └─ Cleanup Worker: Scheduled (runs every 2 hours)"
