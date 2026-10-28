import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db, firebaseReady } from './firebase';
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
} from './gameEngine';
import {
  ALL_FIFTEEN_STATS,
  CORE_SIX_STATS,
  PrivatePlayerHand,
  RoomState,
  RoomYouTubeState,
  StatKey,
} from './types';

export interface MultiplayerActionResponse {
  success: boolean;
  roomCode: string;
  room?: RoomState;
  myHand?: PrivatePlayerHand | null;
  error?: string;
}

class MultiplayerClientService {
  private broadcastChannel: BroadcastChannel | null = null;
  private lastKnownUpdatedAt = 0;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('omnitrix_arena_room_sync_v6');
      } catch {
        this.broadcastChannel = null;
      }
    }
  }

  private notifyChannel(roomCode: string) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'ROOM_UPDATED',
          roomCode,
          ts: Date.now(),
        });
      } catch {}
    }
  }

  private async runFirestoreAction(
    action: string,
    payload: Record<string, unknown>
  ): Promise<MultiplayerActionResponse> {
    if (!db) throw new Error('Firestore not initialized');
    const playerId = String(payload.playerId || '').trim();
    let roomCode = String(payload.roomCode || payload.roomId || '').trim().toUpperCase();

    if (action === 'create_room') {
      const bundle = createInitialRoomBundle({
        hostId: playerId,
        hostDisplayName: String(payload.displayName || 'Admin'),
        maxPlayers: (Number(payload.maxPlayers) || 2) as 2 | 3 | 4,
        maxRounds: Math.min(15, Math.max(1, Number(payload.maxRounds) || 5)),
        allowDuplicateCards: Boolean(payload.allowDuplicateCards),
        winnerStealsCardMode: Boolean(payload.winnerStealsCardMode),
        activeStatPool: payload.useExtendedStats ? ALL_FIFTEEN_STATS : CORE_SIX_STATS,
        preferredStarterAlienId: (payload.preferredStarterAlienId as string) || null,
        turnDurationSec: 60,
      });
      roomCode = bundle.room.roomCode;
      await this.saveBundleToFirestore(roomCode, bundle);
      this.notifyChannel(roomCode);
      const sanitized = getSanitizedClientState(bundle, playerId);
      return { success: true, roomCode, room: sanitized.room, myHand: sanitized.myHand };
    }

    const bundle = await this.loadBundleFromFirestore(roomCode);
    if (!bundle) {
      throw new Error(`Room '${roomCode}' not found.`);
    }

    let updated = bundle;
    switch (action) {
      case 'join_room':
        updated = joinRoomLobby(bundle, {
          playerId,
          displayName: String(payload.displayName || 'Player'),
          preferredStarterAlienId: (payload.preferredStarterAlienId as string) || null,
        });
        break;
      case 'toggle_ready':
        updated = setPlayerReadyState(bundle, {
          playerId,
          isReady: Boolean(payload.isReady),
          selectedStarterAlienId: (payload.selectedStarterAlienId as string) || undefined,
        });
        break;
      case 'set_steal_mode':
        updated = setRoomStealMode(bundle, {
          requesterId: playerId,
          winnerStealsCardMode: Boolean(payload.winnerStealsCardMode),
        });
        break;
      case 'activate_ultimate':
        updated = activateUltimateOvercharge(bundle, {
          playerId,
        });
        break;
      case 'start_match':
        updated = startMatch(bundle, { requesterId: playerId });
        break;
      case 'submit_stat':
        updated = submitStatAndResolveRound(bundle, {
          requesterId: playerId,
          selectedStat: String(payload.selectedStat) as StatKey,
          useUltimate: Boolean(payload.useUltimate),
        });
        break;
      case 'timeout_auto_stat':
      case 'trigger_bot_turn': {
        if (bundle.room.status === 'playing') {
          const activeId = bundle.room.currentTurnPlayerId;
          const activeCard = (bundle.secretDecks[activeId] || [])[0];
          if (activeCard) {
            const chosenStat = selectCpuAttribute({
              cpuCard: activeCard,
              difficulty: 'normal',
              availableStats: bundle.room.activeStatPool,
            });
            updated = submitStatAndResolveRound(bundle, {
              requesterId: activeId,
              selectedStat: chosenStat,
            });
          }
        }
        break;
      }
      case 'advance_round':
        updated = advanceToNextRound(bundle, { requesterId: playerId });
        break;
      case 'send_message':
        updated = postPlayerChatMessage(bundle, {
          playerId,
          text: String(payload.text || ''),
        });
        break;
      case 'set_youtube':
        updated = updateRoomYouTubeState(bundle, {
          requesterId: playerId,
          youtubeState: (payload.youtubeState || null) as RoomYouTubeState | null,
        });
        break;
      case 'leave_room':
        updated = handlePlayerLeaveOrDisconnect(bundle, {
          playerId,
          permanentLeave: Boolean(payload.permanentLeave ?? true),
        });
        break;
      case 'add_bot': {
        const currentCount = Object.keys(bundle.room.players).length;
        const botNames = ['Albedo-AI', 'Vilgax-Bot', 'Kevin-11'];
        const botId = `bot_${currentCount}_${Math.random().toString(36).substring(2, 6)}`;
        updated = joinRoomLobby(bundle, {
          playerId: botId,
          displayName: botNames[(currentCount - 1) % botNames.length] || `OmniBot-${currentCount}`,
        });
        updated = setPlayerReadyState(updated, { playerId: botId, isReady: true });
        break;
      }
    }

    await this.saveBundleToFirestore(roomCode, updated);
    this.notifyChannel(roomCode);
    const sanitized = getSanitizedClientState(updated, playerId);
    return { success: true, roomCode, room: sanitized.room, myHand: sanitized.myHand };
  }

  private async loadBundleFromFirestore(roomCode: string): Promise<ServerRoomBundle | null> {
    if (!db) return null;
    const [roomSnap, vaultSnap] = await Promise.all([
      getDoc(doc(db, 'rooms', roomCode)),
      getDoc(doc(db, 'rooms', roomCode, 'serverSecrets', 'deckState')),
    ]);
    if (!roomSnap.exists()) return null;
    const room = roomSnap.data() as RoomState;
    const vault = vaultSnap.exists()
      ? (vaultSnap.data() as { secretDecks?: Record<string, any[]>; drawPile?: any[] })
      : {};
    return {
      room,
      secretDecks: vault.secretDecks || {},
      drawPile: vault.drawPile || [],
    };
  }

  private async saveBundleToFirestore(roomCode: string, bundle: ServerRoomBundle): Promise<void> {
    if (!db) return;
    const sanitized = getSanitizedClientState(bundle, '');
    const writes: Promise<void>[] = [
      setDoc(doc(db, 'rooms', roomCode), sanitized.room),
      setDoc(doc(db, 'rooms', roomCode, 'serverSecrets', 'deckState'), {
        secretDecks: bundle.secretDecks,
        drawPile: bundle.drawPile,
        updatedAt: bundle.room.updatedAt,
      }),
    ];
    for (const pid of Object.keys(bundle.room.players)) {
      const pView = getSanitizedClientState(bundle, pid);
      if (pView.myHand) {
        writes.push(
          setDoc(doc(db, 'rooms', roomCode, 'privateHands', pid), pView.myHand)
        );
      }
    }
    await Promise.all(writes);
  }

  private async dispatchAction(
    action: string,
    payload: Record<string, unknown>
  ): Promise<MultiplayerActionResponse> {
    if (firebaseReady && db) {
      try {
        return await this.runFirestoreAction(action, payload);
      } catch (err) {
        console.warn('Firestore fallback to local API:', err);
      }
    }
    const res = await fetch('/api/multiplayer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Multiplayer request failed.');
    }
    if (data.roomCode) this.notifyChannel(data.roomCode);
    return data;
  }

  createRoom(params: Record<string, unknown>) { return this.dispatchAction('create_room', params); }
  joinRoom(params: Record<string, unknown>) { return this.dispatchAction('join_room', params); }
  toggleReady(params: Record<string, unknown>) { return this.dispatchAction('toggle_ready', params); }
  setStealMode(params: Record<string, unknown>) { return this.dispatchAction('set_steal_mode', params); }
  activateUltimate(params: Record<string, unknown>) { return this.dispatchAction('activate_ultimate', params); }
  startMatch(params: Record<string, unknown>) { return this.dispatchAction('start_match', params); }
  submitStat(params: Record<string, unknown>) { return this.dispatchAction('submit_stat', params); }
  timeoutAutoStat(params: Record<string, unknown>) { return this.dispatchAction('timeout_auto_stat', params); }
  triggerBotTurn(params: Record<string, unknown>) { return this.dispatchAction('trigger_bot_turn', params); }
  advanceRound(params: Record<string, unknown>) { return this.dispatchAction('advance_round', params); }
  sendMessage(params: Record<string, unknown>) { return this.dispatchAction('send_message', params); }
  setYouTubeTrack(params: Record<string, unknown>) { return this.dispatchAction('set_youtube', params); }
  addSparBot(params: Record<string, unknown>) { return this.dispatchAction('add_bot', params); }
  async leaveRoom(params: Record<string, unknown>) {
    try { await this.dispatchAction('leave_room', params); } catch {}
  }

  subscribeToRoom(params: {
    roomCode: string;
    playerId: string;
    onUpdate: (state: { room: RoomState; myHand: PrivatePlayerHand | null }) => void;
    onError: (errMessage: string) => void;
  }): () => void {
    const { roomCode, playerId, onUpdate, onError } = params;
    let isCancelled = false;

    if (firebaseReady && db) {
      let latestRoom: RoomState | null = null;
      let latestHand: PrivatePlayerHand | null = null;

      const unsubRoom = onSnapshot(
        doc(db, 'rooms', roomCode),
        (snap) => {
          if (isCancelled) return;
          if (!snap.exists()) {
            onError('Room no longer exists.');
            return;
          }
          latestRoom = snap.data() as RoomState;
          onUpdate({ room: latestRoom, myHand: latestHand });
        },
        (err) => {
          console.warn('Firestore room listener warning:', err.message);
        }
      );

      const unsubHand = onSnapshot(
        doc(db, 'rooms', roomCode, 'privateHands', playerId),
        (snap) => {
          if (isCancelled) return;
          if (snap.exists()) {
            latestHand = snap.data() as PrivatePlayerHand;
            if (latestRoom) {
              onUpdate({ room: latestRoom, myHand: latestHand });
            }
          }
        },
        () => {}
      );

      return () => {
        isCancelled = true;
        unsubRoom();
        unsubHand();
      };
    }

    const fetchLatestLocal = async () => {
      if (isCancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(
          `/api/multiplayer?roomCode=${encodeURIComponent(roomCode)}&playerId=${encodeURIComponent(playerId)}&since=${this.lastKnownUpdatedAt}`,
          { cache: 'no-store' }
        );
        if (res.status === 304) return;
        if (!res.ok) return;
        const data = await res.json();
        if (!isCancelled && data.room) {
          this.lastKnownUpdatedAt = data.room.updatedAt || Date.now();
          onUpdate({ room: data.room, myHand: data.myHand || null });
        }
      } catch {}
    };

    fetchLatestLocal();
    const intervalId = setInterval(fetchLatestLocal, 4000);
    const handleBroadcast = (ev: MessageEvent) => {
      if (ev.data && ev.data.roomCode === roomCode) fetchLatestLocal();
    };
    if (this.broadcastChannel) {
      this.broadcastChannel.addEventListener('message', handleBroadcast);
    }

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
      if (this.broadcastChannel) {
        this.broadcastChannel.removeEventListener('message', handleBroadcast);
      }
    };
  }
}

export const multiplayerClient = new MultiplayerClientService();
