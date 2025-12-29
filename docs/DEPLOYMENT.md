# Deployment Guide

## Production Deployment

```bash
# 1. Authenticate with Cloudflare
npx wrangler login

# 2. Create resources (one-time setup)
cd backend
npx wrangler d1 create werobot
# Copy database_id to wrangler.toml

npx wrangler kv:namespace create SESSIONS
# Copy id to wrangler.toml

npx wrangler d1 execute werobot --file=./src/db/schema.sql

# 3. Set production secrets
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_API_ENDPOINT
npx wrangler secret put OPENAI_MODEL

# 4. Deploy everything
cd ..
./deploy.sh
```

Your app will be live at: **https://werobot.pages.dev**

## Components Deployed

The deployment script deploys three workers:

1. **Backend Worker** (`backend/`) - Main API and business logic
2. **Durable Objects Worker** (`durable-objects-worker/`) - WebSocket connections and real-time state
3. **Cleanup Worker** (`cleanup-worker/`) - Cron-triggered cleanup (runs every 2 hours)

All components share the same D1 database and communicate via service bindings.

## Pricing (Cloudflare Free Tier)

| Resource | Free Tier | Cost After |
|----------|-----------|------------|
| Pages (Static) | Unlimited | Free |
| Pages Functions | 100K/day | $0.50/million |
| Durable Objects | 1M/month | $0.15/million |
| D1 Database | 5M reads, 100K writes/day | Usage-based |
| KV Storage | 100K reads, 1K writes/day | Usage-based |
| Cron Triggers | 250K/month | Included |

**Estimated cost for 1,000 daily active users: < $5/month**
