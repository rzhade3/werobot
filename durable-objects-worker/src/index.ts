// Durable Objects Worker - handles only WebSocket connections via service binding
import { GameRoom } from '../../backend/src/durable-objects/GameRoom';

export { GameRoom };

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle broadcast messages
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const roomCode = url.searchParams.get('roomCode');
      if (!roomCode) {
        return new Response('Missing roomCode', { status: 400 });
      }
      
      console.log(`DO Worker: Broadcast request for room ${roomCode}`);
      const durableId = env.GAME_ROOM.idFromName(roomCode);
      const stub = env.GAME_ROOM.get(durableId);
      return stub.fetch(request);
    }
    
    // Handle WebSocket upgrades
    console.log('DO Worker: WebSocket upgrade request');
    const roomCode = url.searchParams.get('roomCode');
    const playerId = url.searchParams.get('playerId');

    if (!roomCode || !playerId) {
      console.error('DO Worker: Missing params');
      return new Response('Missing roomCode or playerId', { status: 400 });
    }

    // Check for WebSocket upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      console.error('DO Worker: Not a WebSocket upgrade request');
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    console.log(`DO Worker: Getting Durable Object for room ${roomCode}`);
    const durableId = env.GAME_ROOM.idFromName(roomCode);
    const stub = env.GAME_ROOM.get(durableId);
    
    console.log('DO Worker: Forwarding to Durable Object');
    return stub.fetch(request);
  },
};
