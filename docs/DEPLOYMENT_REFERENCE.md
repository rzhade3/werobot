# Deployment Quick Reference

## Production Deployment

Deploy to production (https://werobot.pages.dev):

```bash
./deploy.sh
```

This runs:
1. Apply pending D1 migrations
2. Deploy Durable Objects Worker
3. Deploy Cleanup Worker
4. Build frontend
5. Deploy Pages with `--branch=main` (production)

## Preview Deployment

Create a preview deployment for testing:

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Deploy as preview
npx wrangler pages deploy frontend/build --project-name=werobot --branch=preview
```

Preview URL will be something like: `https://abc123.werobot.pages.dev`

## Key Differences

| Aspect | Production | Preview |
|--------|-----------|---------|
| Command | `--branch=main` | `--branch=preview` (or another non-production branch) |
| URL | `werobot.pages.dev` | `abc123.werobot.pages.dev` |
| When to use | Final deployment | Testing changes before production |
| AI Binding | Full access (10K/day) | Same bindings as production |
| Database | Production D1 | Same production D1 (be careful!) |

## Important Notes

### Without --branch flag
```bash
npx wrangler pages deploy frontend/build --project-name=werobot
```
Wrangler uses the current Git branch. On `main` this is production; other
branches create previews.

### With --branch=main
```bash
npx wrangler pages deploy frontend/build --project-name=werobot --branch=main
```
☝️ This deploys to **PRODUCTION** at werobot.pages.dev

### Your Production Branch

**Your production branch is `main`.**

Deploying with another branch name creates a preview deployment.

## Verify Deployment Type

Check your deployment:

```bash
npx wrangler pages deployment list --project-name=werobot
```

Look for:
- **Production:** `main` branch, URL: `werobot.pages.dev`
- **Preview:** Other branch names, URL: `<hash>.werobot.pages.dev`

## Best Practice

1. **Test locally first:** `./dev-local.sh`
2. **Create preview deployment:** Deploy with `--branch=preview`
3. **Verify preview works:** Check AI, gameplay, etc.
4. **Deploy to production:** Run `./deploy.sh` (deploys to `main`)
5. **Monitor logs:** `npx wrangler pages deployment tail --project-name=werobot`

## Rollback

If something goes wrong, redeploy a previous version:

```bash
# List deployments
npx wrangler pages deployment list --project-name=werobot

# Find the working deployment ID, then promote it
# (This is done via the dashboard - Workers & Pages > werobot > Deployments)
```
