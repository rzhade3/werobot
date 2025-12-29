-- Migration: Add password_hash column to players table
-- WARNING: This will reset all player data. Run only in development.

-- Add password_hash column to players table
ALTER TABLE players ADD COLUMN password_hash TEXT;

-- For existing deployments: This is a breaking change.
-- All existing players will need to rejoin games.
-- Consider clearing all data if this is run in production:
-- DELETE FROM players;
-- DELETE FROM rooms;
