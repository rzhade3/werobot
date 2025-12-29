-- Add unique constraint to prevent duplicate answers from same player in same round
-- First, remove any existing duplicates (keep the earliest one by created_at)

-- Delete votes that reference duplicate answers we're about to remove
DELETE FROM votes
WHERE voted_for_answer_id IN (
  SELECT id FROM answers
  WHERE id NOT IN (
    SELECT MIN(id)
    FROM answers
    GROUP BY round_id, player_id
  )
);

-- Now delete the duplicate answers
DELETE FROM answers
WHERE id NOT IN (
  SELECT MIN(id)
  FROM answers
  GROUP BY round_id, player_id
);

-- Finally, create the unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_round_player ON answers(round_id, player_id);
