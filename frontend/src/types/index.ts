export interface Player {
  id: string;
  roomId: string;
  name: string;
  isAI: boolean;
  isEliminated: boolean;
  isHost: boolean;
  score: number;
  socketId?: string;
}

export interface Room {
  id: string;
  roomCode: string;
  hostPlayerId: string;
  status: 'lobby' | 'playing' | 'finished';
  maxPlayers: number;
  aiPlayerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Prompt {
  id: string;
  roomId: string;
  playerId: string;
  promptText: string;
  isUsed: boolean;
  createdAt: string;
}

export interface Round {
  id: string;
  roomId: string;
  roundNumber: number;
  promptId: string;
  status: 'answering' | 'voting' | 'complete';
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

export interface AnswerForVoting {
  id: string;
  roundId: string;
  answerText: string;
  votesReceived: number;
  isOwnAnswer: boolean;
  createdAt: string;
}

export interface GameState {
  room: Room;
  players: Player[];
  currentRound: number;
  totalRounds: number;
}

export interface RoundData {
  round: Round;
  prompt: Prompt;
  hasSubmittedAnswer?: boolean;
  hasVoted?: boolean;
}

export interface Winner {
  winner: Player;
  playerVotes: Record<string, number>;
}
