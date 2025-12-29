const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8787';

class SocketService {
  private socket: WebSocket | null = null;
  private roomCode: string | null = null;
  private playerId: string | null = null;
  private eventHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(roomCode: string, playerId: string): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.socket);
    }

    this.roomCode = roomCode;
    this.playerId = playerId;

    const wsUrl = `${WS_URL}/api/ws?roomCode=${roomCode}&playerId=${playerId}`;
    this.socket = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
      this.socket!.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve(this.socket!);
      };

      this.socket!.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.socket!.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.socket!.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.roomCode && this.playerId) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      setTimeout(() => {
        this.connect(this.roomCode!, this.playerId!);
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  private handleMessage(data: any) {
    console.log('WebSocket message received:', data);
    const handlers = this.eventHandlers.get(data.type);
    if (handlers) {
      console.log(`Calling ${handlers.size} handlers for event: ${data.type}`);
      handlers.forEach(handler => handler(data.data));
    } else {
      console.warn(`No handlers registered for event: ${data.type}`);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.roomCode = null;
      this.playerId = null;
    }
  }

  private sendMessage(type: string, data?: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, data }));
    } else {
      console.warn('WebSocket not connected, cannot send message:', type);
    }
  }

  joinRoom(roomCode: string, playerId: string) {
    this.sendMessage('join-room', { roomCode, playerId });
  }

  notifyPlayerJoined(roomCode: string) {
    this.sendMessage('notify-player-joined', { roomCode });
  }

  notifyPlayerLeft(roomCode: string) {
    this.sendMessage('notify-player-left', { roomCode });
  }

  notifyPromptSubmitted(roomCode: string) {
    this.sendMessage('notify-prompt-submitted', { roomCode });
  }

  notifyGameReady(roomCode: string) {
    this.sendMessage('notify-game-ready', { roomCode });
  }

  notifyGameStarted(roomCode: string) {
    this.sendMessage('notify-game-started', { roomCode });
  }

  notifyRoundStarted(roomCode: string) {
    this.sendMessage('notify-round-started', { roomCode });
  }

  notifyAnswerSubmitted(roomCode: string) {
    this.sendMessage('notify-answer-submitted', { roomCode });
  }

  notifyAnswersReady(roomCode: string) {
    this.sendMessage('notify-answers-ready', { roomCode });
  }

  notifyVotingStarted(roomCode: string) {
    this.sendMessage('notify-voting-started', { roomCode });
  }

  notifyVoteCast(roomCode: string) {
    this.sendMessage('notify-vote-cast', { roomCode });
  }

  notifyRoundEnded(roomCode: string) {
    this.sendMessage('notify-round-ended', { roomCode });
  }

  notifyGameEnded(roomCode: string) {
    this.sendMessage('notify-game-ended', { roomCode });
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (callback) {
      this.eventHandlers.get(event)?.delete(callback);
    } else {
      this.eventHandlers.delete(event);
    }
  }

  getSocket() {
    return this.socket;
  }
}

export const socketService = new SocketService();
