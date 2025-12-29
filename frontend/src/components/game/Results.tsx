import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Player } from '../../types';
import './Results.css';

interface ResultsProps {
  roomCode: string;
  playerId: string;
  onPlayAgain: () => void;
}

export const Results: React.FC<ResultsProps> = ({ roomCode, playerId, onPlayAgain }) => {
  const [winner, setWinner] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [playerVotes, setPlayerVotes] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const [winnerData, playersData] = await Promise.all([
          api.getWinner(roomCode),
          api.getPlayers(roomCode),
        ]);
        
        console.log('Winner data:', winnerData);
        console.log('Players data:', playersData);
        
        setWinner(winnerData.winner);
        setPlayers(playersData.players);
        setPlayerVotes(winnerData.playerVotes || {});
        
        // Find current player
        const player = playersData.players.find(p => p.id === playerId);
        setCurrentPlayer(player || null);
      } catch (err: any) {
        console.error('Failed to fetch results:', err);
        setError(err.response?.data?.error || err.message || 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [roomCode, playerId]);

  if (loading) {
    return <div className="results loading">Loading results...</div>;
  }

  if (error) {
    return (
      <div className="results error">
        <h2>Failed to load results</h2>
        <p>{error}</p>
        <button onClick={onPlayAgain}>Return Home</button>
      </div>
    );
  }

  if (!winner) {
    return (
      <div className="results error">
        <h2>No Winner Determined</h2>
        <p>The game ended but no winner could be determined.</p>
        <button onClick={onPlayAgain}>Return Home</button>
      </div>
    );
  }

  return (
    <div className="results">
      <div className="results-container">
        <div className="winner-section">
          {currentPlayer && winner && currentPlayer.id === winner.id ? (
            // Current player is the winner
            <>
              <h1 className="winner-title human">🎉 YOU WIN!</h1>
              <p className="winner-subtitle">Congratulations!</p>
              <div className="winner-name human">{winner.name}</div>
              <p className="winner-message">You received the fewest votes!</p>
            </>
          ) : winner ? (
            // Current player didn't win
            <>
              <h1 className="winner-title eliminated">🏆 GAME OVER</h1>
              <p className="winner-subtitle">Winner</p>
              <div className="winner-name human">{winner.name}</div>
              <p className="winner-message">{winner.name} received the fewest votes and wins!</p>
            </>
          ) : (
            <>
              <h1 className="winner-title">🏆 GAME OVER</h1>
              <p className="winner-subtitle">No winner determined</p>
            </>
          )}
        </div>

        <div className="players-summary">
          <h2>Final Standings (by votes received)</h2>
          <div className="players-grid">
            {players
              .sort((a, b) => (playerVotes[a.id] || 0) - (playerVotes[b.id] || 0))
              .map((player, index) => (
                <div
                  key={player.id}
                  className={`player-card ${index === 0 && !player.isAI ? 'winner' : ''} ${player.isAI ? 'ai' : ''}`}
                >
                  <div className="player-rank">#{index + 1}</div>
                  <div className="player-name">
                    {player.name}
                    {player.isAI && <span className="ai-badge">AI</span>}
                    {index === 0 && !player.isAI && <span className="winner-badge">👑 Winner</span>}
                  </div>
                  <div className="player-votes">
                    {playerVotes[player.id] || 0} {(playerVotes[player.id] || 0) === 1 ? 'vote' : 'votes'}
                  </div>
                </div>
              ))}
          </div>
        </div>

        <button className="play-again-btn" onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
};
