'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { characters } from '../../data/characters';
import {
  CORE_SIX_STATS,
  PrivatePlayerHand,
  RoomState,
  RoomYouTubeState,
  StatKey,
} from '../../lib/types';
import { multiplayerClient } from '../../lib/multiplayerClient';
import Card, { HiddenCardBack } from '../../components/Card';
import { SpadesFourSeatArena } from '../../components/SpadesDeckFan';
import CharacterCodexModal from '../../components/CharacterCodexModal';
import YouTubeMusicBar from '../../components/YouTubeMusicBar';
import { soundEngine } from '../../lib/soundEngine';

// Self-contained per-tab player ID resolver (never throws even if lib/firebase is cached)
function resolveTabPlayerId(): string {
  if (typeof window === 'undefined') {
    return 'plr_ssr_guest';
  }
  try {
    const STORAGE_KEY = 'omnitrix_arena_tab_player_id_v2';
    let id = window.sessionStorage.getItem(STORAGE_KEY);
    if (!id) {
      const rand = Math.random().toString(36).substring(2, 9);
      const ts = Date.now().toString(36);
      id = `plr_${rand}_${ts}`;
      window.sessionStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'plr_fallback_' + Math.random().toString(36).substring(2, 9);
  }
}

const QUICK_CHATS = ['🔥 Ready!', '⚡ Play Fast!', '💪 Nice!', '😎 GG!'];

export default function MultiplayerPage() {
  const [playerId, setPlayerId] = useState<string>(() => resolveTabPlayerId());
  const [displayName, setDisplayName] = useState<string>('Player 1');
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [maxPlayersConfig, setMaxPlayersConfig] = useState<2 | 3 | 4>(2);
  const [maxRoundsConfig, setMaxRoundsConfig] = useState<number>(5);
  // Optional "Winner Steals Card" Survival Mode toggle (Selectable when creating room or in Lobby)
  const [winnerStealsCardConfig, setWinnerStealsCardConfig] = useState<boolean>(true);
  const [selectedStarterId, setSelectedStarterId] = useState<string>(characters[0].id);

  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [myHand, setMyHand] = useState<PrivatePlayerHand | null>(null);

  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [codexOpen, setCodexOpen] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');

  // 60s Turn Timer & Auto-Next-Round Countdown
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number>(60);
  const [autoNextSeconds, setAutoNextSeconds] = useState<number>(4);

  // Detect `?join=ROOMCODE` from WhatsApp / QR Code link on mount!
  useEffect(() => {
    setPlayerId(resolveTabPlayerId());
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const joinCode = (params.get('join') || '').trim().toUpperCase();
      if (joinCode && joinCode.length >= 4) {
        setRoomCodeInput(joinCode.slice(0, 6));
      }
    }
  }, []);

  useEffect(() => {
    if (!activeRoomCode || !playerId) return;
    const unsubscribe = multiplayerClient.subscribeToRoom({
      roomCode: activeRoomCode,
      playerId,
      onUpdate: ({ room: updatedRoom, myHand: updatedHand }) => {
        setRoom(updatedRoom);
        if (updatedHand) setMyHand(updatedHand);
      },
      onError: (errText) => setErrorMsg(errText),
    });
    return () => unsubscribe();
  }, [activeRoomCode, playerId]);

  // 60-second synchronized turn countdown
  useEffect(() => {
    if (!room || room.status !== 'playing') return;
    const updateClock = () => {
      const elapsedSec = Math.floor((Date.now() - (room.turnStartedAt || Date.now())) / 1000);
      const remaining = Math.max(0, (room.turnDurationSec || 60) - elapsedSec);
      setTurnSecondsLeft(remaining);
      if (remaining === 0 && (room.currentTurnPlayerId === playerId || room.hostId === playerId)) {
        multiplayerClient
          .timeoutAutoStat({ playerId, roomCode: room.roomCode })
          .then((res) => {
            if (res.room) setRoom(res.room);
            if (res.myHand) setMyHand(res.myHand);
          })
          .catch(() => {});
      }
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [room, playerId]);

  // Automatic Next-Round Transition after 4 seconds
  useEffect(() => {
    if (!room || room.status !== 'round_result') return;
    setAutoNextSeconds(4);
    const interval = setInterval(() => {
      setAutoNextSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          multiplayerClient
            .advanceRound({ playerId, roomCode: room.roomCode })
            .then((res) => {
              if (res.room) setRoom(res.room);
              if (res.myHand) setMyHand(res.myHand);
            })
            .catch(() => {});
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [room?.status, room?.roundNumber, room?.roomCode, playerId]);

  // Auto-trigger AI bot move
  useEffect(() => {
    if (
      room &&
      room.status === 'playing' &&
      room.currentTurnPlayerId.startsWith('bot_') &&
      playerId === room.hostId
    ) {
      const timer = setTimeout(() => {
        multiplayerClient
          .triggerBotTurn({ playerId, roomCode: room.roomCode })
          .then((res) => {
            if (res.room) setRoom(res.room);
            if (res.myHand) setMyHand(res.myHand);
          })
          .catch(() => {});
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [room, playerId]);

  const handleCreateRoom = async () => {
    if (isBusy) return;
    const uid = resolveTabPlayerId();
    setPlayerId(uid);
    const trimmed = displayName.trim() || 'Admin';
    setIsBusy(true);
    setErrorMsg(null);
    try {
      const res = await multiplayerClient.createRoom({
        playerId: uid,
        displayName: trimmed,
        maxPlayers: maxPlayersConfig,
        maxRounds: maxRoundsConfig,
        allowDuplicateCards: false,
        winnerStealsCardMode: winnerStealsCardConfig,
        useExtendedStats: false,
        preferredStarterAlienId: selectedStarterId,
      });
      if (res.room) setRoom(res.room);
      if (res.myHand) setMyHand(res.myHand);
      setActiveRoomCode(res.roomCode);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create room.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinRoom = async (overrideCode?: string) => {
    if (isBusy) return;
    const uid = resolveTabPlayerId();
    setPlayerId(uid);
    const trimmedName = displayName.trim() || 'Player';
    const code = (overrideCode || roomCodeInput).trim().toUpperCase();
    if (code.length < 4) {
      setErrorMsg('Enter a valid room code.');
      return;
    }
    setIsBusy(true);
    setErrorMsg(null);
    try {
      const res = await multiplayerClient.joinRoom({
        playerId: uid,
        roomCode: code,
        displayName: trimmedName,
        preferredStarterAlienId: selectedStarterId,
      });
      if (res.room) setRoom(res.room);
      if (res.myHand) setMyHand(res.myHand);
      setActiveRoomCode(code);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not join room.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleReady = async () => {
    if (!room || isBusy) return;
    const me = room.players[playerId];
    if (!me) return;
    setIsBusy(true);
    setErrorMsg(null);
    try {
      const res = await multiplayerClient.toggleReady({
        playerId,
        roomCode: room.roomCode,
        isReady: !me.isReady,
        selectedStarterAlienId: selectedStarterId,
      });
      if (res.room) setRoom(res.room);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update readiness.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleStealModeInLobby = async (enabled: boolean) => {
    if (!room || isBusy) return;
    setIsBusy(true);
    try {
      const res = await multiplayerClient.setStealMode({
        playerId,
        roomCode: room.roomCode,
        winnerStealsCardMode: enabled,
      });
      if (res.room) setRoom(res.room);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Only Host can change mode.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleActivateUltimate = async () => {
    if (!room || isBusy || room.status !== 'playing') return;
    setIsBusy(true);
    try {
      const res = await multiplayerClient.activateUltimate({
        playerId,
        roomCode: room.roomCode,
      });
      if (res.room) setRoom(res.room);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not activate Ultimate.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddSparBot = async () => {
    if (!room || isBusy) return;
    setIsBusy(true);
    setErrorMsg(null);
    try {
      const res = await multiplayerClient.addSparBot({
        playerId,
        roomCode: room.roomCode,
      });
      if (res.room) setRoom(res.room);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not add AI bot.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartMatch = async () => {
    if (!room || isBusy) return;
    setIsBusy(true);
    setErrorMsg(null);
    try {
      const res = await multiplayerClient.startMatch({
        playerId,
        roomCode: room.roomCode,
      });
      if (res.room) setRoom(res.room);
      if (res.myHand) setMyHand(res.myHand);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Cannot start match yet.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitStat = async (stat: StatKey) => {
    if (!room || isBusy || room.status !== 'playing' || room.currentTurnPlayerId !== playerId) return;
    setIsBusy(true);
    setErrorMsg(null);
    try {
      const res = await multiplayerClient.submitStat({
        playerId,
        roomCode: room.roomCode,
        selectedStat: stat,
        useUltimate: Boolean(room.players[playerId]?.ultimateActiveThisRound),
      });
      if (res.room) setRoom(res.room);
      if (res.myHand) setMyHand(res.myHand);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit stat.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdvanceRound = async () => {
    if (!room || isBusy) return;
    setIsBusy(true);
    try {
      const res = await multiplayerClient.advanceRound({
        playerId,
        roomCode: room.roomCode,
      });
      if (res.room) setRoom(res.room);
      if (res.myHand) setMyHand(res.myHand);
    } catch {
      // ignore
    } finally {
      setIsBusy(false);
    }
  };

  const handleSendChat = async (text: string) => {
    if (!room || !text.trim()) return;
    setChatInput('');
    try {
      const res = await multiplayerClient.sendMessage({
        playerId,
        roomCode: room.roomCode,
        text: text.trim(),
      });
      if (res.room) setRoom(res.room);
    } catch {
      // ignore
    }
  };

  const handleAdminChangeYouTube = async (nextYt: RoomYouTubeState | null) => {
    if (!room) return;
    try {
      const res = await multiplayerClient.setYouTubeTrack({
        playerId,
        roomCode: room.roomCode,
        youtubeState: nextYt,
      });
      if (res.room) setRoom(res.room);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Only Admin can change song.');
    }
  };

  const handleLeaveRoom = async () => {
    if (room) {
      await multiplayerClient.leaveRoom({
        playerId,
        roomCode: room.roomCode,
        permanentLeave: true,
      });
    }
    setRoom(null);
    setMyHand(null);
    setActiveRoomCode(null);
    setErrorMsg(null);
  };

  const getInviteUrl = () => {
    if (!room) return '';
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://omnitrix-arena.vercel.app';
    return `${origin}/multiplayer?join=${encodeURIComponent(room.roomCode)}`;
  };

  const copyRoomCode = () => {
    if (!room) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(room.roomCode).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyInviteLink = () => {
    const url = getInviteUrl();
    if (!url) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setCopiedInviteLink(true);
    setTimeout(() => setCopiedInviteLink(false), 2000);
  };

  const orderedPlayerIds = room
    ? room.playerOrder.filter((pid) => Boolean(room.players[pid]))
    : [];
  const isHost = Boolean(room && room.hostId === playerId);
  const canHostStart =
    orderedPlayerIds.length >= 2 &&
    orderedPlayerIds.every(
      (pid) =>
        (pid === room?.hostId || room?.players[pid]?.isReady) &&
        room?.players[pid]?.isConnected
    );

  // Sorted Final Leaderboard
  const leaderboard = room
    ? [...orderedPlayerIds]
        .map((pid) => room.players[pid])
        .sort((a, b) =>
          room.winnerStealsCardMode
            ? (b.remainingCardsCount || 0) - (a.remainingCardsCount || 0) || b.score - a.score
            : b.score - a.score
        )
    : [];

  const roundWinnerName =
    room?.status === 'round_result' && !room.lastRoundTie && room.lastRoundWinnerIds?.[0]
      ? room.players[room.lastRoundWinnerIds[0]]?.displayName
      : null;

  const inviteUrl = getInviteUrl();
  const whatsappHref = room
    ? `https://wa.me/?text=${encodeURIComponent(
        `⚡ Join my Omnitrix Arena card table! Room Code: ${room.roomCode} — Tap to join directly: ${inviteUrl}`
      )}`
    : '#';

  return (
    <main className="oa-viewport-shell">
      {/* Structured Clean Top Bar with Right-Side Corner Symbol Controls (▦, ✕) */}
      <header className="oa-topbar oa-topbar-slim">
        <div className="oa-nav-group oa-nav-nowrap">
          <span className="oa-brand-title oa-brand-compact">
            {room ? '⚡' : 'OMNITRIX TABLE'}
          </span>
          {room && (
            <button
              type="button"
              onClick={copyRoomCode}
              className="oa-badge oa-badge-slim mono"
              title="Tap to copy Room Code"
            >
              #{room.roomCode} {copiedCode ? '✓' : '📋'}
            </button>
          )}
          {room && room.status !== 'lobby' && room.status !== 'ready_check' && (
            <span className="oa-badge oa-badge-slim mono">
              {room.winnerStealsCardMode
                ? `R${room.roundNumber} • STEAL`
                : `R${room.roundNumber}/${room.maxRounds}`}
            </span>
          )}
        </div>

        <div className="oa-nav-group">
          {room && (
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="oa-icon-btn"
              title="Share QR Code & WhatsApp Invite"
            >
              📲
            </button>
          )}
          <button
            type="button"
            onClick={() => setCodexOpen(true)}
            className="oa-icon-btn"
            title="Inspect Alien Deck"
          >
            ▦
          </button>
          {room ? (
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="oa-icon-btn exit"
              title="Exit Room"
            >
              ✕
            </button>
          ) : (
            <Link href="/" className="oa-icon-btn exit" title="Back to Modes">
              ✕
            </Link>
          )}
        </div>
      </header>

      {/* Admin-Only YouTube Song Bar + Draggable Floating TV */}
      {room && (
        <YouTubeMusicBar
          youtubeState={room.youtubeState}
          isAdmin={isHost}
          onAdminChangeTrack={handleAdminChangeYouTube}
        />
      )}

      {errorMsg && (
        <div
          className="oa-topbar"
          style={{ borderColor: '#f87171', background: 'rgba(127, 29, 29, 0.7)' }}
        >
          <span style={{ fontSize: '11px', color: '#fecaca' }}>⚠ {errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="oa-icon-btn exit"
          >
            ✕
          </button>
        </div>
      )}

      {/* Player Seats Strip with Highlighted Scores & Upper Profile Speech Bubbles */}
      {room && (room.status === 'lobby' || room.status === 'ready_check' || room.status === 'finished') && (
        <section className="oa-seats-strip">
          {orderedPlayerIds.map((pid) => {
            const p = room.players[pid];
            const isTurn = room.currentTurnPlayerId === pid && room.status === 'playing';
            const isMe = pid === playerId;
            return (
              <div
                key={pid}
                className={`oa-seat-pod ${isTurn || p.isReady ? 'active-turn' : ''}`}
              >
                {p.lastMessage && <div className="oa-speech-bubble">{p.lastMessage}</div>}
                <div className="oa-seat-avatar">{p.displayName.slice(0, 2).toUpperCase()}</div>
                <div className="oa-seat-meta">
                  <span className="oa-seat-name">
                    {p.displayName} {isMe ? '(You)' : ''} {room.hostId === pid ? '👑' : ''}
                  </span>
                  <span className="oa-seat-sub mono">
                    {room.status === 'lobby' || room.status === 'ready_check'
                      ? p.isReady || room.hostId === pid
                        ? '● READY'
                        : '○ WAITING'
                      : room.winnerStealsCardMode
                      ? `🃏 ${p.remainingCardsCount} CARDS`
                      : isTurn
                      ? '⚡ TURN'
                      : 'READY'}
                  </span>
                </div>
                <span className="oa-score-highlight mono">★ {p.score}</span>
              </div>
            );
          })}
        </section>
      )}

      {/* Main Structured Felt Card Table */}
      <section className="oa-card-table spades-oval-arena">
        {/* VIEW A: CREATE OR JOIN ROOM */}
        {!room && (
          <div
            style={{
              margin: 'auto',
              width: '100%',
              maxWidth: '480px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '6px',
              overflowY: 'auto',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <span className="oa-badge mono">2–4 PLAYER LIVE TABLE</span>
              <h2 style={{ margin: '4px 0 2px', fontSize: '19px' }}>ENTER MULTIPLAYER ARENA</h2>
            </div>

            <div>
              <label className="mono" style={{ fontSize: '10px', color: '#34d399' }}>
                YOUR DISPLAY NAME
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={18}
                className="oa-input"
                style={{ marginTop: '4px' }}
              />
            </div>

            {/* If opened via WhatsApp / QR Invite Link (?join=CODE), highlight instant 1-tap join! */}
            {roomCodeInput.length >= 4 && (
              <div
                className="oa-panel"
                style={{
                  border: '2px solid #34d399',
                  background: 'rgba(16, 185, 129, 0.14)',
                  textAlign: 'center',
                }}
              >
                <div className="mono" style={{ fontSize: '11px', color: '#34d399', marginBottom: '6px' }}>
                  📲 INVITE CODE DETECTED: <strong>{roomCodeInput}</strong>
                </div>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleJoinRoom(roomCodeInput)}
                  className="oa-btn oa-btn-primary mono"
                  style={{ width: '100%', padding: '11px', fontSize: '13px' }}
                >
                  {isBusy ? 'JOINING...' : `⚡ TAP TO JOIN TABLE ${roomCodeInput} NOW`}
                </button>
              </div>
            )}

            <div className="oa-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <span className="mono" style={{ fontSize: '9px', color: '#94a3b8' }}>
                    PLAYERS
                  </span>
                  <div className="oa-option-row" style={{ marginTop: '3px' }}>
                    {([2, 3, 4] as const).map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setMaxPlayersConfig(cnt)}
                        className={`oa-pill-btn mono ${maxPlayersConfig === cnt ? 'active' : ''}`}
                      >
                        {cnt}P
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <span className="mono" style={{ fontSize: '9px', color: '#94a3b8' }}>
                    ROUNDS
                  </span>
                  <div className="oa-option-row" style={{ marginTop: '3px' }}>
                    {[3, 5, 7].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setMaxRoundsConfig(r)}
                        className={`oa-pill-btn mono ${maxRoundsConfig === r ? 'active' : ''}`}
                      >
                        {r}R
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Optional "Winner Steals Card" Survival Mode Toggle */}
              <div>
                <span className="mono" style={{ fontSize: '9px', color: '#fbbf24' }}>
                  GAME RULE: &quot;WINNER STEALS CARD&quot; SURVIVAL MODE
                </span>
                <div className="oa-option-row" style={{ marginTop: '3px' }}>
                  <button
                    type="button"
                    onClick={() => setWinnerStealsCardConfig(false)}
                    className={`oa-pill-btn mono ${!winnerStealsCardConfig ? 'active' : ''}`}
                  >
                    DISABLED (POINTS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWinnerStealsCardConfig(true)}
                    className={`oa-pill-btn mono ${winnerStealsCardConfig ? 'active' : ''}`}
                  >
                    ENABLED (STEAL CARDS)
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={handleCreateRoom}
                className="oa-btn oa-btn-primary mono"
                style={{ width: '100%', padding: '10px', fontSize: '12px' }}
              >
                {isBusy ? 'CREATING...' : `＋ CREATE ${maxPlayersConfig}-PLAYER ROOM (ADMIN)`}
              </button>
            </div>

            <div className="oa-panel" style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                placeholder="ENTER ROOM CODE"
                maxLength={6}
                className="oa-input mono"
                style={{ letterSpacing: '0.15em', fontWeight: 800 }}
              />
              <button
                type="button"
                disabled={isBusy || roomCodeInput.trim().length < 4}
                onClick={() => handleJoinRoom()}
                className="oa-btn oa-btn-cyan mono"
                style={{ padding: '0 18px' }}
              >
                JOIN →
              </button>
            </div>
          </div>
        )}

        {/* VIEW B: LOBBY READY SCREEN WITH WHATSAPP & QR CODE ONE-TAP INVITE */}
        {room && (room.status === 'lobby' || room.status === 'ready_check') && (
          <div
            style={{
              margin: 'auto',
              width: '100%',
              maxWidth: '560px',
              textAlign: 'center',
              padding: '8px',
              overflowY: 'auto',
            }}
          >
            <span className="oa-badge mono">
              PLAYERS IN LOBBY: {orderedPlayerIds.length} / {room.maxPlayers}
            </span>
            <h2 style={{ fontSize: '22px', margin: '6px 0 4px' }}>
              ROOM CODE: <span style={{ color: '#34d399' }}>{room.roomCode}</span>
            </h2>

            {/* WhatsApp & QR Code One-Tap Room Invite Strip */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                margin: '10px 0 12px',
              }}
            >
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="oa-whatsapp-btn mono"
              >
                💬 SHARE VIA WHATSAPP
              </a>
              <button
                type="button"
                onClick={copyInviteLink}
                className="oa-btn oa-btn-cyan mono"
              >
                {copiedInviteLink ? '✓ LINK COPIED' : '🔗 COPY INVITE LINK'}
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="oa-btn mono"
              >
                📱 SHOW QR CODE
              </button>
            </div>

            {/* Host Toggle for "Winner Steals Card" Survival Mode inside Lobby */}
            <div
              className="oa-panel"
              style={{
                padding: '10px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span className="mono" style={{ fontSize: '11px', color: '#fbbf24' }}>
                🃏 &quot;WINNER STEALS CARD&quot; MODE:{' '}
                <strong>{room.winnerStealsCardMode ? 'ENABLED' : 'DISABLED'}</strong>
              </span>
              {isHost && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleStealModeInLobby(false)}
                    className={`oa-pill-btn mono ${!room.winnerStealsCardMode ? 'active' : ''}`}
                    style={{ padding: '5px 10px', fontSize: '10px' }}
                  >
                    POINTS MODE
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleStealModeInLobby(true)}
                    className={`oa-pill-btn mono ${room.winnerStealsCardMode ? 'active' : ''}`}
                    style={{ padding: '5px 10px', fontSize: '10px' }}
                  >
                    STEAL CARDS
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {!isHost && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleToggleReady}
                  className="oa-btn oa-btn-cyan mono"
                  style={{ padding: '12px 22px', fontSize: '13px' }}
                >
                  {room.players[playerId]?.isReady ? '✕ CANCEL READY' : '✓ I AM READY'}
                </button>
              )}

              {isHost && orderedPlayerIds.length < room.maxPlayers && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleAddSparBot}
                  className="oa-btn mono"
                  style={{ padding: '12px 16px', fontSize: '12px', color: '#34d399' }}
                >
                  🤖 + ADD AI BOT
                </button>
              )}

              {isHost && (
                <button
                  type="button"
                  disabled={isBusy || !canHostStart}
                  onClick={handleStartMatch}
                  className="oa-btn oa-btn-primary mono"
                  style={{ padding: '12px 24px', fontSize: '13px' }}
                >
                  {canHostStart ? '⚡ START GAME PLAY' : 'WAITING FOR PLAYERS TO READY...'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* VIEW C: FINAL LEADERBOARD WHEN MATCH ENDS */}
        {room && room.status === 'finished' && (
          <div
            style={{
              margin: 'auto',
              width: '100%',
              maxWidth: '500px',
              textAlign: 'center',
              padding: '10px',
            }}
          >
            <span className="oa-badge mono">FINAL MATCH LEADERBOARD</span>
            <h2 style={{ fontSize: '23px', margin: '8px 0 4px', color: '#fbbf24' }}>
              🏆 CHAMPION: {leaderboard[0]?.displayName || 'DRAW'}!
            </h2>

            <div className="oa-leaderboard-list">
              {leaderboard.map((p, idx) => (
                <div
                  key={p.id}
                  className={`oa-leaderboard-row ${idx === 0 ? 'rank-1' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="mono" style={{ fontSize: '15px', fontWeight: 900 }}>
                      {idx === 0
                        ? '🥇 #1'
                        : idx === 1
                        ? '🥈 #2'
                        : idx === 2
                        ? '🥉 #3'
                        : `#${idx + 1}`}
                    </span>
                    <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
                      {p.displayName} {p.id === playerId ? '(You)' : ''}
                    </strong>
                  </div>
                  <span className="oa-score-highlight mono">
                    {room.winnerStealsCardMode
                      ? `${p.remainingCardsCount} CARDS (${p.score}W)`
                      : `${p.score} WINS`}
                  </span>
                </div>
              ))}
            </div>

            {isHost && (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleStartMatch}
                className="oa-btn oa-btn-primary mono"
                style={{ padding: '11px 24px', fontSize: '13px' }}
              >
                ↻ PLAY REMATCH
              </button>
            )}
          </div>
        )}

        {/* VIEW D: ACTIVE BATTLE TABLE */}
        {room &&
          (room.status === 'playing' ||
            room.status === 'round_resolving' ||
            room.status === 'round_result') && (
            <>
              <div className="oa-table-hud">
                <span style={{ fontSize: '11px', fontWeight: 700 }}>
                  {room.status === 'playing'
                    ? room.currentTurnPlayerId === playerId
                      ? 'YOUR TURN: Tap one of your 4 skills!'
                      : `Waiting for ${room.players[room.currentTurnPlayerId]?.displayName}...`
                    : room.lastRoundTie
                    ? `ROUND ${room.roundNumber} TIED ON ${room.selectedStat?.toUpperCase()}!`
                    : `🏆 ${roundWinnerName} WON ROUND ${room.roundNumber} (${room.selectedStat?.toUpperCase()})!`}
                </span>

                {room.status === 'playing' ? (
                  <span className={`oa-timer-pill mono ${turnSecondsLeft <= 10 ? 'urgent' : ''}`}>
                    ⏱ {turnSecondsLeft}s
                  </span>
                ) : (
                  <button type="button" onClick={handleAdvanceRound} className="oa-timer-pill mono">
                    NEXT IN {autoNextSeconds}s →
                  </button>
                )}
              </div>



              <SpadesFourSeatArena
                seats={orderedPlayerIds.map((pid) => {
                  const p = room.players[pid];
                  const isMe = pid === playerId;
                  const comp = room.lastRoundComparison?.find((c) => c.playerId === pid);
                  const isRevealed = room.status === 'round_result';
                  const playedCard = isMe
                    ? isRevealed && comp
                      ? comp.alien
                      : myHand?.activeCard || null
                    : isRevealed
                    ? comp?.alien || p.publicRevealedCard || null
                    : null;

                  return {
                    id: pid,
                    name: p.displayName,
                    score: p.score,
                    cardsCount: p.remainingCardsCount,
                    avatarAlienId:
                      (isMe ? myHand?.activeCard?.id : null) ||
                      p.selectedStarterAlienId ||
                      'heatblast',
                    isMe,
                    isTurn: room.currentTurnPlayerId === pid,
                    isWinner: isRevealed && Boolean(comp?.isWinner),
                    isTiedTop: isRevealed && Boolean(comp?.isTiedTop),
                    winStreak: p.winStreak || 0,
                    chatBubble: p.lastMessage,
                    playedCard,
                    usedUltimate: isRevealed
                      ? Boolean(comp?.usedUltimate)
                      : Boolean(p.ultimateActiveThisRound),
                    counterBonus: comp?.counterBonus || 0,
                    underdogBonus: comp?.underdogBonus || 0,
                  };
                })}
                isRoundResult={room.status === 'round_result'}
                myActiveCard={myHand?.activeCard || null}
                canSelectStat={
                  room.status === 'playing' &&
                  room.currentTurnPlayerId === playerId &&
                  !isBusy
                }
                onSelectStat={handleSubmitStat}
                selectedStat={room.selectedStat || null}
                lockedStat={room.lockedStat || null}
                activeStatPool={room.activeStatPool}
                showUltimateControl={room.status === 'playing'}
                ultimateUsed={Boolean(room.players[playerId]?.ultimateUsed)}
                ultimateActiveThisRound={Boolean(
                  room.players[playerId]?.ultimateActiveThisRound
                )}
                onActivateUltimate={handleActivateUltimate}
                turnPromptText={
                  room.currentTurnPlayerId === playerId
                    ? '⚡ YOUR TURN: Tap a skill on your card below to throw it onto the table!'
                    : `⏳ Waiting for ${
                        room.players[room.currentTurnPlayerId]?.displayName || 'Opponent'
                      } to choose a skill & throw card...`
                }
                winnerBannerText={
                  room.status === 'round_result'
                    ? room.lastRoundTie
                      ? `⚡ ROUND ${room.roundNumber} TIED ON ${room.selectedStat?.toUpperCase()}!`
                      : `🏆 ${roundWinnerName?.toUpperCase()} WON ROUND ${
                          room.roundNumber
                        } (${room.selectedStat?.toUpperCase()})${
                          room.winnerStealsCardMode && (room.lastRoundStolenCount || 0) > 0
                            ? ` & SNATCHED ${room.lastRoundStolenCount} CARD(S)!`
                            : '!'
                        }`
                    : null
                }
              />
            </>
          )}
      </section>

      {/* Bottom Quick Message Bar */}
      {room && (
        <footer className="oa-chat-bar">
          <div className="oa-quick-Install-chips">
            {QUICK_CHATS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSendChat(q)}
                className="oa-quick-chip"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat(chatInput);
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
      )}

      {/* QR Code & WhatsApp One-Tap Room Invite Modal */}
      {room && showQrModal && (
        <div className="oa-modal-backdrop" onClick={() => setShowQrModal(false)}>
          <div
            className="oa-modal-content"
            style={{ maxWidth: '380px', padding: '18px', textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong className="mono" style={{ color: '#34d399', fontSize: '14px' }}>
                📲 SCAN OR SHARE TABLE INVITE
              </strong>
              <button type="button" onClick={() => setShowQrModal(false)} className="oa-icon-btn">
                ✕
              </button>
            </div>

            <div
              style={{
                background: '#ffffff',
                padding: '12px',
                borderRadius: '14px',
                display: 'inline-block',
                margin: '4px auto 12px',
              }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  inviteUrl
                )}`}
                alt={`QR Code for Room ${room.roomCode}`}
                width={190}
                height={190}
                style={{ display: 'block' }}
              />
            </div>

            <div className="mono" style={{ fontSize: '18px', fontWeight: 900, color: '#34d399', marginBottom: '6px' }}>
              CODE: {room.roomCode}
            </div>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 14px', wordBreak: 'break-all' }}>
              {inviteUrl}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="oa-whatsapp-btn mono"
                style={{ justifyContent: 'center' }}
              >
                💬 SEND INVITE ON WHATSAPP
              </a>
              <button
                type="button"
                onClick={copyInviteLink}
                className="oa-btn oa-btn-cyan mono"
                style={{ width: '100%', padding: '10px' }}
              >
                {copiedInviteLink ? '✓ INVITE LINK COPIED' : '🔗 COPY DIRECT JOIN LINK'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CharacterCodexModal
        isOpen={codexOpen}
        onClose={() => setCodexOpen(false)}
        onSelectAlien={(alien) => setSelectedStarterId(alien.id)}
        selectedAlienId={selectedStarterId}
      />
    </main>
  );
}
