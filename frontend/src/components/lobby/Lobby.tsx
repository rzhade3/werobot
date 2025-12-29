import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import type { Player } from '../../types';
import './Lobby.css';

interface LobbyProps {
  roomCode: string;
  playerId: string;
  onGameStarted: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({ roomCode, playerId, onGameStarted }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [promptText, setPromptText] = useState('');
  const [hasSubmittedPrompt, setHasSubmittedPrompt] = useState(false);
  const [promptStatus, setPromptStatus] = useState({ total: 0, submitted: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isHost, setIsHost] = useState(false);

  const fetchPlayers = useCallback(async () => {
    try {
      const data = await api.getPlayers(roomCode);
      setPlayers(data.players);
      const player = data.players.find((p) => p.id === playerId);
      setIsHost(player?.isHost || false);
    } catch (err) {
      console.error('Failed to fetch players:', err);
    }
  }, [roomCode, playerId]);

  const fetchPromptStatus = useCallback(async () => {
    try {
      const status = await api.getPromptStatus(roomCode);
      setPromptStatus(status);
    } catch (err) {
      console.error('Failed to fetch prompt status:', err);
    }
  }, [roomCode]);

  useEffect(() => {
    fetchPlayers();
    fetchPromptStatus();

    const handlePlayerChange = () => {
      fetchPlayers();
      fetchPromptStatus(); // Update prompt count when players join/leave
    };

    socketService.on('player:joined', handlePlayerChange);
    socketService.on('player:left', handlePlayerChange);
    socketService.on('prompt:submitted', fetchPromptStatus);
    socketService.on('game:started', onGameStarted);

    return () => {
      socketService.off('player:joined', handlePlayerChange);
      socketService.off('player:left', handlePlayerChange);
      socketService.off('prompt:submitted', fetchPromptStatus);
      socketService.off('game:started', onGameStarted);
    };
  }, [roomCode, playerId, onGameStarted, fetchPlayers, fetchPromptStatus]);

  const handleSubmitPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.submitPrompt(roomCode, promptText.trim());
      setHasSubmittedPrompt(true);
      await fetchPromptStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit prompt');
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async () => {
    setLoading(true);
    setError('');

    try {
      await api.startGame(roomCode);
      onGameStarted();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start game');
      setLoading(false);
    }
  };

  const canStartGame = isHost && promptStatus.total === promptStatus.submitted && promptStatus.total >= 2;

  return (
    <div className="lobby">
      <div className="lobby-container">
        <div className="lobby-header">
          <h1>🤖 Game Lobby</h1>
          <div className="room-code">
            <span>Room Code:</span>
            <code>{roomCode}</code>
          </div>
        </div>

        <div className="lobby-content">
          <div className="players-section">
            <h2>Players ({players.length}/6)</h2>
            <div className="players-list">
              {players.map((player) => (
                <div key={player.id} className={`player-item ${player.isHost ? 'host' : ''}`}>
                  <span className="player-name">{player.name}</span>
                  {player.isHost && <span className="badge">Host</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="prompt-section">
            <h2>Submit Your Prompt</h2>
            <p className="prompt-hint">
              Submit a question that players will answer. Make it interesting!
            </p>

            {!hasSubmittedPrompt ? (
              <form onSubmit={handleSubmitPrompt}>
                <textarea
                  placeholder="Example: What's your favorite childhood memory?"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  disabled={loading}
                  maxLength={200}
                  rows={4}
                />
                <button type="submit" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Prompt'}
                </button>
              </form>
            ) : (
              <div className="prompt-submitted">
                ✓ Prompt submitted! Waiting for others...
              </div>
            )}

            <div className="prompt-status">
              Prompts: {promptStatus.submitted}/{promptStatus.total}
            </div>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {canStartGame && (
          <button className="start-game-btn" onClick={handleStartGame} disabled={loading}>
            {loading ? 'Starting...' : 'Start Game'}
          </button>
        )}

        {!canStartGame && promptStatus.total === promptStatus.submitted && promptStatus.total > 0 && (
          <div className="waiting-message">
            Waiting for host to start the game...
          </div>
        )}
      </div>
    </div>
  );
};
