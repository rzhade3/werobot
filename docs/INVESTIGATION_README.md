# Investigation Complete: AI Double Submission Issue

## Summary

The AI bot sometimes submits two answers to the same prompt due to a **race condition** when multiple human players submit answers nearly simultaneously.

## Root Cause

**Technical Issue**: Race condition in `backend/src/router.ts` lines 474-490

When Player A and Player B both submit answers within ~100-500ms:
1. Both requests check if AI has answered (using potentially stale data)
2. Both see "no AI answer yet"
3. Both trigger AI answer generation
4. Two AI answers get saved to the database

**Database Issue**: No UNIQUE constraint on `answers(round_id, player_id)` to prevent duplicates

## Quick Fix

Add the missing constraint (same as votes table already has):

```sql
CREATE UNIQUE INDEX idx_answers_unique_round_player ON answers(round_id, player_id);
```

## Documentation

### 📋 [Investigation Summary](./INVESTIGATION_SUMMARY.md)
Quick 2-page overview for non-technical stakeholders

### 📊 [Full Investigation Report](./INVESTIGATION_DOUBLE_SUBMISSION.md)
Complete 350-line technical analysis including:
- Architecture overview and flow diagrams
- Detailed root cause analysis with code examples
- Visual race condition timeline
- Five proposed solutions with pros/cons
- Testing strategies and recommendations

### 🔍 [Diagnostic Queries](./INVESTIGATION_QUERIES.md)
SQL queries and tools for:
- Detecting existing duplicates
- Monitoring for new occurrences
- Cleaning up duplicates (if needed)
- Verifying fixes

## Recommendations

### Immediate Action (30 minutes)
1. Run diagnostic queries to check for existing duplicates
2. Review application logs for patterns
3. Add database UNIQUE constraint

### Short-term Fix (2-4 hours)
1. Implement database constraint (Solution #1)
2. Add error handling for constraint violations
3. Re-fetch answers before AI check (Solution #2)
4. Add defensive check in generateAIAnswer() (Solution #4)
5. Test with concurrent requests

### Long-term Optimization (1-2 days)
1. Consider atomic flag approach (Solution #3)
2. Add comprehensive monitoring
3. Implement integration tests
4. Apply same fix to voting endpoint (prevent API waste)

## Why This Matters

- **Gameplay Impact**: Breaks core game mechanic (one answer per player)
- **User Experience**: Confusing when AI appears twice in voting
- **Data Integrity**: Corrupts game state and results
- **API Costs**: Wastes OpenAI API quota (multiple calls for same answer)

## Questions?

Review the full documentation above or contact the development team.

---

**Investigation completed**: 2025-12-29  
**Status**: Ready for implementation  
**Priority**: Medium-High (intermittent but impacts game integrity)
