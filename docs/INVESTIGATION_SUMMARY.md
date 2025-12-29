# AI Double Submission - Executive Summary

## Problem
The AI bot sometimes submits two answers to the same prompt during a game round.

## Root Cause
**Race Condition** in the answer submission endpoint (`backend/src/router.ts` lines 474-490).

When two players submit answers within ~100-500ms of each other:
1. Request A checks if AI answered → No → triggers AI answer generation
2. Request B checks if AI answered → No (A hasn't finished) → triggers AI answer generation AGAIN
3. Both requests save AI answers to the database
4. Result: Two AI answers for the same round

## Why It Happens

### The Code
```typescript
// Line 474: Fetch answers (snapshot at this moment)
const answers = await db.getAnswersByRoundId(round.id);

// Line 475-477: Check human hasn't already answered (protected)
if (answers.some((a) => a.playerId === session.playerId)) {
  return c.json({ success: false, error: 'You already submitted an answer' }, 400);
}

// Line 479: Save human answer
await gameService.submitAnswer(round.id, session.playerId, body.answerText);

// Line 484-490: Check if AI needs to answer (NOT protected!)
if (room.aiPlayerId) {
  const aiAnswered = answers.some((a) => a.playerId === room.aiPlayerId);
  // ^^^ Uses STALE data from line 474 - another request might have added AI answer since then!
  if (!aiAnswered) {
    await gameService.generateAIAnswer(round.id, room.aiPlayerId);
  }
}
```

### The Database
```sql
-- answers table (NO protection against duplicates)
CREATE TABLE answers (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  -- MISSING: UNIQUE(round_id, player_id)
);

-- votes table (HAS protection)
CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  UNIQUE(round_id, voter_id)  -- ✅ Prevents duplicate votes!
);
```

**Key Insight**: Votes are protected by a UNIQUE constraint, but answers are not.

## Quick Fix (Recommended)

Add the missing UNIQUE constraint to prevent duplicates at the database level:

```sql
-- Migration: 002_add_unique_answer_constraint.sql
CREATE UNIQUE INDEX idx_answers_unique_round_player 
ON answers(round_id, player_id);
```

Then handle the error gracefully in the code:

```typescript
try {
  await gameService.generateAIAnswer(round.id, room.aiPlayerId);
} catch (error) {
  // If constraint violation (AI already answered), that's fine - ignore it
  if (error.message?.includes('UNIQUE constraint')) {
    console.log('AI already answered (race condition prevented by DB)');
  } else {
    throw error;
  }
}
```

## Why This Fix Works

1. **Database guarantees uniqueness** - impossible to insert duplicate (round_id, player_id) combination
2. **First request wins** - whichever reaches the database first succeeds, second fails gracefully
3. **Matches existing pattern** - same approach already used for votes table
4. **Minimal code changes** - just error handling, no logic changes
5. **Zero-downtime** - can be applied without breaking existing functionality

## Impact
- **Severity**: Medium (breaks game rules, confusing for players)
- **Frequency**: Intermittent (requires precise timing)
- **More likely with**: 
  - More players (more concurrent submissions)
  - Slower database (larger race window)
  - Fast network (tighter timing)

## Additional Notes

1. **Voting has the same race condition** but is already protected by the UNIQUE constraint
2. **The race still wastes OpenAI API calls** - both requests call the API even though only one answer is saved
3. **Re-fetching answers before the AI check** would reduce the race window further
4. **Adding a check inside generateAIAnswer** provides defense-in-depth

## See Also
- Full investigation: `docs/INVESTIGATION_DOUBLE_SUBMISSION.md`
- Database schema: `backend/src/db/schema.sql`
- Answer submission: `backend/src/router.ts` lines 455-499
