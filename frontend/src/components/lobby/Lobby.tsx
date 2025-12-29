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
      <main className="lobby-container">
        <header className="lobby-header">
          <h1>
            <span aria-hidden="true">🤖</span> Game Lobby
          </h1>
          <div className="room-code">
            <span>Room Code:</span>
            <code aria-label={`Room code: ${roomCode.split('').join(' ')}`}>{roomCode}</code>
          </div>
        </header>

        <div className="lobby-content">
          <section className="players-section" aria-labelledby="players-heading">
            <h2 id="players-heading">Players ({players.filter(p => !p.isAI).length}/6)</h2>
            <ul className="players-list">
              {players.map((player) => (
                <li key={player.id} className={`player-item ${player.isHost ? 'host' : ''}`}>
                  <span className="player-name">{player.name}</span>
                  {player.isHost && <span className="badge">Host</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="prompt-section" aria-labelledby="prompt-heading">
            <h2 id="prompt-heading">Submit Your Prompt</h2>
            <p className="prompt-hint">
              Submit a question that players will answer. Make it interesting!
            </p>

            {!hasSubmittedPrompt ? (
              <form onSubmit={handleSubmitPrompt}>
                <label htmlFor="prompt-text" className="sr-only">Your prompt question</label>
                <textarea
                  id="prompt-text"
                  placeholder="Example: What's your favorite childhood memory?"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  disabled={loading}
                  maxLength={200}
                  rows={4}
                  aria-required="true"
                  aria-describedby="prompt-hint"
                />
                <button type="submit" disabled={loading} aria-busy={loading}>
                  {loading ? 'Submitting...' : 'Submit Prompt'}
                </button>
              </form>
            ) : (
              <div className="prompt-submitted" role="status" aria-live="polite">
                <span aria-hidden="true">✓</span> Prompt submitted! Waiting for others...
              </div>
            )}

            <div className="prompt-status" role="status" aria-live="polite" aria-atomic="true">
              Prompts: {promptStatus.submitted}/{promptStatus.total}
            </div>
          </section>
        </div>

        {error && <div className="error" role="alert" aria-live="assertive">{error}</div>}

        {canStartGame && (
          <button className="start-game-btn" onClick={handleStartGame} disabled={loading} aria-busy={loading}>
            {loading ? 'Starting...' : 'Start Game'}
          </button>
        )}

        {!canStartGame && promptStatus.total === promptStatus.submitted && promptStatus.total > 0 && (
          <div className="waiting-message" role="status" aria-live="polite">
            {isHost && promptStatus.total < 2 
              ? 'Waiting for more players to join...'
              : 'Waiting for host to start the game...'}
          </div>
        )}
      </main>
    </div>
  );
};
