# Development Guide

## Prerequisites

- Node.js 18+
- Cloudflare account
- GitHub Models API key (or OpenAI API key)

## Local Development

### Option 1: Full Stack (Recommended)

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

# Set up environment variables
# Edit .dev.vars in the root directory with your API keys

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

**Local Development** (`.dev.vars` in root directory):
```env
OPENAI_API_KEY=your-api-key
OPENAI_API_ENDPOINT=https://models.github.ai/inference/chat/completions
OPENAI_MODEL=openai/gpt-4.1
```

**Production** (Cloudflare Secrets):
```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_API_ENDPOINT
npx wrangler secret put OPENAI_MODEL
```

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
# Verify secrets are set
npx wrangler secret list

# Test API key
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
