-- WeRobot D1 Database Schema
-- Cloudflare Workers - SQLite

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,
  host_player_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('lobby', 'playing', 'finished')),
  max_players INTEGER DEFAULT 6,
  ai_player_id TEXT,
  current_round_number INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+6 hours'))
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_expires ON rooms(expires_at);
CREATE INDEX IF NOT EXISTS idx_rooms_cleanup ON rooms(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_rooms_current_round ON rooms(current_round_number);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_ai BOOLEAN DEFAULT 0,
  is_eliminated BOOLEAN DEFAULT 0,
  is_host BOOLEAN DEFAULT 0,
  score INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_room_active ON players(room_id, is_eliminated);

-- Prompts table
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  is_used BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prompts_room ON prompts(room_id);
CREATE INDEX IF NOT EXISTS idx_prompts_room_used ON prompts(room_id, is_used);

-- Rounds table
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  prompt_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('answering', 'voting', 'complete')),
  eliminated_player_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id),
  FOREIGN KEY (eliminated_player_id) REFERENCES players(id)
);

CREATE INDEX IF NOT EXISTS idx_rounds_room ON rounds(room_id);
CREATE INDEX IF NOT EXISTS idx_rounds_room_number ON rounds(room_id, round_number);

-- Answers table
CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  votes_received INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE INDEX IF NOT EXISTS idx_answers_round ON answers(round_id);
CREATE INDEX IF NOT EXISTS idx_answers_player ON answers(player_id);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  voted_for_answer_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (voter_id) REFERENCES players(id),
  FOREIGN KEY (voted_for_answer_id) REFERENCES answers(id),
  UNIQUE(round_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_round ON votes(round_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_votes_answer ON votes(voted_for_answer_id);
