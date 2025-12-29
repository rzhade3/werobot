// Data cleanup utilities

import type { Env } from '../types/models';
import { DatabaseQueries } from '../db/queries';

export async function performScheduledCleanup(env: Env): Promise<{
  deletedRooms: number;
  timestamp: string;
}> {
  const db = new DatabaseQueries(env.DB);

  try {
    // 1. Get list of expired room codes
    const expiredRoomCodes = await db.getExpiredRoomCodes();

    console.log(`Found ${expiredRoomCodes.length} expired rooms to cleanup`);

    // 2. Notify Durable Objects to cleanup (close WebSockets, clear state)
    for (const roomCode of expiredRoomCodes) {
      try {
        const durableId = env.GAME_ROOM.idFromName(roomCode);
        const stub = env.GAME_ROOM.get(durableId);

        // Send cleanup signal to Durable Object
        await stub.fetch('https://internal/cleanup', {
          method: 'POST',
        });
      } catch (err) {
        console.error(`Failed to cleanup Durable Object for room ${roomCode}:`, err);
        // Continue with database cleanup even if DO cleanup fails
      }
    }

    // 3. Delete from database (CASCADE will handle related data)
    const deletedCount = await db.cleanupExpiredRooms();

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

export async function getCleanupMetrics(env: Env): Promise<{
  totalRooms: number;
  expiredRooms: number;
  finishedRooms: number;
  avgAgeHours: number;
}> {
  const stats = await env.DB.prepare(`
    SELECT 
      COUNT(*) as total_rooms,
      COUNT(CASE WHEN expires_at < datetime('now') THEN 1 END) as expired_rooms,
      COUNT(CASE WHEN status = 'finished' THEN 1 END) as finished_rooms,
      AVG(julianday('now') - julianday(created_at)) * 24 as avg_age_hours
    FROM rooms
  `).first();

  return {
    totalRooms: (stats as any).total_rooms || 0,
    expiredRooms: (stats as any).expired_rooms || 0,
    finishedRooms: (stats as any).finished_rooms || 0,
    avgAgeHours: (stats as any).avg_age_hours || 0,
  };
}
