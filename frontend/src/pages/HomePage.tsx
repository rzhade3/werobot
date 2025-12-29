import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Lightbulb, Vote, Trophy } from 'lucide-react';
import { apiService } from '../services/api';
import '../components/HomePage.css';

export const HomePage: React.FC = () => {
  const [playerName, setPlayerName] = React.useState('');
  const [roomCode, setRoomCode] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [actionType, setActionType] = React.useState<'create' | 'join'>('create');
  const navigate = useNavigate();

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await apiService.createRoom(playerName.trim());
      // Store session ID in sessionStorage for WebSocket auth
      sessionStorage.setItem(`session_${response.roomCode}`, response.playerId);
      navigate(`/room/${response.roomCode}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await apiService.joinRoom(roomCode.toUpperCase().trim(), playerName.trim());
      // Store session ID in sessionStorage for WebSocket auth
      sessionStorage.setItem(`session_${roomCode.toUpperCase().trim()}`, response.playerId);
      navigate(`/room/${roomCode.toUpperCase().trim()}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionType === 'create') {
      await handleCreateRoom(e);
    } else {
      await handleJoinRoom(e);
    }
  };

  return (
    <div className="home">
      <div className="home-container">
        <h1 className="title">We, Robot</h1>
        <p className="subtitle">Can you spot the humans among us?</p>

        {error && <div className="error">{error}</div>}

        <div className="how-to-play">
          <h3>How to Play</h3>
          <div className="how-to-play-steps">
            <div className="how-to-play-step">
              <div className="step-icon step-icon-purple">
                <Users className="icon" />
              </div>
              <div>
                <p>Create or join a room with 2+ players</p>
              </div>
            </div>

            <div className="how-to-play-step">
              <div className="step-icon step-icon-pink">
                <Lightbulb className="icon" />
              </div>
              <div>
                <p>Answer prompts and try to fool others into thinking you're an AI</p>
              </div>
            </div>

            <div className="how-to-play-step">
              <div className="step-icon step-icon-orange">
                <Vote className="icon" />
              </div>
              <div>
                <p>If you spot someone that looks like a human, vote them out!</p>
              </div>
            </div>

            <div className="how-to-play-step">
              <div className="step-icon step-icon-yellow">
                <Trophy className="icon" />
              </div>
              <div>
                <p>The human with the least votes wins!</p>
              </div>
            </div>
          </div>
        </div>

        <div className="forms-container">
          <div className="form-section">
            <h2>Get Started</h2>
            <form onSubmit={handleSubmit}>
              <div className="action-type-selector">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="actionType"
                    value="create"
                    checked={actionType === 'create'}
                    onChange={(e) => setActionType(e.target.value as 'create' | 'join')}
                    disabled={loading}
                  />
                  <span>Create New Game</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="actionType"
                    value="join"
                    checked={actionType === 'join'}
                    onChange={(e) => setActionType(e.target.value as 'create' | 'join')}
                    disabled={loading}
                  />
                  <span>Join Existing Game</span>
                </label>
              </div>

              <input
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                disabled={loading}
                maxLength={20}
              />

              {actionType === 'join' && (
                <input
                  type="text"
                  placeholder="Enter room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  disabled={loading}
                  maxLength={6}
                  className="room-code-input"
                />
              )}

              <button type="submit" disabled={loading} className={actionType === 'create' ? 'btn-primary' : 'btn-secondary'}>
                {loading ? (actionType === 'create' ? 'Creating...' : 'Joining...') : (actionType === 'create' ? 'Create New Room' : 'Join Existing Room')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
