-- Migration 006: Remove password_hash column from players table
-- Password hashing is unnecessary since session tokens provide sufficient authentication

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- Create new players table without password_hash
CREATE TABLE IF NOT EXISTS players_new (
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

-- Copy data from old table to new table
INSERT INTO players_new (id, room_id, name, is_ai, is_eliminated, is_host, score, created_at)
SELECT id, room_id, name, is_ai, is_eliminated, is_host, score, created_at
FROM players;

-- Drop old table
DROP TABLE players;

-- Rename new table to original name
ALTER TABLE players_new RENAME TO players;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_room_active ON players(room_id, is_eliminated);
