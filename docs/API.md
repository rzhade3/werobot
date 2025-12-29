# WeRobot Backend API Documentation

## Overview

The WeRobot backend is a serverless API built on Cloudflare Workers with Durable Objects for real-time WebSocket connections, D1 for persistent storage, and KV for session management.

**Base URL**: `https://your-worker.workers.dev/api` (production) or `http://localhost:8787/api` (local development)

**WebSocket URL**: `wss://your-worker.workers.dev/api/ws` (production) or `ws://localhost:8787/api/ws` (local development)

## Authentication

Most endpoints require authentication via session cookies. When you create or join a room, a session cookie is automatically set in the format: `session_{roomCode}={sessionToken}`

The session is automatically included in requests and validated on the server.

## Response Format

All API responses follow this format:

```json
{
  "success": true,
  "data": { /* response data */ },
  "error": "Error message (only present on failure)"
}
```

## Endpoints

### Health Check

#### GET `/api/health`

Check if the API is running.

**Authentication**: None

**Response**:
```json
{
  "success": true,
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Room Management

### Create Room

#### POST `/api/rooms`

Create a new game room and become the host.

**Authentication**: None

**Request Body**:
```json
{
  "playerName": "string" // 2-20 characters
}
```

**Response** (201):
```json
{
  "success": true,
  "data": {
    "roomCode": "ABC123",
    "playerId": "uuid"
  }
}
```

**Response Headers**:
- `Set-Cookie`: `session_{roomCode}={sessionToken}; HttpOnly; SameSite=Lax; Path=/`

**Error Responses**:
- `400`: Invalid player name

---

### Get Room Details

#### GET `/api/rooms/:roomCode`

Get details about a specific room.

**Authentication**: Required (must be a player in the room)

**Response**:
```json
{
  "success": true,
  "data": {
    "room": {
      "id": "uuid",
      "roomCode": "ABC123",
      "hostPlayerId": "uuid",
      "status": "lobby|playing|finished",
      "maxPlayers": 6,
      "aiPlayerId": "uuid",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2024-01-01T06:00:00.000Z"
    },
    "players": [
      {
        "id": "uuid",
        "name": "Player Name",
        "isHost": true,
        "isAI": false,
        "isEliminated": false,
        "score": 0
      }
    ]
  }
}
```

**Error Responses**:
- `401`: Unauthorized
- `403`: Not in this room
- `404`: Room not found

---

### Join Room

#### POST `/api/rooms/:roomCode/join`

Join an existing room.

**Authentication**: None

**Request Body**:
```json
{
  "playerName": "string" // 2-20 characters
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "playerId": "uuid"
  }
}
```

**Response Headers**:
- `Set-Cookie`: `session_{roomCode}={sessionToken}; HttpOnly; SameSite=Lax; Path=/`

**WebSocket Event**: Broadcasts `player:joined` to all players in the room

**Error Responses**:
- `400`: Invalid room code, player name, room is full, or game already started
- `404`: Room not found

---

### Leave Room

#### DELETE `/api/rooms/:roomCode/leave`

Leave a room you're currently in.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Left room successfully"
  }
}
```

**WebSocket Event**: Broadcasts `player:left` to all players in the room

**Error Responses**:
- `401`: Unauthorized
- `403`: Not in this room

---

### Get Players

#### GET `/api/rooms/:roomCode/players`

Get list of all players in a room.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "players": [
      {
        "id": "uuid",
        "name": "Player Name",
        "isHost": true,
        "isAI": false,
        "isEliminated": false,
        "score": 0
      }
    ]
  }
}
```

**Error Responses**:
- `401`: Unauthorized
- `403`: Not in this room
- `404`: Room not found

---

## Lobby Phase

### Submit Prompt

#### POST `/api/rooms/:roomCode/prompts`

Submit a prompt for the game. Each player can submit one prompt during the lobby phase.

**Authentication**: Required

**Request Body**:
```json
{
  "promptText": "string" // 10-500 characters
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "prompt": {
      "id": "uuid",
      "roomId": "uuid",
      "playerId": "uuid",
      "promptText": "Your prompt text",
      "isUsed": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**WebSocket Event**: Broadcasts `prompt:submitted` to all players

**Error Responses**:
- `400`: Invalid prompt, game already started, or already submitted
- `401`: Unauthorized
- `403`: Not in this room

---

### Get Prompt Status

#### GET `/api/rooms/:roomCode/prompts/status`

Check which players have submitted prompts.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "status": [
      {
        "playerId": "uuid",
        "playerName": "Player Name",
        "hasSubmitted": true
      }
    ],
    "allSubmitted": false
  }
}
```

**Error Responses**:
- `401`: Unauthorized
- `403`: Not in this room

---

### Start Game

#### POST `/api/rooms/:roomCode/start`

Start the game. Only the host can start the game, and all human players must have submitted prompts.

**Authentication**: Required (must be host)

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Game started"
  }
}
```

**WebSocket Event**: Broadcasts `game:started` to all players

**Error Responses**:
- `400`: Not all prompts submitted
- `401`: Unauthorized
- `403`: Not the host or not in this room

---

## Game State

### Get Game State

#### GET `/api/rooms/:roomCode/state`

Get current game state including players and round information.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "room": {
      "id": "uuid",
      "roomCode": "ABC123",
      "status": "playing",
      "maxPlayers": 6
    },
    "players": [/* array of players */],
    "currentRound": 1,
    "totalRounds": 5
  }
}
```

**Error Responses**:
- `401`: Unauthorized
- `403`: Not in this room

---

## Round Management

### Get Current Round

#### GET `/api/rooms/:roomCode/rounds/current`

Get information about the current round.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "roomId": "uuid",
      "roundNumber": 1,
      "promptId": "uuid",
      "status": "answering|voting|complete",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "prompt": {
      "id": "uuid",
      "promptText": "The current prompt text",
      "playerId": "uuid"
    },
    "hasSubmittedAnswer": false,
    "hasVoted": false
  }
}
```

**Error Responses**:
- `401`: Unauthorized
- `403`: Not in this room
- `404`: No active round

---

### Submit Answer

#### POST `/api/rooms/:roomCode/rounds/current/answers`

Submit an answer to the current round's prompt.

**Authentication**: Required

**Request Body**:
```json
{
  "answerText": "string" // 1-1000 characters
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Answer submitted"
  }
}
```

**WebSocket Events**:
- Broadcasts `answer:submitted` after each submission
- Broadcasts `voting:started` when all players have answered

**Error Responses**:
- `400`: Invalid answer, not in answering phase, or already submitted
- `401`: Unauthorized
- `403`: Not in this room

---

### Get Answer Status

#### GET `/api/rooms/:roomCode/rounds/current/answers/status`

Check how many players have submitted answers.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "submitted": 3,
    "total": 5,
    "allSubmitted": false
  }
}
```

**Error Responses**:
- `401`: Unauthorized
- `403`: Not in this room
- `404`: No active round

---

### Get Answers for Voting

#### GET `/api/rooms/:roomCode/rounds/current/answers`

Get all answers for the current round (only available during voting phase). Player IDs are hidden for anonymity.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "answers": [
      {
        "id": "uuid",
        "roundId": "uuid",
        "answerText": "An answer to the prompt",
        "votesReceived": 0,
        "isOwnAnswer": false,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

**Error Responses**:
- `400`: Not in voting phase
- `401`: Unauthorized
- `403`: Not in this room

---

## Voting

### Cast Vote

#### POST `/api/rooms/:roomCode/rounds/current/votes`

Vote for an answer. You cannot vote for your own answer.

**Authentication**: Required

**Request Body**:
```json
{
  "answerId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Vote submitted"
  }
}
```

**WebSocket Events**:
- Broadcasts `vote:cast` after each vote
- Broadcasts `round:ended` when all players have voted

**Error Responses**:
- `400`: Invalid answer, not in voting phase, already voted, or voting for own answer
- `401`: Unauthorized
- `403`: Not in this room

---

### Get Vote Status

#### GET `/api/rooms/:roomCode/rounds/current/votes/status`

Check how many players have voted.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "submitted": 2,
    "total": 5,
    "allSubmitted": false
  }
}
```

**Error Responses**:
- `401`: Unauthorized
- `403`: Not in this room
- `404`: No active round

---

### Get Round Results

#### GET `/api/rooms/:roomCode/rounds/current/results`

Get results of the current round after voting is complete. Shows all answers with vote counts and reveals player IDs.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "answers": [
      {
        "id": "uuid",
        "roundId": "uuid",
        "playerId": "uuid",
        "answerText": "An answer",
        "votesReceived": 3,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "gameEnded": false
  }
}
```

**Error Responses**:
- `400`: Round not complete
- `401`: Unauthorized
- `403`: Not in this room

---

### Start Next Round

#### POST `/api/rooms/:roomCode/rounds/next`

Start the next round. Only the host can start the next round.

**Authentication**: Required (must be host)

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Next round started"
  }
}
```

**WebSocket Event**: Broadcasts `round:started` to all players

**Error Responses**:
- `400`: Game is over
- `401`: Unauthorized
- `403`: Not the host or not in this room

---

## Game End

### Get Winner

#### GET `/api/rooms/:roomCode/winner`

Get the winner and final scores after the game ends. The winner is determined by total votes received across all rounds.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "winner": {
      "id": "uuid",
      "name": "Winner Name",
      "isAI": false,
      "totalVotes": 15
    },
    "allPlayers": [
      {
        "id": "uuid",
        "name": "Player Name",
        "isAI": false,
        "isEliminated": false
      }
    ],
    "playerVotes": {
      "player-uuid-1": 15,
      "player-uuid-2": 12,
      "player-uuid-3": 8
    }
  }
}
```

**Error Responses**:
- `400`: Game not finished
- `401`: Unauthorized
- `403`: Not in this room

---

## WebSocket Connection

### Connect to Room

#### GET `/api/ws?roomCode={roomCode}&playerId={playerId}`

Establish a WebSocket connection for real-time updates.

**Authentication**: Required (session must match roomCode and playerId)

**Connection**: Upgrade to WebSocket protocol

**Query Parameters**:
- `roomCode`: The room code to connect to
- `playerId`: Your player ID

**Response**: WebSocket connection established (101 Switching Protocols)

**Error Responses**:
- `400`: Missing roomCode or playerId
- `401`: Invalid session
- `403`: Session mismatch (roomCode/playerId don't match your session)

---

## WebSocket Events

Once connected, you'll receive real-time events from the server. All events are JSON objects with a `type` field.

### Server → Client Events

#### `player:joined`
A new player has joined the room.
```json
{
  "type": "player:joined",
  "data": null
}
```

#### `player:left`
A player has left the room.
```json
{
  "type": "player:left",
  "data": null
}
```

#### `prompt:submitted`
A player has submitted a prompt.
```json
{
  "type": "prompt:submitted",
  "data": null
}
```

#### `game:started`
The host has started the game.
```json
{
  "type": "game:started",
  "data": null
}
```

#### `round:started`
A new round has started.
```json
{
  "type": "round:started",
  "data": null
}
```

#### `answer:submitted`
A player has submitted an answer.
```json
{
  "type": "answer:submitted",
  "data": null
}
```

#### `voting:started`
All players have submitted answers and voting has begun.
```json
{
  "type": "voting:started",
  "data": null
}
```

#### `vote:cast`
A player has cast a vote.
```json
{
  "type": "vote:cast",
  "data": null
}
```

#### `round:ended`
All players have voted and the round has ended.
```json
{
  "type": "round:ended",
  "data": null
}
```

#### `game:ended`
The game has finished.
```json
{
  "type": "game:ended",
  "data": null
}
```

### Client → Server Events

The WebSocket connection is primarily for receiving server events. Most game actions should be performed via HTTP API endpoints. However, clients can send messages if needed:

```json
{
  "type": "custom_event_type",
  "roomCode": "ABC123",
  "playerId": "uuid",
  "data": { /* optional data */ }
}
```

These will be broadcast to all connected clients in the room.

---

## Data Models

### Room
```typescript
{
  id: string;              // UUID
  roomCode: string;        // 6-character code (e.g., "ABC123")
  hostPlayerId: string;    // UUID of the host player
  status: "lobby" | "playing" | "finished";
  maxPlayers: number;      // Default: 6
  aiPlayerId?: string;     // UUID of the AI player (set when game starts)
  createdAt: string;       // ISO 8601 timestamp
  updatedAt: string;       // ISO 8601 timestamp
  expiresAt: string;       // ISO 8601 timestamp (6 hours from creation)
}
```

### Player
```typescript
{
  id: string;              // UUID
  roomId: string;          // UUID
  name: string;            // 2-20 characters
  isAI: boolean;           // Whether this is the AI player
  isEliminated: boolean;   // Whether player is eliminated
  isHost: boolean;         // Whether player is the host
  score: number;           // Player's score
  createdAt: string;       // ISO 8601 timestamp
}
```

### Prompt
```typescript
{
  id: string;              // UUID
  roomId: string;          // UUID
  playerId: string;        // UUID
  promptText: string;      // 10-500 characters
  isUsed: boolean;         // Whether prompt has been used in a round
  createdAt: string;       // ISO 8601 timestamp
}
```

### Round
```typescript
{
  id: string;              // UUID
  roomId: string;          // UUID
  roundNumber: number;     // 1-based round number
  promptId: string;        // UUID
  status: "answering" | "voting" | "complete";
  eliminatedPlayerId?: string; // UUID (currently unused)
  createdAt: string;       // ISO 8601 timestamp
}
```

### Answer
```typescript
{
  id: string;              // UUID
  roundId: string;         // UUID
  playerId: string;        // UUID
  answerText: string;      // 1-1000 characters
  votesReceived: number;   // Number of votes received
  createdAt: string;       // ISO 8601 timestamp
}
```

### Vote
```typescript
{
  id: string;              // UUID
  roundId: string;         // UUID
  voterId: string;         // UUID of player who voted
  votedForAnswerId: string; // UUID of the answer voted for
  createdAt: string;       // ISO 8601 timestamp
}
```

---

## Error Codes

| Status Code | Description |
|------------|-------------|
| 200 | Success |
| 201 | Created (successful resource creation) |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (missing or invalid session) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found (resource doesn't exist) |
| 500 | Internal Server Error |

---

## Rate Limiting

Currently, there are no rate limits implemented. This may be added in future versions.

---

## Session Management

Sessions are managed via HTTP-only cookies and stored in Cloudflare KV with a 6-hour expiration. For detailed session implementation, see [DATABASE.md](./DATABASE.md).

Sessions are automatically created when:
- Creating a room
- Joining a room

Sessions are automatically deleted when:
- Leaving a room
- The session expires (6 hours via KV TTL)

The session cookie format is: `session_{roomCode}={sessionToken}`

---

## Game Flow

1. **Lobby Phase**
   - Host creates room → `POST /api/rooms`
   - Players join → `POST /api/rooms/:roomCode/join`
   - Players submit prompts → `POST /api/rooms/:roomCode/prompts`
   - Host starts game → `POST /api/rooms/:roomCode/start`

2. **Playing Phase** (Repeats for each round)
   - **Answering**
     - Players get current prompt → `GET /api/rooms/:roomCode/rounds/current`
     - Players submit answers → `POST /api/rooms/:roomCode/rounds/current/answers`
   - **Voting**
     - Players get answers → `GET /api/rooms/:roomCode/rounds/current/answers`
     - Players vote → `POST /api/rooms/:roomCode/rounds/current/votes`
   - **Results**
     - Players see results → `GET /api/rooms/:roomCode/rounds/current/results`
     - Host starts next round → `POST /api/rooms/:roomCode/rounds/next`

3. **Game End**
   - After all rounds complete
   - Get winner → `GET /api/rooms/:roomCode/winner`

---

## Data Retention

All room data (rooms, players, prompts, rounds, answers, votes) is automatically deleted after 6 hours. This is enforced through:
- Database-level expiration (`expiresAt` column in D1)
- Cleanup worker running every 2 hours
- Durable Object alarms for WebSocket cleanup
- KV TTL for automatic session expiration

For detailed information about the database and storage architecture, see [DATABASE.md](./DATABASE.md).

---

## Development

For local development:
```bash
cd backend
npm run dev
```

The API will be available at `http://localhost:8787/api`

See [backend/README.md](../backend/README.md) for complete setup instructions.
