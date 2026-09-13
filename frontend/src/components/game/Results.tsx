import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Player } from '../../types';
import './Results.css';
import './ScoreCard.css';

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
  const [playerScores, setPlayerScores] = useState<Record<string, number>>({});

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
        setPlayerScores(winnerData.playerScores || {});
        
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
    return <div className="results loading" role="status" aria-live="polite">Loading results...</div>;
  }

  if (error) {
    return (
      <div className="results error">
        <div role="alert" aria-live="assertive">
          <h2>Failed to load results</h2>
          <p>{error}</p>
          <button onClick={onPlayAgain}>Return Home</button>
        </div>
      </div>
    );
  }

  if (!winner) {
    return (
      <div className="results error">
        <div role="alert" aria-live="assertive">
          <h2>No Winner Determined</h2>
          <p>The game ended but no winner could be determined.</p>
          <button onClick={onPlayAgain}>Return Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="results">
      <main className="results-container">
        <section className="winner-section" aria-labelledby="winner-heading">
          {currentPlayer && winner && currentPlayer.id === winner.id ? (
            // Current player is the winner
            <>
              <h1 id="winner-heading" className="winner-title human">
                <span aria-hidden="true">🎉</span> YOU WIN!
              </h1>
              <p className="winner-subtitle">Congratulations!</p>
              <div className="winner-name human" aria-label={`Winner: ${winner.name}`}>{winner.name}</div>
              <p className="winner-message">You scored the most points by detecting the AI and fooling other players!</p>
            </>
          ) : winner ? (
            // Current player didn't win
            <>
              <h1 id="winner-heading" className="winner-title eliminated">
                <span aria-hidden="true">🏆</span> GAME OVER
              </h1>
              <p className="winner-subtitle">Winner</p>
              <div className="winner-name human" aria-label={`Winner: ${winner.name}`}>{winner.name}</div>
              <p className="winner-message">{winner.name} scored the most points and wins!</p>
            </>
          ) : (
            <>
              <h1 id="winner-heading" className="winner-title">
                <span aria-hidden="true">🏆</span> GAME OVER
              </h1>
              <p className="winner-subtitle">No winner determined</p>
            </>
          )}
        </section>

        <section className="players-summary" aria-labelledby="standings-heading">
          <h2 id="standings-heading">Final Standings</h2>
          <ul className="score-grid">
            {players
              .sort((a, b) => (playerScores[b.id] || 0) - (playerScores[a.id] || 0))
              .map((player, index) => (
                <li
                  key={player.id}
                  className={`score-card ${index === 0 && !player.isAI ? 'leader' : ''} ${player.isAI ? 'ai' : ''}`}
                >
                  <div className="score-card-header">
                    <span className="score-rank" aria-label={`Rank ${index + 1}`}>{index === 0 ? '👑' : `#${index + 1}`}</span>
                    <span className="player-name">
                      {player.name}
                      {player.isAI && <span className="ai-badge">AI</span>}
                    </span>
                    <span className="score-points">
                      {playerScores[player.id] || 0} {(playerScores[player.id] || 0) === 1 ? 'point' : 'points'}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </section>

        <button className="play-again-btn" onClick={onPlayAgain}>
          Play Again
        </button>
      </main>
    </div>
  );
};
