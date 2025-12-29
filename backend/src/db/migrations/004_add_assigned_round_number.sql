-- Add assigned_round_number to prompts table for efficient round initialization
-- This allows us to pre-assign prompts to rounds at game start

-- Add the new column (nullable for existing rows)
ALTER TABLE prompts ADD COLUMN assigned_round_number INTEGER;

-- Create index for efficient lookups by round number
CREATE INDEX IF NOT EXISTS idx_prompts_room_round ON prompts(room_id, assigned_round_number);
