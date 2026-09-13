# Database Architecture

## Overview

WeRobot uses two Cloudflare storage solutions:
- **D1 Database** - SQLite-based relational database for persistent game data
- **KV Storage** - Key-value store for session management

Both are globally distributed on Cloudflare's edge network for low latency.

---

## D1 Database (SQLite)

### Purpose
Stores all persistent game data including rooms, players, prompts, rounds, answers, and votes.

### Schema

#### Rooms Table
Stores game room information.

```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,        -- 6-character code (e.g., "ABC123")
  host_player_id TEXT NOT NULL,          -- UUID of the host
  status TEXT NOT NULL,                  -- 'lobby', 'playing', 'finished'
  max_players INTEGER DEFAULT 6,
  ai_player_id TEXT,                     -- UUID of AI player (set when game starts)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+6 hours'))
);
```

**Indexes:**
- `idx_rooms_code` - Fast room code lookups
- `idx_rooms_status` - Filter by room status
- `idx_rooms_expires` - Cleanup queries
- `idx_rooms_cleanup` - Composite index for cleanup worker

#### Players Table
Stores player information within rooms.

```sql
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,           -- SHA-256 hash (currently unused - kept for future use)
  is_ai BOOLEAN DEFAULT 0,               -- Whether this is the AI player
  is_eliminated BOOLEAN DEFAULT 0,       -- Elimination status (currently unused)
  is_host BOOLEAN DEFAULT 0,             -- Whether this player is the room host
  score INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);
```

**Note:** The `password_hash` column is currently **not used for authentication**. A random password is generated and hashed when creating players, but authentication is handled entirely via session tokens in KV. The password hash may be used in future versions for reconnection after disconnection.

**Indexes:**
- `idx_players_room` - Get all players in a room
- `idx_players_room_active` - Get active (non-eliminated) players

**Cascade Deletion:** When a room is deleted, all associated players are automatically deleted.

#### Prompts Table
Stores player-submitted prompts for rounds.

```sql
CREATE TABLE prompts (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,             -- 10-500 characters
  is_used BOOLEAN DEFAULT 0,             -- Whether prompt has been used in a round
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
```

**Indexes:**
- `idx_prompts_room` - Get all prompts for a room
- `idx_prompts_room_used` - Filter unused prompts

#### Rounds Table
Stores information about each game round.

```sql
CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,         -- 1-based round number
  prompt_id TEXT NOT NULL,               -- Which prompt is used this round
  status TEXT NOT NULL,                  -- 'answering', 'voting', 'complete'
  eliminated_player_id TEXT,             -- Currently unused
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id),
  FOREIGN KEY (eliminated_player_id) REFERENCES players(id)
);
```

**Indexes:**
- `idx_rounds_room` - Get all rounds for a room
- `idx_rounds_room_number` - Find specific round by number

#### Answers Table
Stores player answers to prompts.

```sql
CREATE TABLE answers (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,             -- 1-1000 characters
  votes_received INTEGER DEFAULT 0,      -- Vote count (incremented when voted for)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id)
);
```

**Indexes:**
- `idx_answers_round` - Get all answers for a round
- `idx_answers_player` - Get all answers by a player

#### Votes Table
Stores votes cast by players.

```sql
CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,                -- Player who cast the vote
  voted_for_answer_id TEXT NOT NULL,     -- Answer that received the vote
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (voter_id) REFERENCES players(id),
  FOREIGN KEY (voted_for_answer_id) REFERENCES answers(id),
  UNIQUE(round_id, voter_id)             -- One vote per player per round
);
```

**Indexes:**
- `idx_votes_round` - Get all votes for a round
- `idx_votes_voter` - Get all votes by a voter
- `idx_votes_answer` - Get all votes for an answer

### Data Relationships

```
rooms (1) ──┬── (N) players
            ├── (N) prompts
            └── (N) rounds
                    ├── (N) answers
                    └── (N) votes
```

All relationships use `ON DELETE CASCADE`, so deleting a room automatically deletes all associated data.

### Database Queries

The backend uses a `DatabaseQueries` class to interact with D1:

```typescript
// Example queries
await db.createRoom(room);
await db.getRoomByCode('ABC123');
await db.getPlayersByRoomId(roomId);
await db.getCurrentRound(roomId);
await db.getAnswersByRoundId(roundId);
await db.getVotesByRoundId(roundId);
```

All queries use prepared statements to prevent SQL injection.

### Data Retention

- **TTL**: All rooms expire 6 hours after creation (`expires_at` column)
- **Cleanup**: Cleanup worker runs every 2 hours to delete expired rooms
- **Cascade**: Deleting a room cascades to all related data (players, prompts, rounds, answers, votes)
- **Storage Limit**: D1 free tier is 5GB - cleanup keeps usage minimal

### Migrations

Active database migrations are stored in
`backend/src/db/deploy-migrations/`. The older files in
`backend/src/db/migrations/` are legacy history and must not be applied to
production.

```bash
# Create a migration
npx wrangler --config wrangler.toml d1 migrations create werobot add-example-column

# Apply pending local migrations
npx wrangler --config local/wrangler.toml d1 migrations apply werobot \
  --local --persist-to local/.wrangler/state

# Apply pending production migrations
npx wrangler --config wrangler.toml d1 migrations apply werobot --remote
```

### Local Development

For local development, D1 uses a local SQLite database:

```bash
# Start with local D1
npm run dev  # in backend directory

# Query local database
npx wrangler d1 execute werobot --local --command="SELECT * FROM rooms"
```

---

## KV Storage (Key-Value)

### Purpose
Manages user session authentication tokens. **This is the primary authentication mechanism** - all API requests are authenticated via session tokens stored in KV, not passwords.

KV is optimized for high-read, low-latency operations, making it perfect for session validation on every request.

### Data Structure

**Key Format:** `{sessionToken}` (UUID)
**Value Format:** JSON string

```typescript
interface SessionData {
  playerId: string;    // UUID of the player
  roomId: string;      // UUID of the room
  roomCode: string;    // 6-character room code
  expiresAt: number;   // Unix timestamp (milliseconds)
}
```

**Example:**
```json
{
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "roomId": "660e8400-e29b-41d4-a716-446655440001",
  "roomCode": "ABC123",
  "expiresAt": 1735437600000
}
```

### Session Management

#### Creating a Session

When a player creates or joins a room, a session is automatically created:

```typescript
// 1. Generate random password and hash it (stored in DB but not used for auth)
const password = crypto.randomUUID();
const passwordHash = await hashPassword(password);  // SHA-256 hash

// 2. Create player with password hash
const player = createPlayer(roomId, playerName, passwordHash, isHost, isAI);
await db.createPlayer(player);

// 3. Generate session token (this is what's used for authentication)
const sessionToken = crypto.randomUUID();

// 4. Create session data
const session: SessionData = {
  playerId: player.id,
  roomId: room.id,
  roomCode: room.roomCode,
  expiresAt: Date.now() + (4 * 60 * 60 * 1000), // 4 hours
};

// 5. Store session in KV with TTL
await env.SESSIONS.put(sessionToken, JSON.stringify(session), {
  expirationTtl: 4 * 60 * 60, // Auto-delete after 4 hours (seconds)
});

// 6. Set HTTP-only cookie with session token
Set-Cookie: session={sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400
```

**Important:** The password hash stored in the database is **not used for authentication**. All authentication is done via the session token in KV.

#### Session Validation

Every authenticated request validates the session:

```typescript
// 1. Extract session token from cookie
const sessionToken = extractSessionToken(request);

// 2. Get session data from KV
const sessionData = await env.SESSIONS.get(sessionToken);

// 3. Verify expiration
if (session.expiresAt < Date.now()) {
  await env.SESSIONS.delete(sessionToken);
  return { valid: false };
}

// 4. Verify player exists in database
const player = await db.getPlayerById(session.playerId);
if (!player) {
  return { valid: false };
}

// 5. Session is valid
return { valid: true, session, player };
```

#### Deleting a Session

When a player leaves a room:

```typescript
await env.SESSIONS.delete(sessionToken);
```

### KV Features

#### Automatic Expiration
Sessions use KV's built-in TTL for automatic cleanup:

```typescript
await env.SESSIONS.put(key, value, {
  expirationTtl: 6 * 60 * 60, // Seconds (6 hours)
});
```

After 6 hours, KV automatically deletes the key-value pair.

#### Global Distribution
KV data is replicated to Cloudflare's edge locations worldwide, ensuring low-latency reads from anywhere.

#### Consistency Model
- **Writes**: Globally consistent (slower)
- **Reads**: Eventually consistent (faster)
- Sessions use eventual consistency - acceptable trade-off for authentication

### Cookie Security

Session tokens are stored in HTTP-only cookies:

```
Set-Cookie: session={sessionToken};
  HttpOnly;           // JavaScript can't access
  Secure;             // HTTPS only
  SameSite=Strict;    // CSRF protection
  Path=/;             // Available site-wide
  Max-Age=14400;      // 4 hours (seconds)
```

This prevents:
- XSS attacks (HttpOnly)
- Man-in-the-middle attacks (Secure)
- CSRF attacks (SameSite=Strict)

### KV Namespace Configuration

Configured in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

### Local Development

For local development, KV uses local storage:

```bash
# Start with local KV
npm run dev  # in backend directory

# View KV data
npx wrangler kv:key list --binding=SESSIONS --local

# Get specific key
npx wrangler kv:key get --binding=SESSIONS "key-name" --local
```

---

## Storage Comparison

| Feature | D1 Database | KV Storage |
|---------|-------------|------------|
| **Type** | Relational (SQLite) | Key-Value |
| **Use Case** | Game data, complex queries | Sessions, simple lookups |
| **Consistency** | Strongly consistent | Eventually consistent |
| **Query Type** | SQL | Key-based lookup |
| **Free Tier** | 5GB storage, 5M reads/day | 100K reads/day, 1K writes/day |
| **TTL Support** | Manual (cleanup worker) | Built-in expiration |
| **Data Structure** | Tables with relationships | Simple key-value pairs |
| **Read Latency** | ~10-50ms | ~1-5ms (edge cache) |
| **Write Latency** | ~50-200ms | ~200-500ms (global) |

---

## Performance Optimizations

### D1 Optimizations

1. **Indexes** - All foreign keys and frequently queried columns are indexed
2. **Batch Operations** - Cleanup worker processes rooms in batches
3. **Cascade Deletes** - Database handles related data deletion automatically
4. **Prepared Statements** - All queries use prepared statements for security and performance

### KV Optimizations

1. **TTL** - Automatic expiration reduces manual cleanup
2. **Edge Caching** - Sessions cached at edge locations for fast reads
3. **Small Payloads** - Session data is minimal (~200 bytes JSON)
4. **Single Key Lookups** - No complex queries, just fast key-based access

---

## Monitoring

### D1 Monitoring

```bash
# View database size
npx wrangler d1 execute werobot --command="SELECT 
  (SELECT COUNT(*) FROM rooms) as rooms,
  (SELECT COUNT(*) FROM players) as players,
  (SELECT COUNT(*) FROM rounds) as rounds"

# Check expired rooms
npx wrangler d1 execute werobot --command="SELECT COUNT(*) FROM rooms 
  WHERE datetime(expires_at) < datetime('now')"

# View recent activity
npx wrangler d1 execute werobot --command="SELECT * FROM rooms 
  ORDER BY created_at DESC LIMIT 10"
```

### KV Monitoring

```bash
# List all session keys
npx wrangler kv:key list --binding=SESSIONS

# Count active sessions
npx wrangler kv:key list --binding=SESSIONS | jq 'length'

# Get specific session
npx wrangler kv:key get --binding=SESSIONS "session-token-uuid"
```

---

## Authentication Flow

### How It Actually Works

The application uses **session-token-only authentication**. Here's the complete flow:

#### 1. Player Creates/Joins Room
```typescript
// Backend generates and stores password hash (unused)
const password = crypto.randomUUID();
const passwordHash = await hashPassword(password);  // SHA-256
await db.createPlayer({ ...player, passwordHash });

// Backend creates session token (THIS is what matters)
const sessionToken = crypto.randomUUID();
await env.SESSIONS.put(sessionToken, JSON.stringify(sessionData));

// Cookie is set with session token
response.headers.set('Set-Cookie', 'session={token}; HttpOnly; Secure');
```

#### 2. Client Makes Authenticated Request
```typescript
// Browser automatically sends cookie
Cookie: session={sessionToken}

// Backend validates session
const sessionToken = extractFromCookie(request);
const sessionData = await env.SESSIONS.get(sessionToken);  // KV lookup

if (!sessionData || sessionData.expiresAt < Date.now()) {
  return 401;  // Unauthorized
}

// Verify player still exists in DB
const player = await db.getPlayerById(sessionData.playerId);
if (!player) {
  return 403;  // Forbidden
}

// ✅ Authenticated!
```

#### 3. No Password Verification
The password hash in the database is **never checked**. The `verifyPassword()` function exists in the codebase but is never called.

**Why keep password hashes?**
- **Future feature**: May be used for reconnection if a player's session expires mid-game
- **Schema design**: Added in a migration but not yet fully implemented
- **No harm**: Storing them doesn't impact performance or security

---

## Troubleshooting

### D1 Issues

**Database not found:**
```bash
npx wrangler d1 list
npx wrangler d1 create werobot
```

**Schema out of date:**
```bash
npx wrangler d1 execute werobot --file=./backend/src/db/schema.sql
```

**Slow queries:**
```bash
# Check if indexes exist
npx wrangler d1 execute werobot --command="SELECT name FROM sqlite_master 
  WHERE type='index'"
```

### KV Issues

**Session not found:**
- Check cookie is being sent in request
- Verify session hasn't expired (6-hour TTL)
- Check KV namespace ID in `wrangler.toml`

**KV namespace error:**
```bash
# List namespaces
npx wrangler kv:namespace list

# Create namespace
npx wrangler kv:namespace create SESSIONS
```

---

## Cost Estimation

### D1 Costs (Free Tier)

- **Storage**: 5GB free
- **Reads**: 5 million per day free
- **Writes**: 100,000 per day free

**Typical usage for 1,000 daily active users:**
- Storage: ~500MB (with 6-hour cleanup)
- Reads: ~50,000/day
- Writes: ~5,000/day
- **Cost: $0/month** (within free tier)

### KV Costs (Free Tier)

- **Reads**: 100,000 per day free
- **Writes**: 1,000 per day free
- **Storage**: 1GB free

**Typical usage for 1,000 daily active users:**
- Reads: ~10,000/day (session validation)
- Writes: ~2,000/day (new sessions)
- Storage: <1MB
- **Cost: $0/month** (within free tier)

### Total Storage Costs

**Estimated: < $1/month** for moderate usage (stays within free tiers with cleanup)

---

## Best Practices

### D1 Best Practices

1. ✅ Always use prepared statements
2. ✅ Add indexes for foreign keys and WHERE clauses
3. ✅ Use CASCADE deletion for related data
4. ✅ Set `expires_at` for automatic cleanup
5. ✅ Batch operations when possible
6. ❌ Don't store large blobs (use R2 instead)
7. ❌ Don't do full table scans

### KV Best Practices

1. ✅ Use TTL for automatic expiration
2. ✅ Keep values small (<1KB)
3. ✅ Use UUIDs as keys
4. ✅ Accept eventual consistency
5. ❌ Don't use for strongly consistent data
6. ❌ Don't store sensitive data unencrypted
7. ❌ Don't use for complex queries

---

## Security

### D1 Security

- **SQL Injection**: All queries use prepared statements
- **Access Control**: Row-level security via application logic
- **Data Validation**: All inputs validated before database insertion
- **Password Storage**: SHA-256 hashing (currently unused - kept for potential future reconnection feature)
- **Primary Authentication**: Session tokens in KV (not passwords in D1)

### KV Security

- **Token Security**: Session tokens are UUIDs (cryptographically random)
- **Cookie Protection**: HttpOnly, Secure, SameSite=Strict flags
- **Expiration**: Automatic TTL prevents stale sessions
- **No PII**: Session data doesn't contain sensitive user information

---

## Related Documentation

- [API Documentation](./API.md) - How the API uses D1 and KV
- [Architecture](./ARCHITECTURE.md) - Overall system design
- [Deployment](./DEPLOYMENT.md) - Setting up D1 and KV in production
