# Quick Reference: Detecting and Diagnosing Double Submission

## Check for Existing Duplicates

### Find Duplicate Answers in Database

```sql
-- Find any duplicate answers (same player, same round, multiple answers)
SELECT 
  a.round_id,
  a.player_id,
  p.name as player_name,
  p.is_ai,
  COUNT(*) as answer_count,
  GROUP_CONCAT(a.id) as answer_ids,
  GROUP_CONCAT(SUBSTR(a.answer_text, 1, 50), ' | ') as answer_previews,
  MIN(a.created_at) as first_answer_time,
  MAX(a.created_at) as last_answer_time
FROM answers a
JOIN players p ON a.player_id = p.id
GROUP BY a.round_id, a.player_id
HAVING answer_count > 1
ORDER BY last_answer_time DESC;
```

Expected output if bug exists:
```
round_id    | player_id | player_name | is_ai | answer_count | answer_ids       | answer_previews        | first_answer_time    | last_answer_time
------------|-----------|-------------|-------|--------------|------------------|------------------------|----------------------|---------------------
round-abc   | ai-xyz    | AI Player   | 1     | 2            | ans1,ans2        | "I think..." | "I b..." | 2025-01-15 10:00:00 | 2025-01-15 10:00:01
```

### Count Total Duplicates

```sql
-- How many duplicates exist overall?
SELECT 
  COUNT(*) as total_answers,
  COUNT(DISTINCT round_id || '-' || player_id) as unique_combinations,
  COUNT(*) - COUNT(DISTINCT round_id || '-' || player_id) as duplicate_count
FROM answers;
```

Expected output with no duplicates:
```
total_answers | unique_combinations | duplicate_count
--------------|---------------------|----------------
150           | 150                 | 0
```

Expected output WITH duplicates:
```
total_answers | unique_combinations | duplicate_count
--------------|---------------------|----------------
152           | 150                 | 2
```

### Find Duplicate Timing Patterns

```sql
-- Analyze timing between duplicate answers (helps confirm race condition)
WITH duplicate_answers AS (
  SELECT 
    round_id,
    player_id,
    id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY round_id, player_id ORDER BY created_at) as answer_number
  FROM answers
)
SELECT 
  d1.round_id,
  d1.player_id,
  d1.created_at as first_answer_time,
  d2.created_at as second_answer_time,
  CAST((julianday(d2.created_at) - julianday(d1.created_at)) * 86400 AS INTEGER) as seconds_between
FROM duplicate_answers d1
JOIN duplicate_answers d2 
  ON d1.round_id = d2.round_id 
  AND d1.player_id = d2.player_id 
  AND d1.answer_number = 1 
  AND d2.answer_number = 2
ORDER BY seconds_between ASC;
```

This shows how quickly duplicates were created (should be under 1 second for race conditions).

## Check for Suspicious Patterns

### AI Answers Per Round

```sql
-- How many times has the AI answered in each round?
SELECT 
  r.id as round_id,
  r.room_id,
  r.round_number,
  p.name as ai_player_name,
  COUNT(a.id) as ai_answer_count
FROM rounds r
JOIN rooms rm ON r.room_id = rm.id
LEFT JOIN players p ON rm.ai_player_id = p.id
LEFT JOIN answers a ON r.id = a.round_id AND a.player_id = p.id
WHERE p.is_ai = 1
GROUP BY r.id, r.room_id, r.round_number, p.name
HAVING ai_answer_count > 1
ORDER BY ai_answer_count DESC, r.round_number DESC;
```

### Rounds with Too Many Answers

```sql
-- Find rounds where answer count doesn't match player count
SELECT 
  r.id as round_id,
  r.room_id,
  r.round_number,
  COUNT(DISTINCT p.id) as player_count,
  COUNT(a.id) as answer_count,
  COUNT(a.id) - COUNT(DISTINCT p.id) as extra_answers
FROM rounds r
JOIN rooms rm ON r.room_id = rm.id
JOIN players p ON p.room_id = rm.id AND p.is_eliminated = 0
LEFT JOIN answers a ON r.id = a.round_id
GROUP BY r.id, r.room_id, r.round_number
HAVING extra_answers > 0
ORDER BY extra_answers DESC;
```

## Monitoring Queries

### Recent Duplicates (Last 24 Hours)

```sql
SELECT 
  a.round_id,
  a.player_id,
  p.name,
  COUNT(*) as answer_count,
  MAX(a.created_at) as latest_duplicate
FROM answers a
JOIN players p ON a.player_id = p.id
WHERE a.created_at >= datetime('now', '-1 day')
GROUP BY a.round_id, a.player_id, p.name
HAVING answer_count > 1
ORDER BY latest_duplicate DESC;
```

### Active Rounds with Potential Issues

```sql
-- Check currently playing rounds for duplicate answers
SELECT 
  r.id as round_id,
  r.room_id,
  rm.room_code,
  r.round_number,
  r.status,
  COUNT(DISTINCT a.player_id) as unique_players_answered,
  COUNT(a.id) as total_answers,
  COUNT(a.id) - COUNT(DISTINCT a.player_id) as duplicate_count
FROM rounds r
JOIN rooms rm ON r.room_id = rm.id
LEFT JOIN answers a ON r.id = a.round_id
WHERE rm.status IN ('playing', 'lobby')
  AND r.status IN ('answering', 'voting')
GROUP BY r.id, r.room_id, rm.room_code, r.round_number, r.status
HAVING duplicate_count > 0
ORDER BY r.created_at DESC;
```

## Clean Up Duplicates (Manual Fix)

⚠️ **WARNING**: Only run these if you understand the consequences!

### Identify Duplicates to Remove

```sql
-- List duplicates with which ones would be kept vs removed
WITH ranked_answers AS (
  SELECT 
    id,
    round_id,
    player_id,
    answer_text,
    created_at,
    votes_received,
    ROW_NUMBER() OVER (
      PARTITION BY round_id, player_id 
      ORDER BY created_at ASC
    ) as answer_rank
  FROM answers
)
SELECT 
  id,
  round_id,
  player_id,
  answer_text,
  created_at,
  votes_received,
  CASE 
    WHEN answer_rank = 1 THEN '✓ KEEP (first)'
    ELSE '✗ DELETE (duplicate)'
  END as action
FROM ranked_answers
WHERE round_id IN (
  SELECT round_id 
  FROM ranked_answers 
  GROUP BY round_id, player_id 
  HAVING COUNT(*) > 1
)
ORDER BY round_id, player_id, answer_rank;
```

### Delete Duplicate Answers (Keep First)

```sql
-- Delete duplicate answers, keeping the first one created
DELETE FROM answers
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY round_id, player_id 
        ORDER BY created_at ASC
      ) as rn
    FROM answers
  )
  WHERE rn > 1
);
```

### Verify Cleanup

```sql
-- After cleanup, verify no duplicates remain
SELECT 
  'Duplicates remaining:' as check_name,
  COUNT(*) - COUNT(DISTINCT round_id || '-' || player_id) as count
FROM answers
UNION ALL
SELECT 
  'Total answers:' as check_name,
  COUNT(*) as count
FROM answers;
```

## Application Logs to Monitor

Look for these patterns in application logs:

```
# Multiple AI answer attempts in quick succession
[AI Answer] Attempting to generate answer for round abc123, AI ai-xyz
[AI Answer] Attempting to generate answer for round abc123, AI ai-xyz  ← DUPLICATE!

# OpenAI API calls for same round
Calling OpenAI API for round abc123...
Calling OpenAI API for round abc123...  ← DUPLICATE CALL!

# Constraint violation errors (after fix is applied)
Error creating vote: UNIQUE constraint failed: votes.round_id, votes.voter_id
```

## Prevention Check

After implementing the fix, verify the constraint is in place:

```sql
-- List all indexes on answers table
SELECT 
  name,
  tbl_name,
  sql
FROM sqlite_master 
WHERE type = 'index' 
  AND tbl_name = 'answers'
ORDER BY name;
```

Should include:
```
name                              | tbl_name | sql
----------------------------------|----------|----------------------------------
idx_answers_unique_round_player   | answers  | CREATE UNIQUE INDEX idx_answers_unique_round_player ON answers(round_id, player_id)
```
