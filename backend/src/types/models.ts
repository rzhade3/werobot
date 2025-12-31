// Type definitions for WeRobot game

export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type RoundPhase = 'answering' | 'voting' | 'complete';

export interface Player {
  id: string;
  roomId: string;
  name: string;
  isAI: boolean;
  isEliminated: boolean;
  isHost: boolean;
  score: number;
  createdAt: string;
}

export interface Room {
  id: string;
  roomCode: string;
  hostPlayerId: string;
  status: RoomStatus;
  maxPlayers: number;
  aiPlayerId?: string;
  currentRoundNumber: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface Prompt {
  id: string;
  roomId: string;
  playerId: string;
  promptText: string;
  isUsed: boolean;
  assignedRoundNumber?: number;
  createdAt: string;
}

export interface Round {
  id: string;
  roomId: string;
  roundNumber: number;
  promptId: string;
  status: RoundPhase;
  eliminatedPlayerId?: string;
  createdAt: string;
}

export interface Answer {
  id: string;
  roundId: string;
  playerId: string;
  answerText: string;
  votesReceived: number;
  createdAt: string;
}

export interface Vote {
  id: string;
  roundId: string;
  voterId: string;
  votedForAnswerId: string;
  createdAt: string;
}

// Response type for voting phase - excludes playerId for security
export interface AnswerForVoting {
  id: string;
  roundId: string;
  answerText: string;
  votesReceived: number;
  isOwnAnswer: boolean;
  createdAt: string;
}

// Session data stored in KV
export interface SessionData {
  playerId: string;
  roomId: string;
  roomCode: string;
  expiresAt: number;
}

// Environment bindings
export interface Env {
  // Durable Objects (direct Workers deployment)
  GAME_ROOM?: DurableObjectNamespace;
  
  // Service binding (Pages Functions deployment)
  DURABLE_OBJECTS_WORKER?: Fetcher;
  
  // D1 Database
  DB: D1Database;
  
  // KV Storage
  SESSIONS: KVNamespace;
  
  // Cloudflare AI Workers
  AI?: Ai;
  
  // Secrets (fallback for non-production only)
  OPENAI_API_KEY?: string;
  OPENAI_API_ENDPOINT?: string;
  OPENAI_MODEL?: string;
  CORS_ORIGIN?: string;
  
  // Variables
  ENVIRONMENT: string;
  ROOM_TTL_HOURS: string;
  CLEANUP_BATCH_SIZE: string;
}

// WebSocket message types
export interface WSMessage {
  type: string;
  roomCode?: string;
  playerId?: string;
  data?: any;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Helper functions for creating entities
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function createPlayer(
  roomId: string,
  name: string,
  isHost: boolean = false,
  isAI: boolean = false
): Omit<Player, 'createdAt'> {
  return {
    id: generateId(),
    roomId,
    name,
    isAI,
    isEliminated: false,
    isHost,
    score: 0,
  };
}

export function createRoom(hostPlayerId: string): Omit<Room, 'createdAt' | 'updatedAt' | 'expiresAt'> {
  return {
    id: generateId(),
    roomCode: generateRoomCode(),
    hostPlayerId,
    status: 'lobby',
    maxPlayers: 6,
    currentRoundNumber: 0,
  };
}

export function createPrompt(
  roomId: string,
  playerId: string,
  promptText: string
): Omit<Prompt, 'createdAt'> {
  return {
    id: generateId(),
    roomId,
    playerId,
    promptText,
    isUsed: false,
  };
}

export function createRound(
  roomId: string,
  roundNumber: number,
  promptId: string,
  status: RoundPhase = 'answering'
): Omit<Round, 'createdAt'> {
  return {
    id: generateId(),
    roomId,
    roundNumber,
    promptId,
    status,
  };
}

export function createAnswer(
  roundId: string,
  playerId: string,
  answerText: string
): Omit<Answer, 'createdAt'> {
  return {
    id: generateId(),
    roundId,
    playerId,
    answerText,
    votesReceived: 0,
  };
}

export function createVote(
  roundId: string,
  voterId: string,
  votedForAnswerId: string
): Omit<Vote, 'createdAt'> {
  return {
    id: generateId(),
    roundId,
    voterId,
    votedForAnswerId,
  };
}
