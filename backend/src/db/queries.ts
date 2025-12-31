// Database query helpers for D1
import type { Room, Player, Prompt, Round, Answer, Vote } from '../types/models';

export class DatabaseQueries {
  constructor(private db: D1Database) {}

  // Room queries
  async createRoom(room: Omit<Room, 'createdAt' | 'updatedAt' | 'expiresAt'>): Promise<Room> {
    await this.db
      .prepare(
        `INSERT INTO rooms (id, room_code, host_player_id, status, max_players, ai_player_id, current_round_number)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(room.id, room.roomCode, room.hostPlayerId, room.status, room.maxPlayers, room.aiPlayerId || null, room.currentRoundNumber)
      .run();

    return this.getRoomById(room.id) as Promise<Room>;
  }

  async getRoomById(id: string): Promise<Room | null> {
    const result = await this.db.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first();
    return result ? this.mapRoom(result) : null;
  }

  async getRoomByCode(code: string): Promise<Room | null> {
    const result = await this.db.prepare('SELECT * FROM rooms WHERE room_code = ?').bind(code).first();
    return result ? this.mapRoom(result) : null;
  }

  async updateRoom(id: string, updates: Partial<Room>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdAt') {
        fields.push(`${this.toSnakeCase(key)} = ?`);
        values.push(value);
      }
    });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await this.db
      .prepare(`UPDATE rooms SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  async deleteRoom(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run();
  }

  // Player queries
  async createPlayer(player: Omit<Player, 'createdAt'>): Promise<Player> {
    await this.db
      .prepare(
        `INSERT INTO players (id, room_id, name, is_ai, is_eliminated, is_host, score)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        player.id,
        player.roomId,
        player.name,
        player.isAI ? 1 : 0,
        player.isEliminated ? 1 : 0,
        player.isHost ? 1 : 0,
        player.score
      )
      .run();

    return this.getPlayerById(player.id) as Promise<Player>;
  }

  async getPlayerById(id: string): Promise<Player | null> {
    const result = await this.db.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();
    return result ? this.mapPlayer(result) : null;
  }

  async getPlayersByRoomId(roomId: string): Promise<Player[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM players WHERE room_id = ? ORDER BY created_at ASC')
      .bind(roomId)
      .all();
    return results.map(this.mapPlayer);
  }

  async getActivePlayers(roomId: string): Promise<Player[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM players WHERE room_id = ? AND is_eliminated = 0 ORDER BY created_at ASC')
      .bind(roomId)
      .all();
    return results.map(this.mapPlayer);
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdAt' && key !== 'roomId') {
        const snakeKey = this.toSnakeCase(key);
        fields.push(`${snakeKey} = ?`);
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    });

    values.push(id);

    await this.db
      .prepare(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  async deletePlayer(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM players WHERE id = ?').bind(id).run();
  }

  // Prompt queries
  async createPrompt(prompt: Omit<Prompt, 'createdAt'>): Promise<Prompt> {
    await this.db
      .prepare(
        `INSERT INTO prompts (id, room_id, player_id, prompt_text, is_used)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(prompt.id, prompt.roomId, prompt.playerId, prompt.promptText, prompt.isUsed ? 1 : 0)
      .run();

    return this.getPromptById(prompt.id) as Promise<Prompt>;
  }

  async getPromptById(id: string): Promise<Prompt | null> {
    const result = await this.db.prepare('SELECT * FROM prompts WHERE id = ?').bind(id).first();
    return result ? this.mapPrompt(result) : null;
  }

  async getPromptsByRoomId(roomId: string): Promise<Prompt[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM prompts WHERE room_id = ? ORDER BY created_at ASC')
      .bind(roomId)
      .all();
    return results.map(this.mapPrompt);
  }

  async getPromptByRoundNumber(roomId: string, roundNumber: number): Promise<Prompt | null> {
    const result = await this.db
      .prepare('SELECT * FROM prompts WHERE room_id = ? AND assigned_round_number = ?')
      .bind(roomId, roundNumber)
      .first();
    return result ? this.mapPrompt(result) : null;
  }

  async assignPromptToRound(promptId: string, roundNumber: number): Promise<void> {
    await this.db
      .prepare('UPDATE prompts SET assigned_round_number = ?, is_used = 1 WHERE id = ?')
      .bind(roundNumber, promptId)
      .run();
  }

  async getUnusedPrompt(roomId: string): Promise<Prompt | null> {
    const result = await this.db
      .prepare('SELECT * FROM prompts WHERE room_id = ? AND is_used = 0 ORDER BY RANDOM() LIMIT 1')
      .bind(roomId)
      .first();
    return result ? this.mapPrompt(result) : null;
  }

  async markPromptAsUsed(id: string): Promise<void> {
    await this.db.prepare('UPDATE prompts SET is_used = 1 WHERE id = ?').bind(id).run();
  }

  // Round queries
  async createRound(round: Omit<Round, 'createdAt'>): Promise<Round> {
    await this.db
      .prepare(
        `INSERT INTO rounds (id, room_id, round_number, prompt_id, status, eliminated_player_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(round.id, round.roomId, round.roundNumber, round.promptId, round.status, round.eliminatedPlayerId || null)
      .run();

    return this.getRoundById(round.id) as Promise<Round>;
  }

  async getRoundById(id: string): Promise<Round | null> {
    const result = await this.db.prepare('SELECT * FROM rounds WHERE id = ?').bind(id).first();
    return result ? this.mapRound(result) : null;
  }

  async getCurrentRound(roomId: string, room?: Room): Promise<Round | null> {
    // If room object provided, use it (avoids 1 DB query)
    const roomData = room || await this.getRoomById(roomId);
    if (!roomData || roomData.currentRoundNumber === 0) {
      return null;
    }
    
    // Get the round by room_id and round_number
    const result = await this.db
      .prepare('SELECT * FROM rounds WHERE room_id = ? AND round_number = ?')
      .bind(roomId, roomData.currentRoundNumber)
      .first();
    return result ? this.mapRound(result) : null;
  }

  async getRoundsByRoomId(roomId: string): Promise<Round[]> {
    const results = await this.db
      .prepare('SELECT * FROM rounds WHERE room_id = ? ORDER BY round_number ASC')
      .bind(roomId)
      .all();
    return results.results.map((row) => this.mapRound(row));
  }

  async updateRound(id: string, updates: Partial<Round>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdAt' && key !== 'roomId') {
        fields.push(`${this.toSnakeCase(key)} = ?`);
        values.push(value);
      }
    });

    values.push(id);

    await this.db
      .prepare(`UPDATE rounds SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  // Answer queries
  async createAnswer(answer: Omit<Answer, 'createdAt'>): Promise<Answer> {
    await this.db
      .prepare(
        `INSERT INTO answers (id, round_id, player_id, answer_text, votes_received)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(answer.id, answer.roundId, answer.playerId, answer.answerText, answer.votesReceived)
      .run();

    return this.getAnswerById(answer.id) as Promise<Answer>;
  }

  async getAnswerById(id: string): Promise<Answer | null> {
    const result = await this.db.prepare('SELECT * FROM answers WHERE id = ?').bind(id).first();
    return result ? this.mapAnswer(result) : null;
  }

  async getAnswersByRoundId(roundId: string): Promise<Answer[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM answers WHERE round_id = ? ORDER BY created_at ASC')
      .bind(roundId)
      .all();
    return results.map(this.mapAnswer);
  }

  async incrementAnswerVotes(id: string): Promise<void> {
    await this.db.prepare('UPDATE answers SET votes_received = votes_received + 1 WHERE id = ?').bind(id).run();
  }

  // Vote queries
  async createVote(vote: Omit<Vote, 'createdAt'>): Promise<Vote> {
    await this.db
      .prepare(
        `INSERT INTO votes (id, round_id, voter_id, voted_for_answer_id)
         VALUES (?, ?, ?, ?)`
      )
      .bind(vote.id, vote.roundId, vote.voterId, vote.votedForAnswerId)
      .run();

    return this.getVoteById(vote.id) as Promise<Vote>;
  }

  async getVoteById(id: string): Promise<Vote | null> {
    const result = await this.db.prepare('SELECT * FROM votes WHERE id = ?').bind(id).first();
    return result ? this.mapVote(result) : null;
  }

  async getVotesByRoundId(roundId: string): Promise<Vote[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM votes WHERE round_id = ?')
      .bind(roundId)
      .all();
    return results.map(this.mapVote);
  }

  async getVoteByVoterAndRound(voterId: string, roundId: string): Promise<Vote | null> {
    const result = await this.db
      .prepare('SELECT * FROM votes WHERE voter_id = ? AND round_id = ?')
      .bind(voterId, roundId)
      .first();
    return result ? this.mapVote(result) : null;
  }

  // Cleanup queries
  async cleanupExpiredRooms(): Promise<number> {
    const result = await this.db
      .prepare(`DELETE FROM rooms WHERE expires_at < datetime('now') OR updated_at < datetime('now', '-6 hours')`)
      .run();
    return result.meta.changes;
  }

  async getExpiredRoomCodes(): Promise<string[]> {
    const { results } = await this.db
      .prepare(
        `SELECT room_code FROM rooms 
         WHERE expires_at < datetime('now') OR updated_at < datetime('now', '-6 hours')`
      )
      .all();
    return results.map((r: any) => r.room_code);
  }

  // Aggregated vote query - O(1) instead of O(n*m)
  async getPlayerVotesByRoomId(roomId: string): Promise<Record<string, number>> {
    const { results } = await this.db
      .prepare(
        `SELECT 
          answers.player_id, 
          SUM(answers.votes_received) as total_votes
         FROM rounds
         INNER JOIN answers ON rounds.id = answers.round_id
         WHERE rounds.room_id = ?
         GROUP BY answers.player_id`
      )
      .bind(roomId)
      .all();
    
    const playerVotes: Record<string, number> = {};
    results.forEach((row: any) => {
      playerVotes[row.player_id] = row.total_votes || 0;
    });
    
    return playerVotes;
  }

  // Helper mapping functions
  private mapRoom(row: any): Room {
    return {
      id: row.id,
      roomCode: row.room_code,
      hostPlayerId: row.host_player_id,
      status: row.status,
      maxPlayers: row.max_players,
      aiPlayerId: row.ai_player_id,
      currentRoundNumber: row.current_round_number || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    };
  }

  private mapPlayer(row: any): Player {
    return {
      id: row.id,
      roomId: row.room_id,
      name: row.name,
      isAI: Boolean(row.is_ai),
      isEliminated: Boolean(row.is_eliminated),
      isHost: Boolean(row.is_host),
      score: row.score,
      createdAt: row.created_at,
    };
  }

  private mapPrompt(row: any): Prompt {
    return {
      id: row.id,
      roomId: row.room_id,
      playerId: row.player_id,
      promptText: row.prompt_text,
      isUsed: Boolean(row.is_used),
      assignedRoundNumber: row.assigned_round_number,
      createdAt: row.created_at,
    };
  }

  private mapRound(row: any): Round {
    return {
      id: row.id,
      roomId: row.room_id,
      roundNumber: row.round_number,
      promptId: row.prompt_id,
      status: row.status,
      eliminatedPlayerId: row.eliminated_player_id,
      createdAt: row.created_at,
    };
  }

  private mapAnswer(row: any): Answer {
    return {
      id: row.id,
      roundId: row.round_id,
      playerId: row.player_id,
      answerText: row.answer_text,
      votesReceived: row.votes_received,
      createdAt: row.created_at,
    };
  }

  private mapVote(row: any): Vote {
    return {
      id: row.id,
      roundId: row.round_id,
      voterId: row.voter_id,
      votedForAnswerId: row.voted_for_answer_id,
      createdAt: row.created_at,
    };
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
