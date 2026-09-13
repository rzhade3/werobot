# Deployment Guide

## Production Deployment

### Step 1: Install Dependencies

```bash
npm ci
npm --prefix backend ci
npm --prefix cleanup-worker ci
npm --prefix frontend ci
```

### Step 2: Initial Cloudflare Setup

```bash
# Authenticate with Cloudflare
npx wrangler login

# Create resources (one-time setup)
npx wrangler d1 create werobot
# Copy database_id to wrangler.toml

npx wrangler kv:namespace create SESSIONS
# Copy id to wrangler.toml

# Initialize the database through the tracked migration baseline
npx wrangler --config wrangler.toml d1 migrations apply werobot --remote
```

### Step 3: Deploy

```bash
./deploy.sh
```

Your app will be live at: **https://werobot.pages.dev**

The AI binding is automatically configured via `wrangler.toml`:

```toml
[ai]
binding = "AI"
```

### Step 4: Verify AI is Working

Check the deployment logs:
```bash
npx wrangler pages deployment tail --project-name=werobot
```

Look for:
- ✅ `[AI] Using Cloudflare AI Workers` - Working!
- ⚠️ `[AI] Cloudflare AI binding not available` - Check wrangler.toml

Test in production:
1. Create a game room at https://werobot.pages.dev
2. Add AI player
3. Submit prompts and start game
4. AI should generate contextual responses (not static fallbacks)

## GitHub Actions

The workflow in `.github/workflows/deploy.yml` runs tests for pull requests and
deploys production after changes reach `main`.

Create a GitHub environment named `production`:

1. Open **Settings > Environments > New environment**.
2. Restrict deployment branches to `main`.
3. Optionally require a reviewer before production deployment.
4. Add environment variable `CLOUDFLARE_ACCOUNT_ID`.
5. Add environment secret `CLOUDFLARE_API_TOKEN`.

Create a custom Cloudflare API token scoped to this account with:

- Workers Scripts: Edit
- Cloudflare Pages: Edit
- D1: Edit
- Workers KV Storage: Edit

The workflow never exposes these credentials to pull-request jobs. The deploy
job calls `deploy.sh`, which applies migrations and deploys all services in
order. Do not also enable Cloudflare Git builds for these projects, or each
commit may deploy twice.

## Database Upgrades

Production migrations live in `backend/src/db/deploy-migrations/`. The
`0000_baseline.sql` migration initializes new databases and safely establishes
migration tracking for the existing production database.

Create and test each future migration:

```bash
npx wrangler --config wrangler.toml d1 migrations create werobot add-example-column
npx wrangler --config local/wrangler.toml d1 migrations apply werobot \
  --local --persist-to local/.wrangler/state
```

Use expand/contract changes:

1. Add nullable columns, new tables, or indexes.
2. Deploy code that works with both old and new schemas.
3. Backfill data if necessary.
4. Enforce constraints or remove old fields in a later deployment.

The files in `backend/src/db/migrations/` are retained as legacy history and
must not be applied to production.

## Components Deployed

The deployment script deploys three workers:

1. **Pages and Functions** - React frontend plus the API in `functions/`
2. **Durable Objects Worker** (`durable-objects-worker/`) - WebSocket connections and real-time state
3. **Cleanup Worker** (`cleanup-worker/`) - Cron-triggered cleanup (runs every 2 hours)

All components share the same D1 database and communicate via service bindings.

## AI Configuration

### Cloudflare AI Workers (Default)

The app uses **Cloudflare Workers AI** by default with the following model:
- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- Free tier: **10,000 AI inferences per day**
- No secrets or API keys required!

**Configuration in wrangler.toml:**
```toml
# Cloudflare AI Workers binding
[ai]
binding = "AI"

[vars]
OPENAI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
```

### External API Fallback (Development Only)

For development environments, you can optionally configure an external API fallback. This **only works when ENVIRONMENT is not "production"**.

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_API_ENDPOINT
```

**Note:** Production deployments will always use Cloudflare AI Workers, even if external API secrets are configured.

## Troubleshooting AI Binding

### AI Not Responding

If the AI player isn't working:

1. **Check wrangler.toml syntax:**
   ```toml
   [ai]
   binding = "AI"
   ```
   **Important:** Use `[ai]` with single brackets, not `[[ai_bindings]]`

2. **Check logs for errors:**
   ```bash
   npx wrangler pages deployment tail --project-name=werobot
   ```
   Look for:
   - `[AI] Using Cloudflare AI Workers` - Working!
   - `[AI] Cloudflare AI binding not available` - Not configured
   - `[AI] No AI provider available` - Fallback also failed

3. **Redeploy:**
   ```bash
   ./deploy.sh
   ```

4. **Verify wrangler.toml is in project root:**
   ```bash
   ls -la wrangler.toml
   cat wrangler.toml | grep -A 1 "\[ai\]"
   ```

5. **Test with external API (development):**
   If you need to test immediately:
   ```bash
   # Temporarily change environment in wrangler.toml:
   ENVIRONMENT = "development"  # instead of "production"
   
   # Then set external API
   npx wrangler secret put OPENAI_API_KEY
   ```

## Pricing (Cloudflare Free Tier)

| Resource | Free Tier | Cost After |
|----------|-----------|------------|
| Pages (Static) | Unlimited | Free |
| Pages Functions | 100K/day | $0.50/million |
| Durable Objects | 1M/month | $0.15/million |
| D1 Database | 5M reads, 100K writes/day | Usage-based |
| KV Storage | 100K reads, 1K writes/day | Usage-based |
| **Workers AI** | **10K inferences/day** | **$0.011/1K Neurons** |
| Cron Triggers | 250K/month | Included |

**Estimated cost for 1,000 daily active users: < $5/month**

With Cloudflare AI's free tier (10K inferences/day), you can support **~1,666 games per day completely free**!

## Production vs Preview Deployments

### Production Deployment

To deploy to production (main branch):

```bash
./deploy.sh
```

Or manually:
```bash
npx wrangler pages deploy frontend/build --project-name=werobot --branch=main
```

### Preview Deployment

To create a preview deployment (for testing):

```bash
npx wrangler pages deploy frontend/build --project-name=werobot --branch=preview
```

**Note:** Preview deployments:
- Get a unique URL like `https://abc123.werobot.pages.dev`
- Don't affect your production site at `https://werobot.pages.dev`
- Useful for testing before pushing to production

**Production deployments:**
- Use `--branch=main`
- Deploy to `https://werobot.pages.dev`
- Update the live site immediately
