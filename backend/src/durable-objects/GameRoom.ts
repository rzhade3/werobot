// GameRoom Durable Object - Handles WebSocket connections and real-time game state

import type { Env, WSMessage } from '../types/models';

export class GameRoom {
  private state: DurableObjectState;
  private env: Env;
  private roomCode: string;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.roomCode = '';
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    console.log(`GameRoom fetch called: ${url.pathname}`);

    // Handle cleanup signal from Worker
    if (url.pathname === '/cleanup' && request.method === 'POST') {
      return this.handleCleanup();
    }

    // Handle broadcast messages from Worker
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const body = await request.json() as { type: string; data?: any };
      console.log(`Broadcast request received for room ${this.roomCode}:`, body);
      this.broadcast(body.type, body.data);
      return new Response('OK', { status: 200 });
    }

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomCode = url.searchParams.get('roomCode');
    const playerId = url.searchParams.get('playerId');

    if (!roomCode || !playerId) {
      return new Response('Missing roomCode or playerId', { status: 400 });
    }

    this.roomCode = roomCode;

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection with metadata
    this.state.acceptWebSocket(server, [playerId, roomCode]);

    console.log(`Player ${playerId} connected to room ${roomCode}`);

    // Set up alarm for 6-hour expiration (if not already set)
    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm) {
      const sixHours = 6 * 60 * 60 * 1000;
      await this.state.storage.setAlarm(Date.now() + sixHours);
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    try {
      const data: WSMessage = JSON.parse(message);

      // Broadcast to all clients in the room
      this.broadcast(data.type, data.data);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // Get metadata to identify the player
    const tags = this.state.getTags(ws);
    const playerId = tags?.[0] || 'unknown';
    console.log(`Player ${playerId} disconnected from room ${this.roomCode}`);
  }

  async webSocketError(ws: WebSocket, error: Error): Promise<void> {
    console.error('WebSocket error:', error);
  }

  // Broadcast message to all connected clients
  private broadcast(type: string, data?: any): void {
    const message: WSMessage = { type, data };
    const messageStr = JSON.stringify(message);

    // Get all connected WebSockets from Durable Object state
    const webSockets = this.state.getWebSockets();
    console.log(`Broadcasting to room ${this.roomCode}:`, type, `to ${webSockets.length} clients`);
    
    webSockets.forEach((ws) => {
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    });
  }

  // Alarm handler - called after 6 hours
  async alarm(): Promise<void> {
    console.log(`Room ${this.roomCode} expired, cleaning up Durable Object`);

    // Close all WebSocket connections
    const webSockets = this.state.getWebSockets();
    webSockets.forEach((ws) => {
      try {
        ws.close(1000, 'Room expired after 6 hours');
      } catch (error) {
        console.error('Failed to close WebSocket:', error);
      }
    });

    // Clear storage
    await this.state.storage.deleteAll();

    console.log(`Room ${this.roomCode} cleanup complete`);
  }

  // Handle manual cleanup from Worker
  private handleCleanup(): Response {
    console.log(`Manual cleanup triggered for room ${this.roomCode}`);

    // Close all connections
    const webSockets = this.state.getWebSockets();
    webSockets.forEach((ws) => {
      try {
        ws.close(1000, 'Room manually cleaned up');
      } catch (error) {
        console.error('Failed to close WebSocket:', error);
      }
    });

    return new Response('OK', { status: 200 });
  }

  // Public methods that can be called via RPC
  broadcastEvent(type: string, data?: any): void {
    this.broadcast(type, data);
  }
}
