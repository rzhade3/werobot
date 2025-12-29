// Game logic service

import type { Env, Player, Round, Answer } from '../types/models';
import { DatabaseQueries } from '../db/queries';
import { createRound, createAnswer, createPlayer } from '../types/models';
import { generateAIAnswer, rankAnswersForVote } from './ai.service';
import { generatePassword, hashPassword } from '../utils/helpers';

export class GameService {
  private db: DatabaseQueries;

  constructor(private env: Env) {
    this.db = new DatabaseQueries(env.DB);
  }

  async canStartGame(roomId: string): Promise<{ canStart: boolean; reason?: string }> {
    const players = await this.db.getPlayersByRoomId(roomId);
    const prompts = await this.db.getPromptsByRoomId(roomId);

    // Need at least 2 human players
    const humanPlayers = players.filter((p) => !p.isAI);
    if (humanPlayers.length < 2) {
      return { canStart: false, reason: 'Need at least 2 players' };
    }

    // Each human player must submit a prompt
    if (prompts.length < humanPlayers.length) {
      return { canStart: false, reason: 'All players must submit prompts' };
    }

    return { canStart: true };
  }

  async addAIPlayer(roomId: string): Promise<Player> {
    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    const aiPlayer = createPlayer(roomId, 'AI Player', passwordHash, false, true);
    return this.db.createPlayer(aiPlayer);
  }

  async startNewRound(roomId: string, roundNumber: number): Promise<Round> {
    // Get an unused prompt
    const prompt = await this.db.getUnusedPrompt(roomId);
    if (!prompt) {
      throw new Error('No prompts available');
    }

    // Mark prompt as used
    await this.db.markPromptAsUsed(prompt.id);

    // Create new round
    const round = createRound(roomId, roundNumber, prompt.id);
    return this.db.createRound(round);
  }

  async submitAnswer(roundId: string, playerId: string, answerText: string): Promise<Answer> {
    const answer = createAnswer(roundId, playerId, answerText);
    return this.db.createAnswer(answer);
  }

  async generateAIAnswer(roundId: string, aiPlayerId: string): Promise<Answer> {
    // Get round and prompt
    const round = await this.db.getRoundById(roundId);
    if (!round) {
      throw new Error('Round not found');
    }

    const prompt = await this.db.getPromptById(round.promptId);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    // Generate AI response with configurable endpoint and model
    const aiResponse = await generateAIAnswer(
      prompt.promptText, 
      this.env.OPENAI_API_KEY || '',
      this.env.OPENAI_API_ENDPOINT,
      this.env.OPENAI_MODEL
    );

    // Save answer
    return this.submitAnswer(roundId, aiPlayerId, aiResponse);
  }

  async allPlayersAnswered(roundId: string): Promise<boolean> {
    const round = await this.db.getRoundById(roundId);
    if (!round) return false;

    const room = await this.db.getRoomById(round.roomId);
    if (!room) return false;

    const activePlayers = await this.db.getActivePlayers(room.id);
    const answers = await this.db.getAnswersByRoundId(roundId);

    return answers.length >= activePlayers.length;
  }

  async allPlayersVoted(roundId: string): Promise<boolean> {
    const round = await this.db.getRoundById(roundId);
    if (!round) return false;

    const room = await this.db.getRoomById(round.roomId);
    if (!room) return false;

    const activePlayers = await this.db.getActivePlayers(room.id);
    const votes = await this.db.getVotesByRoundId(roundId);

    return votes.length >= activePlayers.length;
  }

  async determineEliminatedPlayer(roundId: string): Promise<string | null> {
    const answers = await this.db.getAnswersByRoundId(roundId);

    if (answers.length === 0) return null;

    // Find answer(s) with most votes
    const maxVotes = Math.max(...answers.map((a) => a.votesReceived));
    const topAnswers = answers.filter((a) => a.votesReceived === maxVotes);

    // If tie, pick random
    const eliminatedAnswer = topAnswers[Math.floor(Math.random() * topAnswers.length)];

    return eliminatedAnswer.playerId;
  }

  async eliminatePlayer(playerId: string): Promise<void> {
    await this.db.updatePlayer(playerId, { isEliminated: true });
  }

  async getActivePlayerCount(roomId: string): Promise<number> {
    const activePlayers = await this.db.getActivePlayers(roomId);
    return activePlayers.length;
  }

  async determineWinner(roomId: string): Promise<Player | null> {
    const allPlayers = await this.db.getPlayersByRoomId(roomId);
    const room = await this.db.getRoomById(roomId);

    console.log(`Determining winner for room ${roomId}:`, {
      totalPlayers: allPlayers.length,
    });

    // Get all rounds for this room
    const rounds = await this.db.getRoundsByRoomId(roomId);
    
    // Calculate total votes received for each player
    const playerVotes: Record<string, number> = {};
    
    for (const player of allPlayers) {
      playerVotes[player.id] = 0;
    }
    
    // Sum up votes from all rounds
    for (const round of rounds) {
      const answers = await this.db.getAnswersByRoundId(round.id);
      for (const answer of answers) {
        if (playerVotes[answer.playerId] !== undefined) {
          playerVotes[answer.playerId] += answer.votesReceived;
        }
      }
    }

    console.log('Player votes:', playerVotes);

    // Find player with minimum votes (excluding AI if present)
    const humanPlayers = allPlayers.filter(p => !p.isAI);
    
    if (humanPlayers.length === 0) {
      console.warn('No human players found');
      return null;
    }

    let winner = humanPlayers[0];
    let minVotes = playerVotes[winner.id] || 0;

    for (const player of humanPlayers) {
      const votes = playerVotes[player.id] || 0;
      if (votes < minVotes) {
        minVotes = votes;
        winner = player;
      }
    }

    console.log(`Winner: ${winner.name} with ${minVotes} votes`);
    return winner;
  }

  async isGameOver(roomId: string): Promise<boolean> {
    const room = await this.db.getRoomById(roomId);
    if (!room) return false;

    // Get current round number
    const currentRound = await this.db.getCurrentRound(roomId);
    if (!currentRound || currentRound.status !== 'complete') return false;
    
    // Get number of human players
    const allPlayers = await this.db.getPlayersByRoomId(roomId);
    const humanPlayerCount = allPlayers.filter(p => !p.isAI).length;
    
    // Game ends after number of rounds = number of human players
    return currentRound.roundNumber >= humanPlayerCount;
  }

  async getAnswersForVoting(roundId: string, currentPlayerId: string): Promise<any[]> {
    const answers = await this.db.getAnswersByRoundId(roundId);

    // Shuffle answers for anonymity
    const shuffled = answers.sort(() => Math.random() - 0.5);

    // Map to voting format (hide player IDs)
    return shuffled.map((answer) => ({
      id: answer.id,
      roundId: answer.roundId,
      answerText: answer.answerText,
      votesReceived: answer.votesReceived,
      isOwnAnswer: answer.playerId === currentPlayerId,
      createdAt: answer.createdAt,
    }));
  }

  async generateAIVote(roundId: string, aiPlayerId: string): Promise<string | null> {
    // Get the round and prompt
    const round = await this.db.getRoundById(roundId);
    if (!round) {
      throw new Error('Round not found');
    }

    const prompt = await this.db.getPromptById(round.promptId);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    // Get all answers except AI's own
    const answers = await this.db.getAnswersByRoundId(roundId);
    const votableAnswers = answers
      .filter(a => a.playerId !== aiPlayerId)
      .map(a => ({ id: a.id, text: a.answerText }));

    if (votableAnswers.length === 0) {
      return null;
    }

    // Use AI to rank and pick the most human-sounding answer
    const selectedAnswerId = await rankAnswersForVote(
      prompt.promptText,
      votableAnswers,
      this.env.OPENAI_API_KEY || '',
      this.env.OPENAI_API_ENDPOINT,
      this.env.OPENAI_MODEL
    );

    return selectedAnswerId;
  }
}
