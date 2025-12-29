# Architecture

Built with a modern serverless stack deployed entirely on Cloudflare:

```
┌─────────────────────────────────────────────────────────────┐
│                    werobot.pages.dev                        │
│                     (Same Origin)                           │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React)         → Static files                    │
│  API (/api/*)             → Pages Functions (Hono)          │
│  WebSocket (/api/ws)      → Service Binding ↓               │
└────────────────────────────────┬────────────────────────────┘
                                 │
                      ┌──────────▼──────────┐
                      │ Durable Objects     │
                      │ Worker (Internal)   │
                      │ - WebSocket Handler │
                      │ - Real-time State   │
                      └──────────┬──────────┘
                                 │
                      ┌──────────▼──────────┐
                      │ Cleanup Worker      │
                      │ (Cron-triggered)    │
                      │ - Runs every 2 hrs  │
                      │ - Deletes old rooms │
                      │ - Closes WebSockets │
                      └─────────────────────┘
```

## Technology Stack

**Frontend:**
- React 19 with TypeScript
- WebSocket for real-time updates
- Axios for API calls
- React Router for navigation

**Backend:**
- Cloudflare Pages Functions (API)
- Hono framework (routing)
- Cloudflare Workers (Durable Objects)
- D1 SQLite (database) - See [DATABASE.md](./DATABASE.md)
- KV Storage (sessions) - See [DATABASE.md](./DATABASE.md)
- Durable Objects (WebSocket state)
- Cron Triggers (cleanup worker)
- GitHub Models / OpenAI (AI player)

## Key Features

✅ **Same-Origin Deployment** - Everything on `werobot.pages.dev` (no CORS!)
✅ **Real-time Updates** - WebSocket connections via Durable Objects
✅ **Secure Sessions** - HttpOnly, Secure, SameSite=Strict cookies
✅ **AI Player** - Powered by GPT-4 via GitHub Models
✅ **Smart AI Voting** - AI evaluates answers to vote out humans
✅ **Automatic Cleanup** - Cron worker deletes expired rooms every 2 hours (keeps costs low)
✅ **Scalable** - Cloudflare's edge network
✅ **Serverless** - No servers to manage

## Data Lifecycle

### Automatic Cleanup System

To keep costs minimal and comply with the D1 free tier (5GB limit), the application includes an automatic cleanup system. For detailed database information, see [DATABASE.md](./DATABASE.md).

1. **Room Expiration** - All rooms expire 6 hours after creation
2. **Cleanup Worker** - Runs every 2 hours via Cloudflare Cron Triggers
3. **Cleanup Process**:
   - Identifies expired rooms in D1 database
   - Notifies Durable Objects to close WebSocket connections
   - Deletes room data from database (CASCADE deletes related players, prompts, rounds, answers, votes)
   - Clears Durable Object state
4. **KV TTL** - Session tokens auto-expire after 6 hours using KV's built-in TTL

This ensures:
- Database stays under 5GB free tier limit
- No stale WebSocket connections
- Minimal storage and compute costs
- Fresh game data only
- Automatic session cleanup

## Project Structure

```
we-robot/
├── frontend/                    # React frontend
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── services/           # API & WebSocket services
│   │   └── types/              # TypeScript types
│   └── .env.production         # Production config
│
├── backend/                     # Backend logic (main API)
│   ├── src/
│   │   ├── db/                 # Database queries & schema
│   │   ├── durable-objects/    # WebSocket handler (GameRoom)
│   │   ├── services/           # Business logic (game, AI)
│   │   ├── utils/              # Helpers (auth, sessions)
│   │   ├── router.ts           # API routes (Hono)
│   │   └── types/              # TypeScript types
│   ├── wrangler.toml           # Backend config
│   └── .dev.vars               # Local secrets
│
├── durable-objects-worker/     # WebSocket worker (internal)
│   ├── src/index.ts            # DO Worker entry point
│   └── wrangler.toml           # DO Worker config
│
├── cleanup-worker/              # Cleanup worker (cron-triggered)
│   ├── src/index.ts            # Cleanup logic
│   └── wrangler.toml           # Cleanup worker config (runs every 2 hours)
│
├── functions/                   # Pages Functions
│   └── api/[[path]].ts         # API handler (proxies to Hono)
│
├── wrangler.toml                # Pages config (root)
├── deploy.sh                    # Deployment script
└── dev.sh                       # Local dev script
```

## Game Flow

### 1. Lobby Phase
- Host creates room
- Players join with room code
- Each player submits a prompt
- AI player automatically joins

### 2. Round Phase (repeats)
- Random prompt displayed
- All players (including AI) submit answers trying to sound AI-like
- Voting phase begins
- Players vote for who they think is a HUMAN
- AI votes for who it thinks is most human
- Votes are accumulated across all rounds

### 3. End Game
- After all rounds are complete
- Player with the LEAST total votes wins
- Fewer votes means you successfully fooled others into thinking you're AI
- If AI has the least votes, AI wins
- If a human has the least votes, that human wins

## Security Features

- **HttpOnly Cookies** - JavaScript can't access session tokens
- **Secure Flag** - HTTPS only transmission
- **SameSite=Strict** - Maximum CSRF protection
- **Session-Based Auth** - Random UUID tokens stored in KV (not passwords)
- **Session Validation** - Every request verified against KV and D1
- **Same-Origin** - No CORS vulnerabilities

**Note:** Password hashes are stored in the database but currently unused. Authentication is handled entirely via session tokens in KV.
