import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import type { Player, RoundData, AnswerForVoting } from '../../types';
import './Game.css';
import './ScoreCard.css';

interface GameProps {
  roomCode: string;
  playerId: string;
  onGameEnded: () => void;
}

type GamePhase = 'answering' | 'voting' | 'results' | 'finished';

export const Game: React.FC<GameProps> = ({ roomCode, playerId, onGameEnded }) => {
  const [phase, setPhase] = useState<GamePhase>('answering');
  const [roundData, setRoundData] = useState<RoundData | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [answerStatus, setAnswerStatus] = useState({ total: 0, submitted: 0 });
  const [answers, setAnswers] = useState<AnswerForVoting[]>([]);
  const [selectedAnswerId, setSelectedAnswerId] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [voteStatus, setVoteStatus] = useState({ total: 0, submitted: 0 });
  const [scoreBreakdown, setScoreBreakdown] = useState<Record<string, { foolPoints: number; detectPoints: number }>>({});
  const [cumulativeScores, setCumulativeScores] = useState<Record<string, number>>({});
  const [playerAnswers, setPlayerAnswers] = useState<Record<string, string>>({});
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);

  const fetchRoundData = useCallback(async () => {
    try {
      const data = await api.getCurrentRound(roomCode);
      setRoundData(data);
      
      // Set phase based on round status
      if (data.round.status === 'answering') {
        setPhase('answering');
        setHasSubmittedAnswer(data.hasSubmittedAnswer || false);
        setHasVoted(false);
        if (!data.hasSubmittedAnswer) {
          setAnswerText('');
        }
        setSelectedAnswerId('');
        // Fetch answer status to show current progress
        const answerStatusData = await api.getAnswerStatus(roomCode, data.round.id);
        setAnswerStatus(answerStatusData);
      } else if (data.round.status === 'voting') {
        setPhase('voting');
        setHasVoted(data.hasVoted || false);
        // Fetch answers for voting phase
        const answersData = await api.getAnswers(roomCode, data.round.id);
        setAnswers(answersData.answers.sort(() => Math.random() - 0.5));
        // Fetch vote status to show current progress
        const voteStatusData = await api.getVoteStatus(roomCode, data.round.id);
        setVoteStatus(voteStatusData);
      } else if (data.round.status === 'complete') {
        // Fetch and show results
        const result = await api.getRoundResults(roomCode, data.round.id);
        
        if (result.answers) {
          const answerTexts: Record<string, string> = {};
          result.answers.forEach((answer: any) => {
            answerTexts[answer.playerId] = answer.answerText || '';
          });
          setScoreBreakdown(result.scoreBreakdown || {});
          setCumulativeScores(result.cumulativeScores || {});
          setPlayerAnswers(answerTexts);
        }
        
        setPhase('results');
      }
    } catch (err) {
      console.error('Failed to fetch round:', err);
    }
  }, [roomCode]);

  const fetchAnswers = useCallback(async () => {
    if (!roundData) return;
    try {
      const data = await api.getAnswers(roomCode, roundData.round.id);
      setAnswers(data.answers.sort(() => Math.random() - 0.5)); // Shuffle
      setPhase('voting');
    } catch (err) {
      console.error('Failed to fetch answers:', err);
    }
  }, [roomCode, roundData]);

  const fetchAnswerStatus = useCallback(async () => {
    if (!roundData) return;
    try {
      const status = await api.getAnswerStatus(roomCode, roundData.round.id);
      setAnswerStatus(status);
      if (status.total === status.submitted) {
        // Automatically fetch answers and transition to voting when all answers are in
        await fetchAnswers();
      }
    } catch (err) {
      console.error('Failed to fetch answer status:', err);
    }
  }, [roomCode, roundData, fetchAnswers]);

  const handleRoundEnd = useCallback(async () => {
    if (!roundData) return;
    try {
      const result = await api.getRoundResults(roomCode, roundData.round.id);
      
      // Build playerAnswers, this round's breakdown, and running totals from the results payload
      if (result.answers) {
        const answerTexts: Record<string, string> = {};
        result.answers.forEach((answer: any) => {
          answerTexts[answer.playerId] = answer.answerText || '';
        });
        setScoreBreakdown(result.scoreBreakdown || {});
        setCumulativeScores(result.cumulativeScores || {});
        setPlayerAnswers(answerTexts);
      }
      
      setPhase('results');

      if (result.gameEnded) {
        // Set flag that game has ended, but don't auto-transition
        setGameEnded(true);
      }
    } catch (err) {
      console.error('Failed to get round results:', err);
    }
  }, [roomCode, roundData]);

  const fetchVoteStatus = useCallback(async () => {
    if (!roundData) return;
    try {
      const status = await api.getVoteStatus(roomCode, roundData.round.id);
      setVoteStatus(status);
      if (status.total === status.submitted) {
        await handleRoundEnd();
      }
    } catch (err) {
      console.error('Failed to fetch vote status:', err);
    }
  }, [roomCode, roundData, handleRoundEnd]);

  const fetchPlayers = useCallback(async () => {
    try {
      const data = await api.getPlayers(roomCode);
      setPlayers(data.players);
      const currentPlayer = data.players.find((p) => p.id === playerId);
      setIsHost(currentPlayer?.isHost || false);
    } catch (err) {
      console.error('Failed to fetch players:', err);
    }
  }, [roomCode, playerId]);

  useEffect(() => {
    fetchRoundData();
    fetchPlayers();
  }, [fetchRoundData, fetchPlayers]);

  useEffect(() => {
    socketService.on('round:started', fetchRoundData);
    socketService.on('answer:submitted', fetchAnswerStatus);
    socketService.on('answers:ready', fetchAnswers);
    socketService.on('voting:started', fetchAnswers);
    socketService.on('vote:cast', fetchVoteStatus);
    socketService.on('round:ended', handleRoundEnd);
    socketService.on('game:ended', onGameEnded);

    return () => {
      socketService.off('round:started', fetchRoundData);
      socketService.off('answer:submitted', fetchAnswerStatus);
      socketService.off('answers:ready', fetchAnswers);
      socketService.off('voting:started', fetchAnswers);
      socketService.off('vote:cast', fetchVoteStatus);
      socketService.off('round:ended', handleRoundEnd);
      socketService.off('game:ended', onGameEnded);
    };
  }, [fetchRoundData, fetchAnswerStatus, fetchAnswers, fetchVoteStatus, handleRoundEnd, onGameEnded]);

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerText.trim() || !roundData) return;

    setLoading(true);
    setError('');

    try {
      await api.submitAnswer(roomCode, roundData.round.id, answerText.trim());
      setHasSubmittedAnswer(true);
      await fetchAnswerStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit answer');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnswerId || !roundData) return;

    setLoading(true);
    setError('');

    try {
      await api.submitVote(roomCode, roundData.round.id, selectedAnswerId);
      setHasVoted(true);
      await fetchVoteStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit vote');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueToNextRound = async () => {
    setLoading(true);
    setError('');
    try {
      await api.continueToNextRound(roomCode);
      await fetchRoundData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start next round');
    } finally {
      setLoading(false);
    }
  };

  const handleViewFinalResults = async () => {
    setLoading(true);
    setError('');
    try {
      // Use the same API as next round - it handles game end case
      await api.continueToNextRound(roomCode);
      // Local state will be updated via WebSocket 'game:ended' event
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to view results');
      setLoading(false);
    }
  };

  const currentPlayer = players.find((p) => p.id === playerId);
  const activeHumanPlayers = players.filter((p) => !p.isEliminated && !p.isAI);
  const humanPlayerCount = players.filter(p => !p.isAI).length;

  if (!roundData) {
    return <div className="game loading" role="status" aria-live="polite">Loading game...</div>;
  }

  return (
    <div className="game">
      <main className="game-container">
        <header className="game-header">
          <div className="game-info">
            <h1>Round {roundData.round.roundNumber}</h1>
          </div>
          <div className="players-alive" role="status" aria-live="polite" aria-atomic="true">
            Players: {activeHumanPlayers.length}
          </div>
        </header>

        {phase === 'answering' && (
          <section className="answering-phase" aria-labelledby="answering-heading">
            <div className="prompt-display">
              <h2 id="answering-heading">Prompt:</h2>
              <p className="prompt-text">{roundData.prompt.promptText}</p>
            </div>

            {!hasSubmittedAnswer && !currentPlayer?.isEliminated ? (
              <form onSubmit={handleSubmitAnswer}>
                <h3>Your Answer:</h3>
                <p className="hint" id="answer-hint">Try to sound like AI so other players mistake your answer for the bot!</p>
                <label htmlFor="answer-text" className="sr-only">Your answer to the prompt</label>
                <textarea
                  id="answer-text"
                  placeholder="Type your answer here..."
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  disabled={loading}
                  maxLength={500}
                  rows={6}
                  aria-required="true"
                  aria-describedby="answer-hint"
                />
                <button type="submit" disabled={loading} aria-busy={loading}>
                  {loading ? 'Submitting...' : 'Submit Answer'}
                </button>
              </form>
            ) : (
              <div className="waiting" role="status" aria-live="polite">
                {currentPlayer?.isEliminated ? (
                  <p>You've been eliminated. Watch the game unfold!</p>
                ) : (
                  <>
                    <p><span aria-hidden="true">✓</span> Answer submitted! Waiting for others...</p>
                    <div className="status" aria-atomic="true">
                      Answers: {answerStatus.submitted}/{answerStatus.total}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {phase === 'voting' && (
          <section className="voting-phase" aria-labelledby="voting-heading">
            <h2 id="voting-heading">Vote for the answer you think was written by AI</h2>
            <p className="hint" id="voting-hint">You earn a point if you find the real AI. Humans earn points when they fool you.</p>

            {!hasVoted && !currentPlayer?.isEliminated ? (
              <form onSubmit={handleSubmitVote}>
                <fieldset className="answers-list">
                  <legend className="sr-only">Choose the answer you think was written by AI</legend>
                  {answers.map((answer, index) => (
                    <label 
                      key={answer.id} 
                      className={`answer-option ${answer.isOwnAnswer ? 'own-answer' : ''}`}
                      title={answer.isOwnAnswer ? 'This is your answer' : ''}
                    >
                      <input
                        type="radio"
                        name="vote"
                        value={answer.id}
                        checked={selectedAnswerId === answer.id}
                        onChange={(e) => setSelectedAnswerId(e.target.value)}
                        disabled={answer.isOwnAnswer}
                        aria-label={`Answer ${index + 1}: ${answer.answerText}${answer.isOwnAnswer ? ' (your answer, cannot vote)' : ''}`}
                      />
                      <div className="answer-content" aria-hidden="true">
                        <strong>Answer {index + 1}:</strong>
                        {answer.isOwnAnswer && <span className="own-badge">Your Answer</span>}
                        <p>{answer.answerText}</p>
                      </div>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" disabled={!selectedAnswerId || loading} aria-busy={loading}>
                  {loading ? 'Voting...' : 'Submit Vote'}
                </button>
              </form>
            ) : (
              <div className="waiting" role="status" aria-live="polite">
                {currentPlayer?.isEliminated ? (
                  <p>You've been eliminated. Watch the game unfold!</p>
                ) : (
                  <>
                    <p><span aria-hidden="true">✓</span> Vote submitted! Waiting for others...</p>
                    <div className="status" aria-atomic="true">
                      Votes: {voteStatus.submitted}/{voteStatus.total}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {phase === 'results' && (
          <section className="results-phase" aria-labelledby="results-heading">
            <h2 id="results-heading">Round {roundData.round.roundNumber} Results</h2>

            <ul className="score-list">
              {players
                .filter((p) => !p.isEliminated)
                .sort((a, b) => (cumulativeScores[b.id] || 0) - (cumulativeScores[a.id] || 0))
                .map((player, index) => {
                  const breakdown = scoreBreakdown[player.id] || { foolPoints: 0, detectPoints: 0 };
                  const roundTotal = breakdown.foolPoints + breakdown.detectPoints;
                  const totalScore = cumulativeScores[player.id] || 0;
                  const isLeader = index === 0 && totalScore > 0 && !player.isAI;

                  const clauses: string[] = [];
                  if (breakdown.detectPoints > 0) clauses.push('Spotted the AI (+1)');
                  if (breakdown.foolPoints > 0) {
                    clauses.push(`Fooled ${breakdown.foolPoints} ${breakdown.foolPoints === 1 ? 'player' : 'players'} (+${breakdown.foolPoints})`);
                  }
                  const detail = clauses.length > 0 ? clauses.join(' · ') : 'No points this round';

                  return (
                    <li key={player.id} className={`score-card ${isLeader ? 'leader' : ''} ${player.isAI ? 'ai' : ''}`}>
                      <div className="score-card-header">
                        <span className="score-rank" aria-hidden="true">{isLeader ? '👑' : `#${index + 1}`}</span>
                        <span className="player-name">
                          {player.name}
                          {player.isAI && <span className="ai-badge">AI</span>}
                        </span>
                        {!player.isAI && (
                          <span className="score-points">
                            {totalScore} {totalScore === 1 ? 'point' : 'points'}
                            {roundTotal > 0 && <span className="score-delta"> (+{roundTotal} this round)</span>}
                          </span>
                        )}
                      </div>
                      <p className="score-detail">{player.isAI ? 'The AI does not score points' : detail}</p>
                      {playerAnswers[player.id] && (
                        <blockquote className="score-answer">"{playerAnswers[player.id]}"</blockquote>
                      )}
                    </li>
                  );
                })}
            </ul>

            {gameEnded ? (
              // Game has ended - show button to view final results
              <>
                {isHost ? (
                  <button className="next-round-btn" onClick={handleViewFinalResults} disabled={loading} aria-busy={loading}>
                    {loading ? 'Loading...' : 'View Final Results'}
                  </button>
                ) : (
                  <p className="waiting-host" role="status" aria-live="polite">Waiting for host to view final results...</p>
                )}
              </>
            ) : (
              // Game still ongoing - show next round button
              <>
                {isHost && roundData.round.roundNumber < humanPlayerCount && (
                  <button className="next-round-btn" onClick={handleContinueToNextRound} disabled={loading} aria-busy={loading}>
                    {loading ? 'Starting...' : 'Continue to Next Round'}
                  </button>
                )}
                {!isHost && roundData.round.roundNumber < humanPlayerCount && (
                  <p className="waiting-host" role="status" aria-live="polite">Waiting for host to start next round...</p>
                )}
              </>
            )}
          </section>
        )}

        {error && <div className="error" role="alert" aria-live="assertive">{error}</div>}
      </main>
    </div>
  );
};
