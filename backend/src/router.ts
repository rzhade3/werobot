// Main API router using Hono framework
// NOTE: CORS removed - same-origin deployment!

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/models';
import { DatabaseQueries } from './db/queries';
import { GameService } from './services/game.service';
import {
  validateRoomCode,
  validatePlayerName,
  validatePrompt,
  validateAnswer,
  createSessionCookie,
  createSession,
  deleteSession,
  getSession,
  generatePassword,
  hashPassword,
  verifySession,
} from './utils/helpers';
import { createRoom, createPlayer, createPrompt, createVote } from './types/models';

type Variables = {
  session: any;
  db: DatabaseQueries;
  gameService: GameService;
  player: any;
  room: any;
  waitUntil: (promise: Promise<any>) => void;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Add CORS for local development
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:8787'],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposeHeaders: ['Set-Cookie'],
}));

// Database and service initialization middleware
app.use('*', async (c, next) => {
  c.set('db', new DatabaseQueries(c.env.DB));
  c.set('gameService', new GameService(c.env));
  // Store waitUntil function (passed as 3rd param from Pages Functions or ExecutionContext)
  const executionCtx = c.executionCtx;
  if (executionCtx && typeof executionCtx.waitUntil === 'function') {
    // Standard Workers format
    c.set('waitUntil', executionCtx.waitUntil.bind(executionCtx));
  } else if (executionCtx && typeof executionCtx === 'function') {
    // Pages Functions format - waitUntil is passed directly
    c.set('waitUntil', executionCtx);
  }
  await next();
});

// Session middleware (optional - only for protected routes)
// Verifies: 1) Session exists, 2) Not expired, 3) Player still exists in DB
const requireAuth = async (c: any, next: any) => {
  const db: DatabaseQueries = c.get('db');
  const verification = await verifySession(c.req.raw, c.env, db);
  
  if (!verification.valid || !verification.session) {
    return c.json({ success: false, error: 'Unauthorized - Please join a room first' }, 401);
  }
  
  // Store both session and validated player from verification
  c.set('session', verification.session);
  c.set('validatedPlayerId', verification.playerId);
  await next();
};

// Room access middleware (requires requireAuth first)
// Verifies: 1) Session roomCode matches URL, 2) Player belongs to room
const requireRoomAccess = async (c: any, next: any) => {
  const session = c.get('session'); // Must be called after requireAuth
  const roomCode = c.req.param('roomCode');
  const db: DatabaseQueries = c.get('db');
  
  // Verify session roomCode matches request
  if (session.roomCode !== roomCode) {
    return c.json({ success: false, error: 'Forbidden - You are not in this room' }, 403);
  }

  // Get player (already verified by requireAuth, just need full object)
  const player = await db.getPlayerById(session.playerId);
  if (!player) {
    return c.json({ success: false, error: 'Forbidden - Player not found' }, 403);
  }

  // Verify player's room matches the requested room
  const room = await db.getRoomByCode(roomCode);
  if (!room || player.roomId !== room.id) {
    return c.json({ success: false, error: 'Forbidden - You are not in this room' }, 403);
  }

  // Attach validated player and room to context for use in route handlers
  c.set('player', player);
  c.set('room', room);
  
  await next();
};

// Host middleware (requires requireRoomAccess first)
// Verifies: Player is the host of the room
const requireHost = async (c: any, next: any) => {
  const player = c.get('player'); // Must be called after requireRoomAccess
  
  if (!player || !player.isHost) {
    return c.json({ success: false, error: 'Forbidden - Only the host can perform this action' }, 403);
  }
  await next();
};

// Helper to broadcast to room via service binding
const broadcastToRoom = async (c: any, roomCode: string, eventType: string) => {
  try {
    console.log(`broadcastToRoom called: room=${roomCode}, event=${eventType}`);
    
    // Use service binding to access Durable Objects
    // In Pages Functions, we use DURABLE_OBJECTS_WORKER service binding
    // In direct Workers deployment, we use GAME_ROOM binding
    if (c.env.DURABLE_OBJECTS_WORKER) {
      // Pages Functions path - use service binding
      const response = await c.env.DURABLE_OBJECTS_WORKER.fetch(
        `https://internal/broadcast?roomCode=${roomCode}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: eventType }),
        }
      );
      console.log(`broadcastToRoom response status: ${response.status}`);
    } else if (c.env.GAME_ROOM) {
      // Direct Workers deployment path - use Durable Objects directly
      const durableId = c.env.GAME_ROOM.idFromName(roomCode);
      const stub = c.env.GAME_ROOM.get(durableId);
      const response = await stub.fetch('https://internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: eventType }),
      });
      console.log(`broadcastToRoom response status: ${response.status}`);
    } else {
      console.warn('No Durable Objects binding available');
    }
  } catch (err) {
    console.error('Failed to broadcast:', err);
  }
};

// ============================================================================
// Health check route
// ============================================================================
app.get('/api/health', (c) => {
  return c.json({ success: true, status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================================================
// ROOM MANAGEMENT ROUTES
// ============================================================================

app.post('/api/rooms', async (c) => {
  try {
    const body = await c.req.json();
    
    if (!body.playerName || !validatePlayerName(body.playerName)) {
      return c.json({ success: false, error: 'Player name must be 2-20 characters' }, 400);
    }

    const db: DatabaseQueries = c.get('db');
    
    // Generate password for the host player
    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    
    // Create host player
    const hostPlayer = createPlayer('temp', body.playerName, passwordHash, true, false);
    
    // Create room
    const room = createRoom(hostPlayer.id);
    hostPlayer.roomId = room.id;

    // Save to database
    await db.createRoom(room);
    await db.createPlayer(hostPlayer);

    // Create session (no password needed - session token is sufficient)
    const sessionToken = await createSession(c.env, hostPlayer.id, room.id, room.roomCode);

    // Minimal response - only what's needed to make subsequent requests
    const response = c.json({
      success: true,
      data: {
        roomCode: room.roomCode,
        playerId: hostPlayer.id,
      },
    }, 201);
    
    response.headers.set('Set-Cookie', createSessionCookie(sessionToken));
    return response;
  } catch (error) {
    console.error('ERROR in createRoom:', error);
    return c.json({ success: false, error: 'Failed to create room' }, 500);
  }
});

app.get('/api/rooms/:roomCode', requireAuth, requireRoomAccess, async (c) => {
  const roomCode = c.req.param('roomCode');
  const session = c.get('session');

  const db: DatabaseQueries = c.get('db');
  const room = await db.getRoomByCode(roomCode);

  if (!room) {
    return c.json({ success: false, error: 'Room not found' }, 404);
  }

  const players = await db.getPlayersByRoomId(room.id);

  return c.json({ success: true, data: { room, players } });
});

app.post('/api/rooms/:roomCode/join', async (c) => {
  const roomCode = c.req.param('roomCode');
  const body = await c.req.json();

  if (!body.playerName || !validatePlayerName(body.playerName)) {
    return c.json({ success: false, error: 'Player name must be 2-20 characters' }, 400);
  }

  if (!validateRoomCode(roomCode)) {
    return c.json({ success: false, error: 'Invalid room code' }, 400);
  }

  const db: DatabaseQueries = c.get('db');
  
  // Check if user already has an active session for this room
  const existingSession = await getSession(c.req.raw, c.env);
  if (existingSession && existingSession.roomCode === roomCode) {
    // User already has a session for this room
    const player = await db.getPlayerById(existingSession.playerId);
    if (player && !player.isEliminated) {
      return c.json({ 
        success: false, 
        error: 'You are already in this room. Refresh the page to rejoin.' 
      }, 400);
    }
  }

  const room = await db.getRoomByCode(roomCode);

  if (!room) {
    return c.json({ success: false, error: 'Room not found' }, 404);
  }

  if (room.status !== 'lobby') {
    return c.json({ success: false, error: 'Cannot join - game already started' }, 400);
  }

  const players = await db.getPlayersByRoomId(room.id);
  if (players.length >= room.maxPlayers) {
    return c.json({ success: false, error: 'Room is full' }, 400);
  }

  // Generate password for the new player
  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  // Create player
  const player = createPlayer(room.id, body.playerName, passwordHash, false, false);
  await db.createPlayer(player);

  // Create session (no password needed - session token is sufficient)
  const sessionToken = await createSession(c.env, player.id, room.id, room.roomCode);

  // Broadcast event
  await broadcastToRoom(c, roomCode, 'player:joined');

  // Minimal response - only what's needed
  const response = c.json({
    success: true,
    data: {
      playerId: player.id,
    },
  });
  
  response.headers.set('Set-Cookie', createSessionCookie(sessionToken));
  return response;
});

app.delete('/api/rooms/:roomCode/leave', requireAuth, requireRoomAccess, async (c) => {
  const roomCode = c.req.param('roomCode');
  const session = c.get('session');

  const db: DatabaseQueries = c.get('db');
  await db.deletePlayer(session.playerId);
  await deleteSession(c.req.raw, c.env);

  await broadcastToRoom(c, roomCode, 'player:left');

  return c.json({ success: true, data: { message: 'Left room successfully' } });
});

app.get('/api/rooms/:roomCode/players', requireAuth, requireRoomAccess, async (c) => {
  const roomCode = c.req.param('roomCode');

  const db: DatabaseQueries = c.get('db');
  const room = await db.getRoomByCode(roomCode);

  if (!room) {
    return c.json({ success: false, error: 'Room not found' }, 404);
  }

  const players = await db.getPlayersByRoomId(room.id);

  return c.json({ success: true, data: { players } });
});

// ============================================================================
// LOBBY PHASE ROUTES
// ============================================================================

app.post('/api/rooms/:roomCode/prompts', requireAuth, requireRoomAccess, async (c) => {
  const roomCode = c.req.param('roomCode');
  const session = c.get('session');

  const body = await c.req.json();

  if (!body.promptText || !validatePrompt(body.promptText)) {
    return c.json({ success: false, error: 'Prompt must be 10-500 characters' }, 400);
  }

  const db: DatabaseQueries = c.get('db');
  const room = c.get('room'); // Already validated by requireRoomAccess

  if (room.status !== 'lobby') {
    return c.json({ success: false, error: 'Cannot submit prompt - game already started' }, 400);
  }

  // Check if player already submitted
  const existingPrompts = await db.getPromptsByRoomId(room.id);
  if (existingPrompts.some((p) => p.playerId === session.playerId)) {
    return c.json({ success: false, error: 'You already submitted a prompt' }, 400);
  }

  const prompt = createPrompt(room.id, session.playerId, body.promptText);
  await db.createPrompt(prompt);

  await broadcastToRoom(c, roomCode, 'prompt:submitted');

  return c.json({ success: true, data: { prompt } });
});

app.get('/api/rooms/:roomCode/prompts/status', requireAuth, requireRoomAccess, async (c) => {
  const db: DatabaseQueries = c.get('db');
  const room = c.get('room'); // Already validated by requireRoomAccess

  const players = await db.getPlayersByRoomId(room.id);
  const humanPlayers = players.filter((p) => !p.isAI);
  const prompts = await db.getPromptsByRoomId(room.id);

  const status = humanPlayers.map((player) => ({
    playerId: player.id,
    playerName: player.name,
    hasSubmitted: prompts.some((p) => p.playerId === player.id),
  }));

  return c.json({
    success: true,
    data: {
      status,
      allSubmitted: status.every((s) => s.hasSubmitted),
    },
  });
});

app.post('/api/rooms/:roomCode/start', requireAuth, requireRoomAccess, requireHost, async (c) => {
  const roomCode = c.req.param('roomCode');
  const db: DatabaseQueries = c.get('db');
  const gameService: GameService = c.get('gameService');
  const room = c.get('room'); // Already validated by requireRoomAccess
  const player = c.get('player'); // Already validated by requireRoomAccess

  const canStart = await gameService.canStartGame(room.id);
  if (!canStart.canStart) {
    return c.json({ success: false, error: canStart.reason || 'Cannot start game' }, 400);
  }

  // Add AI player
  const aiPlayer = await gameService.addAIPlayer(room.id);
  await db.updateRoom(room.id, { aiPlayerId: aiPlayer.id, status: 'playing' });

  // Assign prompts to round numbers upfront (O(1) lookups later)
  await gameService.assignPromptsToRounds(room.id);

  // Start first round
  const round = await gameService.startNewRound(room.id, 1);

  // Trigger AI answer generation asynchronously
  const waitUntil = c.get('waitUntil');
  if (waitUntil) {
    waitUntil(
      gameService.generateAIAnswer(round.id, aiPlayer.id)
        .then(() => broadcastToRoom(c, roomCode, 'answer:submitted'))
        .catch(err => {
          // Ignore constraint violation errors (AI already answered)
          if (!err.message?.includes('UNIQUE constraint')) {
            console.error('AI answer generation failed:', err);
          }
        })
    );
  }

  await broadcastToRoom(c, roomCode, 'game:started');

  return c.json({ success: true, data: { message: 'Game started' } });
});

// ============================================================================
// GAME STATE ROUTES
// ============================================================================

app.get('/api/rooms/:roomCode/state', requireAuth, requireRoomAccess, async (c) => {
  const room = c.get('room'); // Validated by requireRoomAccess
  const db: DatabaseQueries = c.get('db');

  const players = await db.getPlayersByRoomId(room.id);
  const currentRound = await db.getCurrentRound(room.id);
  
  // Total rounds equals number of human players
  const humanPlayerCount = players.filter(p => !p.isAI).length;

  return c.json({
    success: true,
    data: {
      room,
      players,
      currentRound: currentRound?.roundNumber || 0,
      totalRounds: humanPlayerCount,
    },
  });
});

// ============================================================================
// ROUND ROUTES
// ============================================================================

app.get('/api/rooms/:roomCode/rounds/current', requireAuth, requireRoomAccess, async (c) => {
  const db: DatabaseQueries = c.get('db');
  const room = c.get('room'); // Already validated by requireRoomAccess
  const session = c.get('session');

  const round = await db.getCurrentRound(room.id);
  if (!round) {
    return c.json({ success: false, error: 'No active round' }, 404);
  }

  const prompt = await db.getPromptById(round.promptId);
  
  // Check if player has submitted answer
  const answers = await db.getAnswersByRoundId(round.id);
  const hasSubmittedAnswer = answers.some(a => a.playerId === session.playerId);
  
  // Check if player has voted
  const votes = await db.getVotesByRoundId(round.id);
  const hasVoted = votes.some(v => v.voterId === session.playerId);

  return c.json({ 
    success: true, 
    data: { 
      round, 
      prompt,
      hasSubmittedAnswer,
      hasVoted,
    } 
  });
});

app.post('/api/rooms/:roomCode/rounds/current/answers', requireAuth, requireRoomAccess, async (c) => {
  const roomCode = c.req.param('roomCode');
  const session = c.get('session');
  const body = await c.req.json();

  if (!body.answerText || !validateAnswer(body.answerText)) {
    return c.json({ success: false, error: 'Answer must be 1-1000 characters' }, 400);
  }

  const db: DatabaseQueries = c.get('db');
  const gameService: GameService = c.get('gameService');
  const room = c.get('room'); // Already validated by requireRoomAccess

  const round = await db.getCurrentRound(room.id);
  if (!round || round.status !== 'answering') {
    return c.json({ success: false, error: 'Not in answering phase' }, 400);
  }

  // Check if already answered
  const answers = await db.getAnswersByRoundId(round.id);
  if (answers.some((a) => a.playerId === session.playerId)) {
    return c.json({ success: false, error: 'You already submitted an answer' }, 400);
  }

  await gameService.submitAnswer(round.id, session.playerId, body.answerText);

  // Broadcast that an answer was submitted
  await broadcastToRoom(c, roomCode, 'answer:submitted');

  // Check if all answered
  if (await gameService.allPlayersAnswered(round.id)) {
    await db.updateRound(round.id, { status: 'voting' });
    await broadcastToRoom(c, roomCode, 'voting:started');

    // Trigger AI vote generation asynchronously when voting starts
    if (room.aiPlayerId) {
      const waitUntil = c.get('waitUntil');
      if (waitUntil) {
        waitUntil(
          gameService.generateAIVote(round.id, room.aiPlayerId)
            .then(selectedAnswerId => {
              if (selectedAnswerId) {
                const aiVoteRecord = createVote(round.id, room.aiPlayerId, selectedAnswerId);
                return db.createVote(aiVoteRecord)
                  .then(() => db.incrementAnswerVotes(selectedAnswerId))
                  .then(() => broadcastToRoom(c, roomCode, 'vote:cast'));
              }
            })
            .catch(err => {
              // Ignore constraint violation errors (AI already voted)
              if (!err.message?.includes('UNIQUE constraint')) {
                console.error('AI vote generation failed:', err);
              }
            })
        );
      }
    }
  }

  return c.json({ success: true, data: { message: 'Answer submitted' } });
});

app.get('/api/rooms/:roomCode/rounds/current/answers/status', requireAuth, requireRoomAccess, async (c) => {
  const db: DatabaseQueries = c.get('db');
  const room = c.get('room'); // Already validated by requireRoomAccess

  const round = await db.getCurrentRound(room.id);
  if (!round) {
    return c.json({ success: false, error: 'No active round' }, 404);
  }

  const activePlayers = await db.getActivePlayers(room.id);
  const answers = await db.getAnswersByRoundId(round.id);

  return c.json({
    success: true,
    data: {
      submitted: answers.length,
      total: activePlayers.length,
      allSubmitted: answers.length >= activePlayers.length,
    },
  });
});

app.get('/api/rooms/:roomCode/rounds/current/answers', requireAuth, requireRoomAccess, async (c) => {
  const session = c.get('session');
  const db: DatabaseQueries = c.get('db');
  const gameService: GameService = c.get('gameService');
  const room = c.get('room'); // Already validated by requireRoomAccess

  const round = await db.getCurrentRound(room.id);
  if (!round || round.status !== 'voting') {
    return c.json({ success: false, error: 'Not in voting phase' }, 400);
  }

  const answers = await gameService.getAnswersForVoting(round.id, session.playerId);

  return c.json({ success: true, data: { answers } });
});

// ============================================================================
// VOTE ROUTES
// ============================================================================

app.post('/api/rooms/:roomCode/rounds/current/votes', requireAuth, requireRoomAccess, async (c) => {
  const roomCode = c.req.param('roomCode');
  const session = c.get('session');
  const body = await c.req.json();

  if (!body.answerId) {
    return c.json({ success: false, error: 'Answer ID is required' }, 400);
  }

  const db: DatabaseQueries = c.get('db');
  const gameService: GameService = c.get('gameService');
  const room = c.get('room'); // Already validated by requireRoomAccess

  const round = await db.getCurrentRound(room.id);
  if (!round || round.status !== 'voting') {
    return c.json({ success: false, error: 'Not in voting phase' }, 400);
  }

  // Check if already voted
  const existingVote = await db.getVoteByVoterAndRound(session.playerId, round.id);
  if (existingVote) {
    return c.json({ success: false, error: 'You already voted' }, 400);
  }

  // Verify answer exists
  const answer = await db.getAnswerById(body.answerId);
  if (!answer || answer.roundId !== round.id) {
    return c.json({ success: false, error: 'Invalid answer' }, 400);
  }

  // Can't vote for own answer
  if (answer.playerId === session.playerId) {
    return c.json({ success: false, error: 'Cannot vote for your own answer' }, 400);
  }

  const vote = createVote(round.id, session.playerId, body.answerId);
  await db.createVote(vote);
  await db.incrementAnswerVotes(body.answerId);

  // Broadcast that a vote was cast
  await broadcastToRoom(c, roomCode, 'vote:cast');

  // Check if all voted
  if (await gameService.allPlayersVoted(round.id)) {
    // Mark round as complete (no elimination)
    await db.updateRound(round.id, { status: 'complete' });

    // Check if game over (after 5 rounds)
    if (await gameService.isGameOver(room.id)) {
      await db.updateRoom(room.id, { status: 'finished' });
    }

    await broadcastToRoom(c, roomCode, 'round:ended');
  }

  return c.json({ success: true, data: { message: 'Vote submitted' } });
});

app.get('/api/rooms/:roomCode/rounds/current/votes/status', requireAuth, requireRoomAccess, async (c) => {
  const db: DatabaseQueries = c.get('db');
  const room = c.get('room'); // Already validated by requireRoomAccess

  const round = await db.getCurrentRound(room.id);
  if (!round) {
    return c.json({ success: false, error: 'No active round' }, 404);
  }

  const activePlayers = await db.getActivePlayers(room.id);
  const votes = await db.getVotesByRoundId(round.id);

  return c.json({
    success: true,
    data: {
      submitted: votes.length,
      total: activePlayers.length,
      allSubmitted: votes.length >= activePlayers.length,
    },
  });
});

app.get('/api/rooms/:roomCode/rounds/current/results', requireAuth, requireRoomAccess, async (c) => {
  const db: DatabaseQueries = c.get('db');
  const gameService: GameService = c.get('gameService');
  const room = c.get('room'); // Already validated by requireRoomAccess

  const round = await db.getCurrentRound(room.id);
  if (!round || round.status !== 'complete') {
    return c.json({ success: false, error: 'Round not complete' }, 400);
  }

  const answers = await db.getAnswersByRoundId(round.id);

  // Check if game is over
  const gameEnded = await gameService.isGameOver(room.id);

  return c.json({ 
    success: true, 
    data: { 
      answers,
      gameEnded,
    } 
  });
});

app.post('/api/rooms/:roomCode/rounds/next', requireAuth, requireRoomAccess, requireHost, async (c) => {
  const roomCode = c.req.param('roomCode');
  const db: DatabaseQueries = c.get('db');
  const gameService: GameService = c.get('gameService');
  const room = c.get('room'); // Already validated by requireRoomAccess

  if (await gameService.isGameOver(room.id)) {
    // Game is over - update status and broadcast game ended
    await db.updateRoom(room.id, { status: 'finished' });
    await broadcastToRoom(c, roomCode, 'game:ended');
    return c.json({ success: true, data: { message: 'Game ended' } });
  }

  const currentRound = await db.getCurrentRound(room.id);
  const nextRoundNumber = (currentRound?.roundNumber || 0) + 1;

  const round = await gameService.startNewRound(room.id, nextRoundNumber);

  // Trigger AI answer generation asynchronously
  if (room.aiPlayerId) {
    const waitUntil = c.get('waitUntil');
    if (waitUntil) {
      waitUntil(
        gameService.generateAIAnswer(round.id, room.aiPlayerId)
          .then(() => broadcastToRoom(c, roomCode, 'answer:submitted'))
          .catch(err => {
            // Ignore constraint violation errors (AI already answered)
            if (!err.message?.includes('UNIQUE constraint')) {
              console.error('AI answer generation failed:', err);
            }
          })
      );
    }
  }

  await broadcastToRoom(c, roomCode, 'round:started');

  return c.json({ success: true, data: { message: 'Next round started' } });
});

// ============================================================================
// WINNER ROUTE
// ============================================================================

app.get('/api/rooms/:roomCode/winner', requireAuth, requireRoomAccess, async (c) => {
  const db: DatabaseQueries = c.get('db');
  const gameService: GameService = c.get('gameService');
  const room = c.get('room'); // Already validated by requireRoomAccess

  if (room.status !== 'finished') {
    return c.json({ success: false, error: 'Game not finished' }, 400);
  }

  const winner = await gameService.determineWinner(room.id);
  const allPlayers = await db.getPlayersByRoomId(room.id);
  
  // Calculate total votes for each player
  const rounds = await db.getRoundsByRoomId(room.id);
  const playerVotes: Record<string, number> = {};
  
  for (const player of allPlayers) {
    playerVotes[player.id] = 0;
  }
  
  for (const round of rounds) {
    const answers = await db.getAnswersByRoundId(round.id);
    for (const answer of answers) {
      if (playerVotes[answer.playerId] !== undefined) {
        playerVotes[answer.playerId] += answer.votesReceived;
      }
    }
  }

  return c.json({ 
    success: true, 
    data: { 
      winner, 
      allPlayers,
      playerVotes,
    } 
  });
});

// ============================================================================
// WEBSOCKET ROUTES
// ============================================================================

/**
 * WebSocket upgrade endpoint
 * Connects client to the GameRoom Durable Object for real-time updates
 * Protected: Requires valid session
 */
app.get('/api/ws', async (c) => {
  const roomCode = c.req.query('roomCode');
  const playerId = c.req.query('playerId');

  if (!roomCode || !playerId) {
    return c.json({ success: false, error: 'Missing roomCode or playerId' }, 400);
  }

  // Verify session
  const db: DatabaseQueries = c.get('db');
  const verification = await verifySession(c.req.raw, c.env, db);
  
  if (!verification.valid || !verification.session) {
    return c.json({ success: false, error: 'Unauthorized - Invalid session' }, 401);
  }

  // Verify the session matches the requested connection
  if (verification.session.roomCode !== roomCode || verification.session.playerId !== playerId) {
    return c.json({ success: false, error: 'Forbidden - Session mismatch' }, 403);
  }

  // Get the Durable Object for this room
  const durableId = c.env.GAME_ROOM.idFromName(roomCode);
  const stub = c.env.GAME_ROOM.get(durableId);

  // Forward the WebSocket upgrade request
  const url = new URL(c.req.url);
  return stub.fetch(url.toString(), c.req.raw);
});

export default app;
