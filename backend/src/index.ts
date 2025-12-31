// Main Cloudflare Worker entry point

import type { Env } from './types/models';
import app from './router';
import { performScheduledCleanup } from './utils/cleanup';
import { GameRoom } from './durable-objects/GameRoom';

// Export Durable Object
export { GameRoom };

export default {
  // Handle HTTP requests with Hono
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket connections
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocketUpgrade(request, env);
    }

    // Handle regular HTTP requests with Hono
    return app.fetch(request, env, ctx);
  },

  // Handle scheduled cron triggers (hourly cleanup)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Running scheduled cleanup...');
    ctx.waitUntil(performScheduledCleanup(env));
  },
};

// WebSocket upgrade handler
async function handleWebSocketUpgrade(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('roomCode');
  const playerId = url.searchParams.get('playerId');

  if (!roomCode || !playerId) {
    return new Response('Missing roomCode or playerId', { status: 400 });
  }

  // Check if GAME_ROOM binding exists (direct Workers deployment)
  if (!env.GAME_ROOM) {
    return new Response('Durable Objects not configured', { status: 500 });
  }

  // Get or create Durable Object for this room
  const durableId = env.GAME_ROOM.idFromName(roomCode);
  const stub = env.GAME_ROOM.get(durableId);

  // Forward the WebSocket upgrade request to the Durable Object
  return stub.fetch(request);
}
