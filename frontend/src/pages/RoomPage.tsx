import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lobby } from '../components/lobby/Lobby';
import { Game } from '../components/game/Game';
import { Results } from '../components/game/Results';
import { socketService } from '../services/socket';
import { apiService } from '../services/api';

type GameState = 'lobby' | 'playing' | 'finished';

export const RoomPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState>('lobby');
  const [playerId, setPlayerId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!roomCode) {
      navigate('/');
      return;
    }

    const verifyAccess = async () => {
      try {
        // Verify access with backend and get initial game state
        const gameState = await apiService.getGameState(roomCode.toUpperCase());
        
        // Set the appropriate game state based on room status
        if (gameState.room.status === 'lobby') {
          setGameState('lobby');
        } else if (gameState.room.status === 'playing') {
          setGameState('playing');
        } else if (gameState.room.status === 'finished') {
          setGameState('finished');
        }
        
        // Get playerId from the backend response (validated via session cookie)
        setPlayerId(gameState.room.currentPlayerId || '');
        setLoading(false);
        
        // Connect WebSocket after UI is ready
        try {
          await socketService.connect(roomCode.toUpperCase());
        } catch (wsErr) {
          console.error('WebSocket connection failed:', wsErr);
        }
      } catch (err: any) {
        console.error('Error verifying access:', err);
        navigate('/');
      }
    };

    verifyAccess();

    return () => {
      socketService.disconnect();
    };
  }, [roomCode, navigate]);

  const handleGameStarted = () => {
    setGameState('playing');
  };

  const handleGameEnded = () => {
    setGameState('finished');
  };

  const handlePlayAgain = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="App">
        <div className="container">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <div className="container">
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  if (!roomCode) {
    return null;
  }

  return (
    <div className="App">
      {gameState === 'lobby' && (
        <Lobby roomCode={roomCode} playerId={playerId} onGameStarted={handleGameStarted} />
      )}
      {gameState === 'playing' && (
        <Game roomCode={roomCode} playerId={playerId} onGameEnded={handleGameEnded} />
      )}
      {gameState === 'finished' && (
        <Results roomCode={roomCode} playerId={playerId} onPlayAgain={handlePlayAgain} />
      )}
    </div>
  );
};
