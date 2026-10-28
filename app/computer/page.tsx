'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { characters } from '../../data/characters';
import {
  Alien,
  ALL_STATS_METADATA,
  CORE_SIX_STATS,
  CpuDifficulty,
  RoomYouTubeState,
  RoundHistoryEntry,
  StatKey,
  ULTIMATE_OVERCHARGE_BONUS,
} from '../../lib/types';
import {
  dealFairHands,
  evaluateRoundComparison,
  selectCpuAttribute,
} from '../../lib/gameEngine';
import Card, { HiddenCardBack } from '../../components/Card';
import { SpadesFourSeatArena } from '../../components/SpadesDeckFan';
import AudioSettingsBar from '../../components/AudioSettingsBar';
import CharacterCodexModal from '../../components/CharacterCodexModal';
import YouTubeMusicBar from '../../components/YouTubeMusicBar';
import { soundEngine } from '../../lib/soundEngine';

type MatchPhase = 'setup' | 'playing' | 'cpu_thinking' | 'round_result' | 'finished';

const QUICK_CHATS = ['🔥 GG!', '⚡ Too Fast!', '💪 Crush It!', '😎 My Turn!', '😱 Close One!'];

export default function VSComputerPage() {
  const [difficulty, setDifficulty] = useState<CpuDifficulty>('normal');
  const [maxRounds, setMaxRounds] = useState<number>(5);
  // Optional "Winner Steals Card" Survival Mode toggle
  const [winnerStealsCardMode, setWinnerStealsCardMode] = useState<boolean>(true);
  const [lockedStat, setLockedStat] = useState<StatKey | null>(null);
  const [playerStreak, setPlayerStreak] = useState<number>(0);
  const [cpuStreak, setCpuStreak] = useState<number>(0);
  const [selectedStarterId, setSelectedStarterId] = useState<string>(characters[0].id);
  const [codexOpen, setCodexOpen] = useState<boolean>(false);

  const initialHands = dealFairHands({
    playerIds: ['player', 'cpu'],
    cardsPerPlayer: 5,
    allowDuplicateCards: false,
    preferredStarters: { player: characters[0].id, cpu: null },
  });

  const [phase, setPhase] = useState<MatchPhase>('playing');
  const [round, setRound] = useState<number>(1);
  const [playerScore, setPlayerScore] = useState<number>(0);
  const [cpuScore, setCpuScore] = useState<number>(0);
  const [playerHand, setPlayerHand] = useState<Alien[]>(initialHands.hands['player']);
  const [cpuHand, setCpuHand] = useState<Alien[]>(initialHands.hands['cpu']);
  const [currentTurn, setCurrentTurn] = useState<'player' | 'cpu'>('player');
  const [selectedStat, setSelectedStat] = useState<StatKey | null>(null);
  const [roundWinner, setRoundWinner] = useState<'player' | 'cpu' | 'tie' | null>(null);
  const [statusBanner, setStatusBanner] = useState<string>(
    'Tap any of the 4 skills on your card to clash!'
  );
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Ultimate Omnitrix Overcharge (+15 1x per match)
  const [playerUltimateUsed, setPlayerUltimateUsed] = useState<boolean>(false);
  const [playerUltimateArmed, setPlayerUltimateArmed] = useState<boolean>(false);
  const [cpuUltimateUsed, setCpuUltimateUsed] = useState<boolean>(false);
  const [cpuUltimateArmed, setCpuUltimateArmed] = useState<boolean>(false);

  // 60-second Turn Countdown Timer & Auto-Next-Round Countdown
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number>(60);
  const [autoNextSeconds, setAutoNextSeconds] = useState<number>(4);

  const [playerBubble, setPlayerBubble] = useState<string>('Ready to clash! ⚡');
  const [cpuBubble, setCpuBubble] = useState<string>('Scanning your alien... 🤖');
  const [chatInput, setChatInput] = useState<string>('');
  const [youtubeState, setYoutubeState] = useState<RoomYouTubeState | null>(null);

  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoNextTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeStatPool: StatKey[] = CORE_SIX_STATS;
  const currentPlayerCard: Alien = playerHand[0] || characters[0];
  const currentCpuCard: Alien = cpuHand[0] || characters[1];

  useEffect(() => {
    return () => {
      if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
      if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);
      soundEngine.setMusicTrack('none');
    };
  }, []);

  // 60s Countdown Timer during 'playing' phase
  useEffect(() => {
    if (phase !== 'playing') return;
    setTurnSecondsLeft(60);

    const interval = setInterval(() => {
      setTurnSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (currentTurn === 'player' && !isSubmitting) {
            const autoStat = selectCpuAttribute({
              cpuCard: currentPlayerCard,
              difficulty: 'normal',
              availableStats: activeStatPool,
              lockedStat,
            });
            setPlayerBubble(`⏱ Auto-picked ${autoStat.toUpperCase()}!`);
            executeRoundResolution(autoStat, 'player');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, currentTurn]);

  // Automatic Next-Round Transition after 4 seconds in 'round_result' phase
  useEffect(() => {
    if (phase !== 'round_result') {
      if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);
      return;
    }

    setAutoNextSeconds(4);
    autoNextTimerRef.current = setInterval(() => {
      setAutoNextSeconds((prev) => {
        if (prev <= 1) {
          if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);
          advanceRoundAutomatically();
          return 0;
        }
        return prev - 1;
      });
    }, 950);

    return () => {
      if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  useEffect(() => {
    if (phase === 'playing' && currentTurn === 'cpu') {
      setPhase('cpu_thinking');
      setCpuBubble('Analyzing my 4 skills... 🤔');
      setStatusBanner(`CPU (${difficulty.toUpperCase()}) is choosing a skill...`);

      cpuTimerRef.current = setTimeout(() => {
        const cpuChosenStat = selectCpuAttribute({
          cpuCard: currentCpuCard,
          difficulty,
          availableStats: activeStatPool,
          lockedStat,
        });
        setCpuBubble(`I choose ${cpuChosenStat.toUpperCase()}! 💥`);
        executeRoundResolution(cpuChosenStat, 'cpu');
      }, 950);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentTurn]);

  const handleStartMatch = (starterOverride?: string, roundsOverride?: number) => {
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);

    const chosenStarter = starterOverride || selectedStarterId;
    const chosenRounds = roundsOverride || maxRounds;

    const { hands } = dealFairHands({
      playerIds: ['player', 'cpu'],
      cardsPerPlayer: chosenRounds,
      allowDuplicateCards: false,
      preferredStarters: {
        player: chosenStarter,
        cpu: null,
      },
    });

    setPlayerHand(hands['player']);
    setCpuHand(hands['cpu']);
    setRound(1);
    setPlayerScore(0);
    setCpuScore(0);
    setCurrentTurn('player');
    setSelectedStat(null);
    setLockedStat(null);
    setPlayerStreak(0);
    setCpuStreak(0);
    setRoundWinner(null);
    setRoundHistory([]);
    setIsSubmitting(false);
    setPlayerUltimateUsed(false);
    setPlayerUltimateArmed(false);
    setCpuUltimateUsed(false);
    setCpuUltimateArmed(false);
    setPlayerBubble('New match! Let’s go! 🔥');
    setCpuBubble('Omnitrix CPU ready! ⚡');
    setPhase('playing');
    setStatusBanner(
      winnerStealsCardMode
        ? 'STEAL CARD MODE: Winner captures the opponent card!'
        : 'YOUR TURN: Tap one of the 4 skills on your card!'
    );
  };

  const executeRoundResolution = (stat: StatKey, turnOwner: 'player' | 'cpu') => {
    soundEngine.playSfx('battle-clash');

    // Fair CPU Ultimate logic: CPU on Hard/Normal may use its 1x Ultimate on Round >= 3 if not yet used
    const cpuUsesUlt =
      !cpuUltimateUsed &&
      difficulty !== 'easy' &&
      round >= 3 &&
      currentCpuCard.stats[stat] >= 75;

    const attackerWinStreak = turnOwner === 'player' ? playerStreak : cpuStreak;
    const comparison = evaluateRoundComparison({
      activePlayerId: turnOwner,
      selectedStat: stat,
      playerCards: [
        {
          playerId: 'player',
          displayName: 'You',
          alien: currentPlayerCard,
          usedUltimate: playerUltimateArmed,
        },
        {
          playerId: 'cpu',
          displayName: 'Omnitrix CPU',
          alien: currentCpuCard,
          usedUltimate: cpuUsesUlt,
        },
      ],
      attackerWinStreak,
      tieRule: 'keep_active',
    });

    if (playerUltimateArmed) {
      setPlayerUltimateUsed(true);
    }
    if (cpuUsesUlt) {
      setCpuUltimateUsed(true);
      setCpuUltimateArmed(true);
    }

    const statLabel =
      ALL_STATS_METADATA.find((m) => m.key === stat)?.label || stat.toUpperCase();
    const pEntry = comparison.entries.find((e) => e.playerId === 'player')!;
    const cEntry = comparison.entries.find((e) => e.playerId === 'cpu')!;
    const pVal = pEntry.statValue;
    const cVal = cEntry.statValue;

    let outcome: 'player' | 'cpu' | 'tie' = 'tie';

    if (comparison.resolvedWinnerId === 'player') {
      setPlayerScore((s) => s + 1);
      setPlayerStreak((st) => st + 1);
      setCpuStreak(0);
      outcome = 'player';
      setCurrentTurn('player');
      setPlayerBubble(
        `Won with ${statLabel} (${pVal})${
          winnerStealsCardMode ? ' + Stole Card!' : ''
        } 🏆`
      );
      setCpuBubble(`Lost (${cVal} vs ${pVal}) 💥`);
      setStatusBanner(
        `🏆 YOU WON ROUND ${round}! ${currentPlayerCard.name} (${pVal}) beat ${currentCpuCard.name} (${cVal})!`
      );
    } else if (comparison.resolvedWinnerId === 'cpu') {
      setCpuScore((s) => s + 1);
      setCpuStreak((st) => st + 1);
      setPlayerStreak(0);
      outcome = 'cpu';
      setCurrentTurn('cpu');
      setCpuBubble(
        `My ${currentCpuCard.name} won (${cVal})${
          winnerStealsCardMode ? ' + Stole Card!' : ''
        } ⚡`
      );
      setPlayerBubble(`Ouch (${pVal} vs ${cVal})!`);
      setStatusBanner(
        `⚡ CPU WON ROUND ${round}! ${currentCpuCard.name} (${cVal}) beat ${currentPlayerCard.name} (${pVal})!`
      );
    } else {
      outcome = 'tie';
      setCurrentTurn(turnOwner);
      setPlayerBubble(`Tied at ${pVal}! ⚡`);
      setCpuBubble(`Equal power (${cVal})! ⚡`);
      setStatusBanner(`CLASH TIED ON ${statLabel} (${pVal} vs ${cVal})!`);
    }

    setSelectedStat(stat);
    setRoundWinner(outcome);
    setRoundHistory((prev) => [
      ...prev,
      {
        roundNumber: round,
        activePlayerId: turnOwner,
        selectedStat: stat,
        highestValue: comparison.highestValue,
        winnerIds: comparison.winnerIds,
        resolvedWinnerId: comparison.resolvedWinnerId,
        isTie: comparison.isTie,
        stolenCardCount: winnerStealsCardMode && outcome !== 'tie' ? 1 : 0,
        entries: comparison.entries,
        timestamp: Date.now(),
      },
    ]);
    setPhase('round_result');
    setIsSubmitting(false);
  };

  const handlePlayerStatSelect = (stat: StatKey) => {
    if (phase !== 'playing' || currentTurn !== 'player' || isSubmitting) return;
    setIsSubmitting(true);
    setPlayerBubble(`Playing ${stat.toUpperCase()}! ⚔`);
    executeRoundResolution(stat, 'player');
  };

  const advanceRoundAutomatically = () => {
    if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);

    setPlayerUltimateArmed(false);
    setCpuUltimateArmed(false);

    if (winnerStealsCardMode) {
      // Winner Steals Card Survival Mode progression
      const pCopy = [...playerHand];
      const cCopy = [...cpuHand];
      const pPlayed = pCopy.shift();
      const cPlayed = cCopy.shift();

      if (roundWinner === 'player' && pPlayed && cPlayed) {
        pCopy.push(pPlayed, cPlayed);
      } else if (roundWinner === 'cpu' && pPlayed && cPlayed) {
        cCopy.push(cPlayed, pPlayed);
      } else {
        if (pPlayed) pCopy.push(pPlayed);
        if (cPlayed) cCopy.push(cPlayed);
      }

      setPlayerHand(pCopy);
      setCpuHand(cCopy);

      if (pCopy.length === 0 || cCopy.length === 0 || round >= maxRounds * 3) {
        setPhase('finished');
        return;
      }

      setRound((r) => r + 1);
      setLockedStat(null);
      setSelectedStat(null);
      setRoundWinner(null);
      setPhase('playing');
      setStatusBanner(
        `STEAL MODE: You have ${pCopy.length} cards vs CPU's ${cCopy.length} cards!`
      );
      return;
    }

    // Standard Fixed-Round Mode
    if (round >= maxRounds) {
      setPhase('finished');
      return;
    }

    setPlayerHand((prev) => (prev.length > 1 ? prev.slice(1) : prev));
    setCpuHand((prev) => (prev.length > 1 ? prev.slice(1) : prev));
    setRound((r) => r + 1);
    setLockedStat(null);
    setSelectedStat(null);
    setLockedStat(null);
    setPlayerStreak(0);
    setCpuStreak(0);
    setRoundWinner(null);
    setPhase('playing');
    setStatusBanner('Next round dealt automatically — choose your skill!');
  };

  const sendQuickChat = (msg: string) => {
    const clean = msg.trim();
    if (!clean) return;
    setPlayerBubble(clean);
    setChatInput('');
  };

  const leaderboardEntries = [
    {
      name: 'You (Player)',
      score: playerScore,
      cards: playerHand.length,
    },
    {
      name: `Omnitrix CPU (${difficulty.toUpperCase()})`,
      score: cpuScore,
      cards: cpuHand.length,
    },
  ].sort((a, b) =>
    winnerStealsCardMode ? b.cards - a.cards || b.score - a.score : b.score - a.score
  );

  return (
    <main className="oa-viewport-shell">
      {/* Structured Clean Top Bar with Corner Symbol Controls */}
      <header className="oa-topbar">
        <div className="oa-nav-group">
          <span className="oa-brand-title" style={{ fontSize: '13px', color: '#34d399' }}>
            VS COMPUTER
          </span>
          <span className="oa-badge mono">
            R{round}/{maxRounds} • {winnerStealsCardMode ? 'STEAL MODE' : difficulty.toUpperCase()}
          </span>
        </div>

        <div className="oa-nav-group">
          <button
            type="button"
            onClick={() => setPhase((p) => (p === 'setup' ? 'playing' : 'setup'))}
            className="oa-icon-btn"
            title="Match Settings"
          >
            ⚙
          </button>
          <button
            type="button"
            onClick={() => setCodexOpen(true)}
            className="oa-icon-btn"
            title="Inspect Alien Deck"
          >
            ▦
          </button>
          <AudioSettingsBar />
          <Link href="/" className="oa-icon-btn exit" title="Exit to Modes">
            ✕
          </Link>
        </div>
      </header>

      {/* Admin YouTube DJ + Draggable Floating TV */}
      <YouTubeMusicBar
        youtubeState={youtubeState}
        isAdmin={true}
        onAdminChangeTrack={(next) => setYoutubeState(next)}
      />

      {/* Player Seats Strip (shown only in setup/finished; active table uses 4-side perimeter seats) */}
      {(phase === 'setup' || phase === 'finished') && (
      <section className="oa-seats-strip">
        <div className={`oa-seat-pod ${currentTurn === 'player' ? 'active-turn' : ''}`}>
          {playerBubble && <div className="oa-speech-bubble">{playerBubble}</div>}
          <div className="oa-seat-avatar">YOU</div>
          <div className="oa-seat-meta">
            <span className="oa-seat-name">You (Player)</span>
            <span className="oa-seat-sub mono">
              {winnerStealsCardMode
                ? `🃏 ${playerHand.length} CARDS`
                : currentTurn === 'player'
                ? '⚡ YOUR TURN'
                : 'READY'}
            </span>
          </div>
          <span className="oa-score-highlight mono">★ {playerScore}</span>
        </div>

        <div className={`oa-seat-pod ${currentTurn === 'cpu' ? 'active-turn' : ''}`}>
          {cpuBubble && <div className="oa-speech-bubble">{cpuBubble}</div>}
          <div
            className="oa-seat-avatar"
            style={{ borderColor: '#f87171', color: '#f87171', background: '#2b1212' }}
          >
            AI
          </div>
          <div className="oa-seat-meta">
            <span className="oa-seat-name">CPU ({difficulty})</span>
            <span className="oa-seat-sub mono" style={{ color: '#fca5a5' }}>
              {winnerStealsCardMode
                ? `🃏 ${cpuHand.length} CARDS`
                : currentTurn === 'cpu'
                ? '⚡ CPU TURN'
                : 'READY'}
            </span>
          </div>
          <span className="oa-score-highlight mono">★ {cpuScore}</span>
        </div>
      </section>
      )}

      {/* Main Felt Card Table */}
      <section className="oa-card-table spades-oval-arena">
        {phase === 'setup' ? (
          <div
            style={{
              overflowY: 'auto',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong className="mono" style={{ color: '#34d399', fontSize: '13px' }}>
                ⚙ MATCH SETTINGS (60S TIMER • ULTIMATE +15 • STEAL CARD MODE)
              </strong>
              <button
                type="button"
                onClick={() => setPhase('playing')}
                className="oa-btn oa-btn-primary mono"
              >
                RESUME →
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div>
                <span className="mono" style={{ fontSize: '10px', color: '#94a3b8' }}>
                  1. AI DIFFICULTY
                </span>
                <div className="oa-option-row" style={{ marginTop: '4px' }}>
                  {(['easy', 'normal', 'hard'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDifficulty(lvl)}
                      className={`oa-pill-btn mono ${difficulty === lvl ? 'active' : ''}`}
                    >
                      {lvl.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mono" style={{ fontSize: '10px', color: '#94a3b8' }}>
                  2. ROUNDS / STARTING DECK
                </span>
                <div className="oa-option-row" style={{ marginTop: '4px' }}>
                  {[3, 5, 7].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setMaxRounds(r)}
                      className={`oa-pill-btn mono ${maxRounds === r ? 'active' : ''}`}
                    >
                      {r} CARDS
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mono" style={{ fontSize: '10px', color: '#fbbf24' }}>
                  3. &quot;WINNER STEALS CARD&quot; SURVIVAL MODE
                </span>
                <div className="oa-option-row" style={{ marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setWinnerStealsCardMode(false)}
                    className={`oa-pill-btn mono ${!winnerStealsCardMode ? 'active' : ''}`}
                  >
                    DISABLED (POINTS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWinnerStealsCardMode(true)}
                    className={`oa-pill-btn mono ${winnerStealsCardMode ? 'active' : ''}`}
                  >
                    ENABLED (STEAL)
                  </button>
                </div>
              </div>
            </div>

            <div>
              <span className="mono" style={{ fontSize: '10px', color: '#34d399' }}>
                4. SELECT ROUND 1 STARTER ALIEN:
              </span>
              <div className="oa-starter-grid" style={{ marginTop: '6px' }}>
                {characters.map((alien) => (
                  <button
                    key={alien.id}
                    type="button"
                    onClick={() => setSelectedStarterId(alien.id)}
                    className={`oa-starter-item ${selectedStarterId === alien.id ? 'selected' : ''}`}
                  >
                    <img src={alien.fallbackImageUrl} alt={alien.name} />
                    <span>{alien.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleStartMatch(selectedStarterId, maxRounds)}
              className="oa-btn oa-btn-primary mono"
              style={{ width: '100%', padding: '11px', fontSize: '13px' }}
            >
              ⚡ START NEW MATCH
            </button>
          </div>
        ) : phase === 'finished' ? (
          /* FINAL MATCH LEADERBOARD */
          <div style={{ margin: 'auto', width: '100%', maxWidth: '480px', textAlign: 'center', padding: '10px' }}>
            <span className="oa-badge mono">FINAL MATCH LEADERBOARD</span>
            <h2 style={{ fontSize: '24px', margin: '8px 0 4px', color: '#fbbf24' }}>
              🏆 WINNER: {leaderboardEntries[0].name.toUpperCase()}!
            </h2>

            <div className="oa-leaderboard-list">
              {leaderboardEntries.map((item, idx) => (
                <div
                  key={item.name}
                  className={`oa-leaderboard-row ${idx === 0 ? 'rank-1' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="mono" style={{ fontSize: '15px', fontWeight: 900 }}>
                      {idx === 0 ? '🥇 #1' : '🥈 #2'}
                    </span>
                    <strong style={{ fontSize: '13px', color: '#f8fafc' }}>{item.name}</strong>
                  </div>
                  <span className="oa-score-highlight mono">
                    {winnerStealsCardMode
                      ? `${item.cards} CARDS (${item.score}W)`
                      : `${item.score} WINS`}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleStartMatch()}
                className="oa-btn oa-btn-primary mono"
                style={{ padding: '10px 18px', fontSize: '12px' }}
              >
                ↻ PLAY REMATCH
              </button>
              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="oa-btn mono"
              >
                ⚙ SETTINGS
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="oa-table-hud">
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {statusBanner}
              </span>

              {phase === 'playing' || phase === 'cpu_thinking' ? (
                <span className={`oa-timer-pill mono ${turnSecondsLeft <= 10 ? 'urgent' : ''}`}>
                  ⏱ {turnSecondsLeft}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={advanceRoundAutomatically}
                  className="oa-timer-pill mono"
                >
                  NEXT IN {autoNextSeconds}s →
                </button>
              )}
            </div>

            {phase === 'round_result' && (
              <div className="oa-winner-toast mono">
                {roundWinner === 'player'
                  ? `🏆 YOU WON ROUND ${round} WITH ${selectedStat?.toUpperCase()}${
                      winnerStealsCardMode ? ' & STOLE CPU CARD!' : '!'
                    }`
                  : roundWinner === 'cpu'
                  ? `⚡ CPU WON ROUND ${round} WITH ${selectedStat?.toUpperCase()}${
                      winnerStealsCardMode ? ' & STOLE YOUR CARD!' : '!'
                    }`
                  : `🤝 ROUND ${round} TIED ON ${selectedStat?.toUpperCase()}!`}
              </div>
            )}

            <SpadesFourSeatArena
              seats={[
                {
                  id: 'player',
                  name: 'You',
                  score: playerScore,
                  cardsCount: playerHand.length,
                  avatarAlienId: currentPlayerCard?.id || 'heatblast',
                  isMe: true,
                  isTurn: currentTurn === 'player',
                  isWinner: phase === 'round_result' && roundWinner === 'player',
                  isTiedTop: phase === 'round_result' && roundWinner === 'tie',
                  winStreak: playerStreak,
                  chatBubble: playerBubble,
                  playedCard: currentPlayerCard,
                  usedUltimate: playerUltimateArmed,
                  counterBonus:
                    phase === 'round_result'
                      ? roundHistory[roundHistory.length - 1]?.entries.find(
                          (e) => e.playerId === 'player'
                        )?.counterBonus || 0
                      : 0,
                  underdogBonus:
                    phase === 'round_result'
                      ? roundHistory[roundHistory.length - 1]?.entries.find(
                          (e) => e.playerId === 'player'
                        )?.underdogBonus || 0
                      : 0,
                },
                {
                  id: 'cpu',
                  name: `CPU (${difficulty.toUpperCase()})`,
                  score: cpuScore,
                  cardsCount: cpuHand.length,
                  avatarAlienId: currentCpuCard?.id || 'vilgax',
                  isMe: false,
                  isTurn: currentTurn === 'cpu',
                  isWinner: phase === 'round_result' && roundWinner === 'cpu',
                  isTiedTop: phase === 'round_result' && roundWinner === 'tie',
                  winStreak: cpuStreak,
                  chatBubble: cpuBubble,
                  playedCard: phase === 'round_result' ? currentCpuCard : null,
                  usedUltimate: cpuUltimateArmed,
                  counterBonus:
                    phase === 'round_result'
                      ? roundHistory[roundHistory.length - 1]?.entries.find(
                          (e) => e.playerId === 'cpu'
                        )?.counterBonus || 0
                      : 0,
                  underdogBonus:
                    phase === 'round_result'
                      ? roundHistory[roundHistory.length - 1]?.entries.find(
                          (e) => e.playerId === 'cpu'
                        )?.underdogBonus || 0
                      : 0,
                },
              ]}
              isRoundResult={phase === 'round_result'}
              myActiveCard={currentPlayerCard}
              canSelectStat={phase === 'playing' && currentTurn === 'player' && !isSubmitting}
              onSelectStat={handlePlayerStatSelect}
              selectedStat={selectedStat}
              lockedStat={lockedStat}
              activeStatPool={activeStatPool}
              showUltimateControl={phase === 'playing'}
              ultimateUsed={playerUltimateUsed}
              ultimateActiveThisRound={playerUltimateArmed}
              onActivateUltimate={() => {
                if (!playerUltimateUsed && !playerUltimateArmed) {
                  setPlayerUltimateArmed(true);
                  setPlayerBubble(
                    `⚡ ULTIMATE OVERCHARGE (+${ULTIMATE_OVERCHARGE_BONUS})!`
                  );
                }
              }}
              turnPromptText={
                currentTurn === 'player'
                  ? '⚡ YOUR TURN: Tap a skill on your card below to throw it onto the table!'
                  : `🤖 CPU (${difficulty.toUpperCase()}) is choosing a skill to throw onto the table...`
              }
              winnerBannerText={
                phase === 'round_result'
                  ? roundWinner === 'player'
                    ? `🏆 YOU WON ROUND ${round} (${selectedStat?.toUpperCase()})${
                        winnerStealsCardMode ? ' & SNATCHED CPU CARD!' : '!'
                      }`
                    : roundWinner === 'cpu'
                    ? `⚡ CPU WON ROUND ${round} (${selectedStat?.toUpperCase()})${
                        winnerStealsCardMode ? ' & SNATCHED YOUR CARD!' : '!'
                      }`
                    : `🤝 ROUND ${round} TIED ON ${selectedStat?.toUpperCase()}!`
                  : null
              }
            />
          </>
        )}
      </section>

      {/* Bottom Quick Message Bar */}
      <footer className="oa-chat-bar">
        <div className="oa-quick-Install-chips">
          {QUICK_CHATS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendQuickChat(q)}
              className="oa-quick-chip"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuickChat(chatInput);
          }}
          style={{ display: 'flex', gap: '4px', flex: 1, minWidth: '110px' }}
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Message table..."
            maxLength={42}
            className="oa-input"
            style={{ padding: '4px 8px', fontSize: '11px' }}
          />
          <button type="submit" className="oa-btn oa-btn-primary mono" style={{ padding: '4px 10px' }}>
            SEND
          </button>
        </form>
      </footer>

      <CharacterCodexModal
        isOpen={codexOpen}
        onClose={() => setCodexOpen(false)}
        onSelectAlien={(alien) => {
          setSelectedStarterId(alien.id);
          handleStartMatch(alien.id, maxRounds);
        }}
        selectedAlienId={selectedStarterId}
      />
    </main>
  );
}
