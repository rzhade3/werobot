# Implementation Checklist: Fix AI Double Submission

Use this checklist when implementing the fix for the AI double submission issue.

## Prerequisites

- [ ] Read `INVESTIGATION_SUMMARY.md` for overview
- [ ] Read `INVESTIGATION_DOUBLE_SUBMISSION.md` for technical details
- [ ] Review current codebase: `backend/src/router.ts` lines 455-499
- [ ] Review database schema: `backend/src/db/schema.sql`
- [ ] Backup production database (if applying to production)

## Phase 1: Detect Existing Issues (15 minutes)

- [ ] Run diagnostic queries from `INVESTIGATION_QUERIES.md`
- [ ] Check for existing duplicate answers:
  ```sql
  SELECT round_id, player_id, COUNT(*) 
  FROM answers 
  GROUP BY round_id, player_id 
  HAVING COUNT(*) > 1;
  ```
- [ ] Document findings (how many duplicates? when did they occur?)
- [ ] Take database snapshot/backup before changes

## Phase 2: Database Migration (30 minutes)

### Create Migration File

- [ ] Create `backend/src/db/migrations/002_add_unique_answer_constraint.sql`
- [ ] Add migration SQL:
  ```sql
  -- Add UNIQUE constraint to prevent duplicate answers
  -- This matches the existing pattern in the votes table
  CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_unique_round_player 
  ON answers(round_id, player_id);
  ```

### Test Migration Locally

- [ ] Apply migration to local development database
- [ ] Verify constraint exists:
  ```sql
  SELECT name, sql FROM sqlite_master 
  WHERE type='index' AND tbl_name='answers';
  ```
- [ ] Test constraint works (try to insert duplicate):
  ```sql
  INSERT INTO answers (id, round_id, player_id, answer_text) 
  VALUES ('test1', 'round1', 'player1', 'test');
  
  INSERT INTO answers (id, round_id, player_id, answer_text) 
  VALUES ('test2', 'round1', 'player1', 'test2');
  -- Should fail with: UNIQUE constraint failed
  ```
- [ ] Clean up test data:
  ```sql
  DELETE FROM answers WHERE id IN ('test1', 'test2');
  ```

### Apply to Staging

- [ ] Apply migration to staging environment
- [ ] Run post-migration verification queries
- [ ] Monitor staging for errors
- [ ] Test game flow end-to-end on staging

## Phase 3: Code Changes (1 hour)

### Solution #2: Re-fetch Answers Before AI Check

**File**: `backend/src/router.ts`

- [ ] Locate answer submission endpoint (line 455)
- [ ] Find AI answer check section (lines 484-490)
- [ ] Replace with:
  ```typescript
  // Check if AI needs to answer - FETCH FRESH DATA to reduce race window
  if (room.aiPlayerId) {
    const updatedAnswers = await db.getAnswersByRoundId(round.id);
    const aiAnswered = updatedAnswers.some((a) => a.playerId === room.aiPlayerId);
    if (!aiAnswered) {
      try {
        await gameService.generateAIAnswer(round.id, room.aiPlayerId);
      } catch (error) {
        // Database constraint will prevent duplicates if race occurs
        if (error.message?.includes('UNIQUE constraint failed')) {
          console.log('AI already answered (duplicate prevented by database constraint)');
        } else {
          console.error('Error generating AI answer:', error);
          throw error;
        }
      }
    }
  }
  ```

### Solution #4: Defensive Check in generateAIAnswer

**File**: `backend/src/services/game.service.ts`

- [ ] Locate `generateAIAnswer` method (line 61)
- [ ] Add duplicate check at the start:
  ```typescript
  async generateAIAnswer(roundId: string, aiPlayerId: string): Promise<Answer> {
    // Double-check AI hasn't already answered (defensive programming)
    const existingAnswers = await this.db.getAnswersByRoundId(roundId);
    const existingAIAnswer = existingAnswers.find(a => a.playerId === aiPlayerId);
    if (existingAIAnswer) {
      console.log(`AI already answered round ${roundId}, skipping duplicate`);
      return existingAIAnswer;
    }
    
    // Get round and prompt
    const round = await this.db.getRoundById(roundId);
    // ... rest of existing code
  ```

### Apply Same Fix to Voting (Bonus)

**File**: `backend/src/router.ts`

- [ ] Locate voting endpoint (line 543)
- [ ] Find AI voting check (lines 586-597)
- [ ] Apply similar try-catch for constraint handling:
  ```typescript
  // Check if AI needs to vote (if AI hasn't voted yet)
  if (room.aiPlayerId) {
    const aiVote = await db.getVoteByVoterAndRound(room.aiPlayerId, round.id);
    if (!aiVote) {
      try {
        const selectedAnswerId = await gameService.generateAIVote(round.id, room.aiPlayerId);
        if (selectedAnswerId) {
          const aiVoteRecord = createVote(round.id, room.aiPlayerId, selectedAnswerId);
          await db.createVote(aiVoteRecord);
          await db.incrementAnswerVotes(selectedAnswerId);
        }
      } catch (error) {
        // Vote constraint already exists, just handle gracefully
        if (error.message?.includes('UNIQUE constraint failed')) {
          console.log('AI already voted (duplicate prevented by database constraint)');
        } else {
          console.error('Error generating AI vote:', error);
          throw error;
        }
      }
    }
  }
  ```

### Add Logging

- [ ] Add logging to track AI answer/vote generation:
  ```typescript
  console.log(`[AI] Attempting to generate answer for round ${roundId}`);
  // ... generation code
  console.log(`[AI] Successfully generated answer for round ${roundId}`);
  ```

## Phase 4: Testing (1-2 hours)

### Unit Tests

- [ ] Create test: `backend/src/services/game.service.test.ts`
- [ ] Add test for concurrent answer generation:
  ```typescript
  describe('AI Answer Generation - Race Condition', () => {
    it('should not create duplicate answers', async () => {
      const roundId = 'test-round';
      const aiPlayerId = 'ai-player';
      
      // Simulate race condition
      const promises = [
        gameService.generateAIAnswer(roundId, aiPlayerId),
        gameService.generateAIAnswer(roundId, aiPlayerId),
        gameService.generateAIAnswer(roundId, aiPlayerId)
      ];
      
      await Promise.allSettled(promises);
      
      const answers = await db.getAnswersByRoundId(roundId);
      const aiAnswers = answers.filter(a => a.playerId === aiPlayerId);
      
      expect(aiAnswers.length).toBe(1);
    });
  });
  ```
- [ ] Run unit tests: `npm test`

### Integration Tests

- [ ] Test concurrent submissions locally
- [ ] Use tool like `wrk` or `ab` to send concurrent requests
- [ ] Verify only one AI answer per round
- [ ] Check logs for constraint violations (should be handled gracefully)

### Manual Testing Scenarios

- [ ] **Scenario 1**: Single player submits
  - [ ] AI should answer once
  - [ ] No errors in logs
  
- [ ] **Scenario 2**: Two players submit simultaneously
  - [ ] AI should answer once
  - [ ] May see "duplicate prevented" log (expected)
  
- [ ] **Scenario 3**: Three players submit in quick succession
  - [ ] AI should answer once
  - [ ] Game continues normally
  
- [ ] **Scenario 4**: Full game playthrough
  - [ ] Complete a full game
  - [ ] Check database for any duplicates
  - [ ] Verify winner calculation is correct

## Phase 5: Staging Validation (1 hour)

- [ ] Deploy code changes to staging
- [ ] Run full test suite on staging
- [ ] Play through complete game on staging
- [ ] Check staging database for duplicates
- [ ] Monitor staging logs for 24 hours
- [ ] Verify no unexpected errors

## Phase 6: Production Deployment

### Pre-deployment

- [ ] Review all changes one final time
- [ ] Ensure database migration is ready
- [ ] Prepare rollback plan
- [ ] Schedule deployment (low-traffic time if possible)
- [ ] Notify team of deployment

### Deployment Steps

- [ ] Apply database migration to production
- [ ] Verify migration success
- [ ] Deploy code changes
- [ ] Verify deployment success
- [ ] Monitor error logs for 15 minutes
- [ ] Run smoke tests

### Post-deployment

- [ ] Monitor production logs for 24 hours
- [ ] Run diagnostic queries daily for 1 week:
  ```sql
  -- Check for new duplicates
  SELECT round_id, player_id, COUNT(*) 
  FROM answers 
  WHERE created_at >= datetime('now', '-1 day')
  GROUP BY round_id, player_id 
  HAVING COUNT(*) > 1;
  ```
- [ ] Monitor OpenAI API usage (should decrease slightly)
- [ ] Collect user feedback
- [ ] Check error rate metrics

## Phase 7: Cleanup (Optional)

### Remove Existing Duplicates

If duplicates exist in production:

- [ ] Analyze impact (which rounds? when?)
- [ ] Decide: clean up or leave as-is?
- [ ] If cleaning up:
  ```sql
  -- Delete duplicate answers (keep first created)
  DELETE FROM answers
  WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY round_id, player_id 
        ORDER BY created_at ASC
      ) as rn
      FROM answers
    )
    WHERE rn > 1
  );
  ```
- [ ] Verify cleanup:
  ```sql
  SELECT COUNT(*) - COUNT(DISTINCT round_id || player_id) 
  FROM answers;
  -- Should return 0
  ```

## Phase 8: Documentation

- [ ] Update API documentation if error responses changed
- [ ] Document the fix in CHANGELOG
- [ ] Update architecture docs if needed
- [ ] Close this investigation issue
- [ ] Create follow-up issues for any remaining work

## Rollback Plan

If issues occur after deployment:

1. **Code rollback**:
   - [ ] Revert code changes
   - [ ] Redeploy previous version
   - [ ] Monitor for stability

2. **Database rollback** (NOT recommended - constraint is beneficial):
   - [ ] Only if constraint causes critical issues
   - [ ] Drop the constraint:
     ```sql
     DROP INDEX idx_answers_unique_round_player;
     ```
   - [ ] Monitor and plan better fix

## Success Criteria

- [ ] No duplicate AI answers created after fix
- [ ] No new errors in production logs
- [ ] Game flow works normally
- [ ] Response times unchanged (within 10%)
- [ ] OpenAI API usage normal or slightly reduced
- [ ] No user complaints about AI behavior

## Timeline Estimate

- Phase 1 (Detect): 15 minutes
- Phase 2 (Database): 30 minutes
- Phase 3 (Code): 1 hour
- Phase 4 (Testing): 1-2 hours
- Phase 5 (Staging): 1 hour
- Phase 6 (Production): 30 minutes + monitoring
- Phase 7 (Cleanup): 30 minutes (optional)
- Phase 8 (Documentation): 30 minutes

**Total**: 4-6 hours of active work + ongoing monitoring

## Notes

- The database constraint is the critical fix - code changes are defense-in-depth
- Constraint violation errors are expected during race conditions (handled gracefully)
- Monitor OpenAI API usage - should see slight decrease in duplicate calls
- This fix can be applied to production with minimal risk (constraint prevents data corruption)

## Questions or Issues?

Refer back to:
- `INVESTIGATION_SUMMARY.md` for overview
- `INVESTIGATION_DOUBLE_SUBMISSION.md` for details  
- `INVESTIGATION_QUERIES.md` for SQL queries
- `INVESTIGATION_VISUAL.md` for diagrams
