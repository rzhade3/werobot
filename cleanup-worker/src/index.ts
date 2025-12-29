// Cleanup Worker - Runs hourly to clean up expired rooms

interface Env {
  DB: D1Database;
  DURABLE_OBJECTS_WORKER: Fetcher;
  ROOM_TTL_HOURS: string;
  CLEANUP_BATCH_SIZE: string;
}

export default {
  // Handle scheduled cron triggers (runs every 2 hours)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🧹 Cleanup worker triggered at:', new Date().toISOString());
    
    try {
      const result = await performScheduledCleanup(env);
      console.log(`✅ Cleanup complete: ${result.deletedRooms} rooms deleted`);
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    }
  },
};

// Cleanup logic
async function performScheduledCleanup(env: Env): Promise<{
  deletedRooms: number;
  timestamp: string;
}> {
  const ttlHours = parseInt(env.ROOM_TTL_HOURS || '6', 10);
  
  try {
    // 1. Get list of expired room codes
    const expiredRoomCodes = await getExpiredRoomCodes(env.DB, ttlHours);

    console.log(`Found ${expiredRoomCodes.length} expired rooms to cleanup`);

    // 2. Notify Durable Objects to cleanup (close WebSockets, clear state)
    if (env.DURABLE_OBJECTS_WORKER) {
      for (const roomCode of expiredRoomCodes) {
        try {
          // Send cleanup signal via service binding
          await env.DURABLE_OBJECTS_WORKER.fetch(
            `https://internal/cleanup?roomCode=${roomCode}`,
            { method: 'POST' }
          );
          console.log(`Notified DO for cleanup: ${roomCode}`);
        } catch (err) {
          console.error(`Failed to cleanup Durable Object for room ${roomCode}:`, err);
          // Continue with database cleanup even if DO cleanup fails
        }
      }
    }

    // 3. Delete from database (CASCADE will handle related data)
    const deletedCount = await cleanupExpiredRooms(env.DB, ttlHours);

    console.log(`Cleanup complete: ${deletedCount} rooms deleted`);

    return {
      deletedRooms: deletedCount,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Cleanup error:', error);
    throw error;
  }
}

async function getExpiredRoomCodes(db: D1Database, ttlHours: number): Promise<string[]> {
  const result = await db
    .prepare(`
      SELECT room_code 
      FROM rooms 
      WHERE datetime(expires_at) < datetime('now', '-' || ? || ' hours')
    `)
    .bind(ttlHours)
    .all();

  return result.results.map((row: any) => row.room_code);
}

async function cleanupExpiredRooms(db: D1Database, ttlHours: number): Promise<number> {
  const result = await db
    .prepare(`
      DELETE FROM rooms 
      WHERE datetime(expires_at) < datetime('now', '-' || ? || ' hours')
    `)
    .bind(ttlHours)
    .run();

  return result.meta.changes || 0;
}
