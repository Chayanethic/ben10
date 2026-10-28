import { NextRequest, NextResponse } from 'next/server';
import {
  activateUltimateOvercharge,
  advanceToNextRound,
  createInitialRoomBundle,
  getSanitizedClientState,
  handlePlayerLeaveOrDisconnect,
  joinRoomLobby,
  postPlayerChatMessage,
  selectCpuAttribute,
  ServerRoomBundle,
  setPlayerReadyState,
  setRoomStealMode,
  startMatch,
  submitStatAndResolveRound,
  updateRoomYouTubeState,
} from '../../../lib/gameEngine';
import { ALL_FIFTEEN_STATS, CORE_SIX_STATS, RoomYouTubeState, StatKey } from '../../../lib/types';

const globalForRooms = globalThis as unknown as {
  __omnitrixRooms?: Map<string, ServerRoomBundle>;
};

if (!globalForRooms.__omnitrixRooms) {
  globalForRooms.__omnitrixRooms = new Map<string, ServerRoomBundle>();
}

const roomStore = globalForRooms.__omnitrixRooms;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomCode = (searchParams.get('roomCode') || '').trim().toUpperCase();
  const playerId = (searchParams.get('playerId') || '').trim();
  const since = Number(searchParams.get('since') || 0);

  if (!roomCode) {
    return NextResponse.json({ error: 'Room code is required.' }, { status: 400 });
  }

  let bundle = roomStore.get(roomCode);
  if (!bundle) {
    return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  }

  if (Date.now() > bundle.room.expiresAt) {
    roomStore.delete(roomCode);
    return NextResponse.json({ error: 'Room has expired.' }, { status: 410 });
  }

  const now = Date.now();
  if (
    bundle.room.status === 'playing' &&
    now - bundle.room.turnStartedAt >= (bundle.room.turnDurationSec || 60) * 1000 + 800
  ) {
    const activeId = bundle.room.currentTurnPlayerId;
    const activeDeck = bundle.secretDecks[activeId] || [];
    const activeCard = activeDeck[0];
    if (activeCard) {
      const autoStat = selectCpuAttribute({
        cpuCard: activeCard,
        difficulty: 'normal',
        availableStats: bundle.room.activeStatPool,
      });
      bundle = submitStatAndResolveRound(bundle, {
        requesterId: activeId,
        selectedStat: autoStat,
        now,
      });
      roomStore.set(roomCode, bundle);
    }
  }

  if (since > 0 && bundle.room.updatedAt <= since) {
    return new NextResponse(null, { status: 304 });
  }

  const sanitized = getSanitizedClientState(bundle, playerId);
  return NextResponse.json({
    success: true,
    room: sanitized.room,
    myHand: sanitized.myHand,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || '').trim();
    const playerId = String(body.playerId || '').trim();
    const roomCode = String(body.roomCode || body.roomId || '')
      .trim()
      .toUpperCase();

    if (!playerId) {
      return NextResponse.json({ error: 'Player identity (playerId) is required.' }, { status: 401 });
    }

    if (action === 'create_room') {
      const displayName = String(body.displayName || '').trim();
      const maxPlayers = (Number(body.maxPlayers) || 2) as 2 | 3 | 4;
      const maxRounds = Math.min(15, Math.max(1, Number(body.maxRounds) || 5));
      const allowDuplicateCards = Boolean(body.allowDuplicateCards);
      const winnerStealsCardMode = Boolean(body.winnerStealsCardMode);
      const useExtendedStats = Boolean(body.useExtendedStats);
      const preferredStarterAlienId = body.preferredStarterAlienId || null;

      let bundle = createInitialRoomBundle({
        hostId: playerId,
        hostDisplayName: displayName,
        maxPlayers,
        maxRounds,
        allowDuplicateCards,
        winnerStealsCardMode,
        activeStatPool: useExtendedStats ? ALL_FIFTEEN_STATS : CORE_SIX_STATS,
        preferredStarterAlienId,
        turnDurationSec: 60,
      });

      while (roomStore.has(bundle.room.roomCode)) {
        bundle = createInitialRoomBundle({
          hostId: playerId,
          hostDisplayName: displayName,
          maxPlayers,
          maxRounds,
          allowDuplicateCards,
          winnerStealsCardMode,
          activeStatPool: useExtendedStats ? ALL_FIFTEEN_STATS : CORE_SIX_STATS,
          preferredStarterAlienId,
          turnDurationSec: 60,
        });
      }

      roomStore.set(bundle.room.roomCode, bundle);
      const sanitized = getSanitizedClientState(bundle, playerId);
      return NextResponse.json({
        success: true,
        roomCode: bundle.room.roomCode,
        room: sanitized.room,
        myHand: sanitized.myHand,
      });
    }

    if (!roomCode) {
      return NextResponse.json({ error: 'Room code is required.' }, { status: 400 });
    }

    const existingBundle = roomStore.get(roomCode);
    if (!existingBundle) {
      return NextResponse.json({ error: `Room '${roomCode}' not found.` }, { status: 404 });
    }

    let updatedBundle = existingBundle;

    switch (action) {
      case 'join_room': {
        updatedBundle = joinRoomLobby(existingBundle, {
          playerId,
          displayName: String(body.displayName || ''),
          preferredStarterAlienId: body.preferredStarterAlienId,
        });
        break;
      }

      case 'toggle_ready': {
        updatedBundle = setPlayerReadyState(existingBundle, {
          playerId,
          isReady: Boolean(body.isReady),
          selectedStarterAlienId: body.selectedStarterAlienId,
        });
        break;
      }

      case 'set_steal_mode': {
        updatedBundle = setRoomStealMode(existingBundle, {
          requesterId: playerId,
          winnerStealsCardMode: Boolean(body.winnerStealsCardMode),
        });
        break;
      }

      case 'activate_ultimate': {
        updatedBundle = activateUltimateOvercharge(existingBundle, {
          playerId,
        });
        break;
      }

      case 'start_match': {
        updatedBundle = startMatch(existingBundle, {
          requesterId: playerId,
        });
        break;
      }

      case 'submit_stat': {
        const selectedStat = String(body.selectedStat || '') as StatKey;
        updatedBundle = submitStatAndResolveRound(existingBundle, {
          requesterId: playerId,
          selectedStat,
          useUltimate: Boolean(body.useUltimate),
        });
        break;
      }

      case 'timeout_auto_stat':
      case 'trigger_bot_turn': {
        if (existingBundle.room.status === 'playing') {
          const activeId = existingBundle.room.currentTurnPlayerId;
          const activeDeck = existingBundle.secretDecks[activeId] || [];
          const activeCard = activeDeck[0];
          if (activeCard) {
            const chosenStat = selectCpuAttribute({
              cpuCard: activeCard,
              difficulty: 'normal',
              availableStats: existingBundle.room.activeStatPool,
            });
            updatedBundle = submitStatAndResolveRound(existingBundle, {
              requesterId: activeId,
              selectedStat: chosenStat,
            });
          }
        }
        break;
      }

      case 'advance_round': {
        updatedBundle = advanceToNextRound(existingBundle, {
          requesterId: playerId,
        });
        break;
      }

      case 'send_message': {
        updatedBundle = postPlayerChatMessage(existingBundle, {
          playerId,
          text: String(body.text || ''),
        });
        break;
      }

      case 'set_youtube': {
        const ytState = (body.youtubeState || null) as RoomYouTubeState | null;
        updatedBundle = updateRoomYouTubeState(existingBundle, {
          requesterId: playerId,
          youtubeState: ytState,
        });
        break;
      }

      case 'leave_room': {
        updatedBundle = handlePlayerLeaveOrDisconnect(existingBundle, {
          playerId,
          permanentLeave: Boolean(body.permanentLeave ?? true),
        });
        break;
      }

      case 'add_bot': {
        if (existingBundle.room.hostId !== playerId) {
          throw new Error('Only the room host can add an AI spar partner to the room.');
        }
        const currentCount = Object.keys(existingBundle.room.players).length;
        if (currentCount >= existingBundle.room.maxPlayers) {
          throw new Error('Room is already full.');
        }
        const botIndex = currentCount;
        const botNames = ['Albedo-AI', 'Vilgax-Bot', 'Kevin-11'];
        const botId = `bot_${botIndex}_${Math.random().toString(36).substring(2, 6)}`;
        updatedBundle = joinRoomLobby(existingBundle, {
          playerId: botId,
          displayName: botNames[(botIndex - 1) % botNames.length] || `OmniBot-${botIndex}`,
        });
        updatedBundle = setPlayerReadyState(updatedBundle, {
          playerId: botId,
          isReady: true,
        });
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action '${action}'.` }, { status: 400 });
    }

    roomStore.set(roomCode, updatedBundle);
    const sanitized = getSanitizedClientState(updatedBundle, playerId);
    return NextResponse.json({
      success: true,
      roomCode,
      room: sanitized.room,
      myHand: sanitized.myHand,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
