-- Add current_round_number column to rooms table
-- This allows quick lookups of which round a room is currently on
-- and easy incrementing without foreign key maintenance

ALTER TABLE rooms ADD COLUMN current_round_number INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_rooms_current_round ON rooms(current_round_number);
