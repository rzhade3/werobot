#!/bin/bash
set -euo pipefail

echo "🚀 Deploying WeRobot"
echo ""

# Step 1: Apply pending D1 migrations
echo "🗄️  Step 1: Recording D1 restore point and applying migrations..."
npx wrangler --config wrangler.toml d1 time-travel info werobot
npx wrangler --config wrangler.toml d1 migrations apply werobot --remote
echo "✅ D1 migrations applied!"
echo ""

# Step 2: Deploy Durable Objects Worker
echo "📦 Step 2: Deploying Durable Objects Worker..."
cd durable-objects-worker
npx wrangler deploy
cd ..
echo "✅ Durable Objects Worker deployed!"
echo ""

# Step 3: Deploy Cleanup Worker
echo "🧹 Step 3: Deploying Cleanup Worker..."
cd cleanup-worker
npx wrangler deploy
cd ..
echo "✅ Cleanup Worker deployed!"
echo ""

# Step 4: Build frontend
echo "🏗️  Step 4: Building frontend..."
cd frontend
npm run build
cd ..
echo "✅ Frontend built!"
echo ""

# Step 5: Deploy Pages (frontend + API via Functions)
echo "📤 Step 5: Deploying Pages with Functions..."
npx wrangler pages deploy frontend/build --project-name=werobot --branch=main --commit-dirty=true
echo ""

echo "✅ Deployment complete!"
echo ""
echo "🌐 Your app: https://werobot.pages.dev"
