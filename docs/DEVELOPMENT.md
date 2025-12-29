# Development Guide

## Prerequisites

- Node.js 18+
- Cloudflare account
- No API keys required! (Cloudflare AI is used by default)

## Local Development

### Option 1: Full Stack (Recommended)

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

# Optional: Set up external API fallback for development
# Create .dev.vars in the root directory (optional - see below)

# Start all services
./dev-local.sh
```

Visit:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8787

### Option 2: Frontend Only

```bash
# For quick frontend testing with production API
./dev-simple.sh
```

Visit: http://localhost:3000

## Environment Variables

### Cloudflare AI (Default)

**No configuration needed!** The app uses Cloudflare Workers AI by default with:
- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- Free tier: 10,000 AI inferences per day
- Configured automatically via `wrangler.toml`

### External API Fallback (Optional - Development Only)

For development/testing, you can optionally configure an external API as a fallback. This **only works when ENVIRONMENT is not "production"**.

**Local Development** (`.dev.vars` in root directory):
```env
# Optional: External API fallback (only works in non-production)
OPENAI_API_KEY=your-api-key
OPENAI_API_ENDPOINT=https://models.github.ai/inference/chat/completions
OPENAI_MODEL=openai/gpt-4.1
```

**Production** uses Cloudflare AI exclusively. External API secrets are ignored in production.

**Frontend** (`frontend/.env.production`):
```env
REACT_APP_API_URL=/api
REACT_APP_WS_URL=wss://werobot.pages.dev
```

## Database Configuration

Update database IDs in `wrangler.toml` after creating resources:

```toml
[[d1_databases]]
binding = "DB"
database_name = "werobot"
database_id = "YOUR_DATABASE_ID"

[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_KV_ID"
```

## Troubleshooting

### WebSocket Won't Connect
```bash
# Check deployment logs
npx wrangler pages deployment tail --project-name=werobot

# Verify service binding is configured
grep -A 3 "services" wrangler.toml
```

### Database Errors
```bash
# Check database exists
npx wrangler d1 list

# Re-run migrations
npx wrangler d1 execute werobot --file=./backend/src/db/schema.sql

# View database documentation
# See docs/DATABASE.md for detailed schema and troubleshooting
```

### AI Not Responding
```bash
# Check if Cloudflare AI binding is configured
grep -A 2 "\[ai\]" wrangler.toml

# Verify AI binding in local dev
npx wrangler dev --local --ai AI

# For external API fallback (development only):
npx wrangler secret list

# Test external API key
curl https://models.github.ai/inference/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-4.1","messages":[{"role":"user","content":"test"}]}'
```

### Build Failures
```bash
# Clear caches
rm -rf node_modules package-lock.json
npm install

# Check TypeScript
npm run typecheck
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
