import axios from 'axios';
import type { Room, Player, GameState, RoundData, AnswerForVoting } from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Configure axios to send cookies with requests
axios.defaults.withCredentials = true;

// Helper to extract data from nested response
const extractData = <T>(response: { success: boolean; data: T }) => response.data;

export const api = {
  // Room management
  createRoom: async (playerName: string) => {
    const res = await axios.post(`${API_URL}/rooms`, { playerName }, { withCredentials: true });
    // Backend returns { success: true, data: { roomCode, playerId } }
    return extractData<{ roomCode: string; playerId: string }>(res.data);
  },

  getRoomDetails: async (roomCode: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}`, { withCredentials: true });
    return extractData<{ room: Room; players: Player[] }>(res.data);
  },

  joinRoom: async (roomCode: string, playerName: string) => {
    const res = await axios.post(`${API_URL}/rooms/${roomCode}/join`, { playerName }, { withCredentials: true });
    // Backend returns { success: true, data: { playerId } }
    return extractData<{ playerId: string }>(res.data);
  },

  leaveRoom: async (roomCode: string) => {
    await axios.delete(`${API_URL}/rooms/${roomCode}/leave`, { withCredentials: true });
  },

  getPlayers: async (roomCode: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}/players`, { withCredentials: true });
    return extractData<{ players: Player[] }>(res.data);
  },

  // Lobby phase
  submitPrompt: async (roomCode: string, promptText: string) => {
    const res = await axios.post(`${API_URL}/rooms/${roomCode}/prompts`, {
      promptText,
    }, { withCredentials: true });
    return extractData(res.data);
  },

  getPromptStatus: async (roomCode: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}/prompts/status`, { withCredentials: true });
    const data = extractData<{ status: Array<{ playerId: string; playerName: string; hasSubmitted: boolean }>; allSubmitted: boolean }>(res.data);
    // Transform to match frontend expectations
    return {
      total: data.status.length,
      submitted: data.status.filter(s => s.hasSubmitted).length,
    };
  },

  startGame: async (roomCode: string) => {
    const res = await axios.post(`${API_URL}/rooms/${roomCode}/start`, {}, { withCredentials: true });
    return extractData(res.data);
  },

  // Game state
  getGameState: async (roomCode: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}/state`, { withCredentials: true });
    return extractData<GameState>(res.data);
  },

  // Round management
  getCurrentRound: async (roomCode: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}/rounds/current`, { withCredentials: true });
    return extractData<RoundData>(res.data);
  },

  submitAnswer: async (roomCode: string, roundId: string, answerText: string) => {
    const res = await axios.post(`${API_URL}/rooms/${roomCode}/rounds/current/answers`, {
      roundId,
      answerText,
    }, { withCredentials: true });
    return extractData(res.data);
  },

  getAnswerStatus: async (roomCode: string, roundId: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}/rounds/current/answers/status?roundId=${roundId}`, { withCredentials: true });
    return extractData<{ submitted: number; total: number; allSubmitted: boolean }>(res.data);
  },

  getAnswers: async (roomCode: string, roundId: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}/rounds/current/answers?roundId=${roundId}`, { withCredentials: true });
    return extractData<{ answers: AnswerForVoting[] }>(res.data);
  },

  submitVote: async (roomCode: string, roundId: string, answerId: string) => {
    const res = await axios.post(`${API_URL}/rooms/${roomCode}/rounds/current/votes`, {
      roundId,
      answerId,
    }, { withCredentials: true });
    return extractData(res.data);
  },

  getVoteStatus: async (roomCode: string, roundId: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}/rounds/current/votes/status?roundId=${roundId}`, { withCredentials: true });
    return extractData<{ submitted: number; total: number; allSubmitted: boolean }>(res.data);
  },

  getRoundResults: async (roomCode: string, roundId: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}/rounds/current/results?roundId=${roundId}`, { withCredentials: true });
    return extractData<{ answers: any[]; gameEnded: boolean }>(res.data);
  },

  continueToNextRound: async (roomCode: string) => {
    const res = await axios.post(`${API_URL}/rooms/${roomCode}/rounds/next`, {}, { withCredentials: true });
    return extractData(res.data);
  },

  // Game results
  getWinner: async (roomCode: string) => {
    const res = await axios.get(`${API_URL}/rooms/${roomCode}/winner`, { withCredentials: true });
    return extractData<{ winner: Player | null; allPlayers: Player[]; playerVotes: Record<string, number> }>(res.data);
  },
};

export const apiService = api;
