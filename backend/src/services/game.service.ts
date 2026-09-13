// Game logic service

import type { Env, Player, Round, Answer } from '../types/models';
import { DatabaseQueries } from '../db/queries';
import { createRound, createAnswer, createPlayer } from '../types/models';
import { generateAIAnswer, rankAnswersForVote } from './ai.service';

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
    const aiPlayer = createPlayer(roomId, 'AI Player', false, true);
    return this.db.createPlayer(aiPlayer);
  }

  async assignPromptsToRounds(roomId: string): Promise<void> {
    // Get all prompts and shuffle them
    const prompts = await this.db.getPromptsByRoomId(roomId);
    const shuffledPrompts = prompts.sort(() => Math.random() - 0.5);

    // Assign each prompt to a round number
    for (let i = 0; i < shuffledPrompts.length; i++) {
      await this.db.assignPromptToRound(shuffledPrompts[i].id, i + 1);
    }

    console.log(`Assigned ${shuffledPrompts.length} prompts to rounds for room ${roomId}`);
  }

  async startNewRound(roomId: string, roundNumber: number): Promise<Round> {
    // Get the prompt assigned to this round number
    const prompt = await this.db.getPromptByRoundNumber(roomId, roundNumber);
    if (!prompt) {
      throw new Error(`No prompt assigned to round ${roundNumber}`);
    }

    // Create the round
    const round = createRound(roomId, roundNumber, prompt.id, 'answering');
    const createdRound = await this.db.createRound(round);
    
    // Update room's current_round_number
    await this.db.updateRoom(roomId, { currentRoundNumber: roundNumber });
    
    return createdRound;
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

    // Generate AI response using Cloudflare AI or fallback
    const aiResponse = await generateAIAnswer(prompt.promptText, {
      aiBinding: this.env.AI,
      apiKey: this.env.OPENAI_API_KEY,
      endpoint: this.env.OPENAI_API_ENDPOINT,
      model: this.env.OPENAI_MODEL,
      environment: this.env.ENVIRONMENT,
    });

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

  async determineWinner(roomId: string): Promise<{ winner: Player | null; playerVotes: Record<string, number>; playerScores: Record<string, number> }> {
    const allPlayers = await this.db.getPlayersByRoomId(roomId);

    console.log(`Determining winner for room ${roomId}:`, {
      totalPlayers: allPlayers.length,
    });

    // Keep raw vote totals for result details, but score the game by detection and deception points.
    const playerVotes = await this.db.getPlayerVotesByRoomId(roomId);
    const playerScores = await this.db.getPlayerScoresByRoomId(roomId);
    
    // Initialize totals for players who didn't receive any votes or points.
    for (const player of allPlayers) {
      if (playerVotes[player.id] === undefined) {
        playerVotes[player.id] = 0;
      }
      if (playerScores[player.id] === undefined) {
        playerScores[player.id] = 0;
      }
    }

    console.log('Player votes:', playerVotes);
    console.log('Player scores:', playerScores);

    // Find human player with maximum score. AI is the target, not eligible to win.
    const humanPlayers = allPlayers.filter(p => !p.isAI);
    
    if (humanPlayers.length === 0) {
      console.warn('No human players found');
      return { winner: null, playerVotes, playerScores };
    }

    let winner = humanPlayers[0];
    let maxScore = playerScores[winner.id] || 0;

    for (const player of humanPlayers) {
      const score = playerScores[player.id] || 0;
      if (score > maxScore) {
        maxScore = score;
        winner = player;
      }
    }

    console.log(`Winner: ${winner.name} with ${maxScore} points`);
    return { winner, playerVotes, playerScores };
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

    // Use AI to rank and pick the most AI-like answer.
    const selectedAnswerId = await rankAnswersForVote(
      prompt.promptText,
      votableAnswers,
      {
        aiBinding: this.env.AI,
        apiKey: this.env.OPENAI_API_KEY,
        endpoint: this.env.OPENAI_API_ENDPOINT,
        model: this.env.OPENAI_MODEL,
        environment: this.env.ENVIRONMENT,
      }
    );

    return selectedAnswerId;
  }
}
