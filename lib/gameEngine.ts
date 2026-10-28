import {
  Alien,
  ALL_FIFTEEN_STATS,
  CORE_SIX_STATS,
  CpuDifficulty,
  PlayerChatMessage,
  PlayerState,
  PrivatePlayerHand,
  RoomState,
  RoomYouTubeState,
  RoundComparisonEntry,
  RoundHistoryEntry,
  StatKey,
  TieRule,
  ULTIMATE_OVERCHARGE_BONUS,
  ELEMENTAL_COUNTER_BONUS,
  UNDERDOG_STREAK_BONUS,
} from './types';
import { characters } from '../data/characters';

export interface ServerRoomBundle {
  room: RoomState;
  secretDecks: Record<string, Alien[]>;
  drawPile: Alien[];
}

export function shuffleDeck<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

export function generateRoomCode(rng: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return code;
}

export function dealFairHands(params: {
  playerIds: string[];
  cardsPerPlayer: number;
  allowDuplicateCards?: boolean;
  preferredStarters?: Record<string, string | null | undefined>;
  pool?: readonly Alien[];
  rng?: () => number;
}): {
  hands: Record<string, Alien[]>;
  drawPile: Alien[];
} {
  const {
    playerIds,
    cardsPerPlayer,
    preferredStarters = {},
    pool = characters,
    rng = Math.random,
  } = params;

  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new Error('Invalid player count: must be 2, 3, or 4 players.');
  }

  // Deduplicate pool by character ID and name so every single card in the match is 100% unique
  const seenIds = new Set<string>();
  const uniquePool: Alien[] = [];
  for (const c of pool) {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      uniquePool.push(c);
    }
  }

  // Maximum unique cards per player when dividing the deck equally among all players
  const maxUniquePerPlayer = Math.floor(uniquePool.length / playerIds.length);
  const effectiveCardsPerPlayer = Math.max(
    1,
    Math.min(cardsPerPlayer, maxUniquePerPlayer)
  );

  const hands: Record<string, Alien[]> = {};
  playerIds.forEach((pid) => {
    hands[pid] = [];
  });

  const available = shuffleDeck(uniquePool, rng);
  const usedIds = new Set<string>();

  for (const pid of playerIds) {
    const starterId = preferredStarters[pid];
    if (starterId && !usedIds.has(starterId)) {
      const foundIdx = available.findIndex((a) => a.id === starterId);
      if (foundIdx !== -1) {
        const [chosen] = available.splice(foundIdx, 1);
        hands[pid].push(chosen);
        usedIds.add(chosen.id);
      }
    }
  }

  for (let r = 0; r < effectiveCardsPerPlayer; r++) {
    for (const pid of playerIds) {
      if (hands[pid].length > r) continue;
      // Find next unused card so no two players EVER receive the same card
      while (available.length > 0) {
        const candidate = available.shift()!;
        if (!usedIds.has(candidate.id)) {
          usedIds.add(candidate.id);
          hands[pid].push(candidate);
          break;
        }
      }
    }
  }

  return { hands, drawPile: available };
}

/**
 * Evaluates a round comparison across 2, 3, or 4 players, applying the +15
 * Ultimate Omnitrix Overcharge bonus for any player who armed `usedUltimate: true`!
 */
/**
 * Elemental Counter Matrix (Anti-Snowball Defender Advantage):
 * When a defending player's alien element naturally counters the active turn-holder's
 * alien element, the defender receives +10 (ELEMENTAL_COUNTER_BONUS) in that clash!
 */
const ELEMENT_COUNTERS: Record<string, string[]> = {
  Ice: ['Fire', 'Plasma', 'Plant'],
  Water: ['Fire', 'Magma', 'Sand'],
  Fire: ['Plant', 'Nature', 'Ice', 'Bio'],
  Plant: ['Water', 'Earth', 'Crystal'],
  Electric: ['Water', 'Tech', 'Mech', 'Metal', 'Flight'],
  Tech: ['Magic', 'Psychic', 'Time', 'Gravity'],
  Crystal: ['Electric', 'Laser', 'Energy', 'Light'],
  Strength: ['Crystal', 'Tech', 'Armor', 'Ice'],
  Sound: ['Crystal', 'Glass', 'Shadow', 'Stealth'],
  Shadow: ['Psychic', 'Cosmic', 'Light', 'Energy'],
  Cosmic: ['Time', 'Gravity', 'Strength', 'Brawler'],
  Speed: ['Strength', 'Brawler', 'Heavy', 'Sound'],
};

export function getElementalCounterBonus(
  defenderElement?: string,
  attackerElement?: string
): number {
  if (!defenderElement || !attackerElement) return 0;
  const defNorm = defenderElement.trim();
  const atkNorm = attackerElement.trim();
  if (defNorm === atkNorm) return 0;
  for (const [key, targets] of Object.entries(ELEMENT_COUNTERS)) {
    if (defNorm.toLowerCase().includes(key.toLowerCase())) {
      if (targets.some((t) => atkNorm.toLowerCase().includes(t.toLowerCase()))) {
        return ELEMENTAL_COUNTER_BONUS;
      }
    }
  }
  return 0;
}

export function evaluateRoundComparison(params: {
  activePlayerId: string;
  selectedStat: StatKey;
  playerCards: Array<{
    playerId: string;
    displayName: string;
    alien: Alien;
    usedUltimate?: boolean;
  }>;
  attackerWinStreak?: number;
  enableCounterBonuses?: boolean;
  tieRule?: TieRule;
}): {
  highestValue: number;
  winnerIds: string[];
  resolvedWinnerId: string | null;
  nextTurnPlayerId: string;
  isTie: boolean;
  entries: RoundComparisonEntry[];
} {
  const {
    activePlayerId,
    selectedStat,
    playerCards,
    attackerWinStreak = 0,
    enableCounterBonuses = false,
  } = params;

  if (!playerCards || playerCards.length < 2) {
    throw new Error('At least 2 players are required to compare attributes.');
  }

  if (!ALL_FIFTEEN_STATS.includes(selectedStat)) {
    throw new Error(`Invalid attribute selected: ${String(selectedStat)}`);
  }

  const attackerEntry = playerCards.find((p) => p.playerId === activePlayerId);
  const attackerElement = attackerEntry?.alien?.element || '';

  let highestValue = -Infinity;
  const computed = playerCards.map((entry) => {
    const baseVal = entry.alien.stats[selectedStat];
    if (typeof baseVal !== 'number' || Number.isNaN(baseVal)) {
      throw new Error(`Missing numeric stat '${selectedStat}' on alien '${entry.alien.id}'`);
    }
    const usedUltimate = Boolean(entry.usedUltimate);
    const ultimateBonus = usedUltimate ? ULTIMATE_OVERCHARGE_BONUS : 0;
    const isDefender = entry.playerId !== activePlayerId;
    const counterBonus =
      enableCounterBonuses && isDefender
        ? getElementalCounterBonus(entry.alien.element, attackerElement)
        : 0;
    const underdogBonus =
      enableCounterBonuses && isDefender && attackerWinStreak >= 2
        ? UNDERDOG_STREAK_BONUS
        : 0;
    const totalVal = baseVal + ultimateBonus + counterBonus + underdogBonus;
    if (totalVal > highestValue) {
      highestValue = totalVal;
    }
    return {
      ...entry,
      baseStatValue: baseVal,
      ultimateBonus,
      counterBonus,
      underdogBonus,
      statValue: totalVal,
      usedUltimate,
    };
  });

  const winnerIds = computed
    .filter((entry) => entry.statValue === highestValue)
    .map((entry) => entry.playerId);

  const isTie = winnerIds.length > 1;
  const resolvedWinnerId = isTie ? null : winnerIds[0];

  let nextTurnPlayerId = activePlayerId;
  if (!isTie && resolvedWinnerId) {
    nextTurnPlayerId = resolvedWinnerId;
  } else if (isTie && !playerCards.some((p) => p.playerId === activePlayerId)) {
    nextTurnPlayerId = winnerIds[0];
  }

  const entries: RoundComparisonEntry[] = computed.map((entry) => ({
    playerId: entry.playerId,
    displayName: entry.displayName,
    alien: entry.alien,
    baseStatValue: entry.baseStatValue,
    ultimateBonus: entry.ultimateBonus,
    counterBonus: entry.counterBonus,
    underdogBonus: entry.underdogBonus,
    statValue: entry.statValue,
    usedUltimate: entry.usedUltimate,
    isWinner: entry.statValue === highestValue && !isTie,
    isTiedTop: entry.statValue === highestValue && isTie,
  }));

  return {
    highestValue,
    winnerIds,
    resolvedWinnerId,
    nextTurnPlayerId,
    isTie,
    entries,
  };
}

export function selectCpuAttribute(params: {
  cpuCard: Alien;
  difficulty: CpuDifficulty;
  availableStats?: StatKey[];
  lockedStat?: StatKey | null;
  rng?: () => number;
}): StatKey {
  const {
    cpuCard,
    difficulty,
    availableStats: rawStats = CORE_SIX_STATS,
    lockedStat = null,
    rng = Math.random,
  } = params;
  const availableStats =
    lockedStat && rawStats.length > 1
      ? rawStats.filter((s) => s !== lockedStat)
      : rawStats;

  if (availableStats.length === 0) {
    throw new Error('No available stats for CPU selection.');
  }

  const ranked = [...availableStats].sort(
    (a, b) => cpuCard.stats[b] - cpuCard.stats[a]
  );

  if (difficulty === 'hard') {
    const bestVal = cpuCard.stats[ranked[0]];
    const topTied = ranked.filter((s) => cpuCard.stats[s] === bestVal);
    return topTied[Math.floor(rng() * topTied.length)];
  }

  if (difficulty === 'normal') {
    const topSlice = ranked.slice(0, Math.min(3, ranked.length));
    const roll = rng();
    if (roll < 0.55) return topSlice[0];
    if (roll < 0.85 && topSlice[1]) return topSlice[1];
    return topSlice[topSlice.length - 1];
  }

  const randomIndex = Math.floor(rng() * availableStats.length);
  return availableStats[randomIndex];
}

export function createInitialRoomBundle(params: {
  hostId: string;
  hostDisplayName: string;
  maxPlayers?: 2 | 3 | 4;
  maxRounds?: number;
  allowDuplicateCards?: boolean;
  winnerStealsCardMode?: boolean;
  tieRule?: TieRule;
  activeStatPool?: StatKey[];
  preferredStarterAlienId?: string | null;
  turnDurationSec?: number;
  roomCode?: string;
  now?: number;
  rng?: () => number;
}): ServerRoomBundle {
  const {
    hostId,
    hostDisplayName,
    maxPlayers = 2,
    maxRounds = 5,
    allowDuplicateCards = false,
    winnerStealsCardMode = false,
    tieRule = 'keep_active',
    activeStatPool = CORE_SIX_STATS,
    preferredStarterAlienId = null,
    turnDurationSec = 60,
    now = Date.now(),
    rng = Math.random,
  } = params;

  const trimmedName = (hostDisplayName || '').trim();
  if (!hostId) throw new Error('Host player ID is required.');
  if (!trimmedName) throw new Error('Display name is required.');
  if (![2, 3, 4].includes(maxPlayers)) {
    throw new Error('Room size must be 2, 3, or 4 players.');
  }
  if (maxRounds < 1 || maxRounds > 60) {
    throw new Error('Max cards/rounds must be between 1 and 60.');
  }

  const roomCode = (params.roomCode || generateRoomCode(rng)).toUpperCase();

  // Host is automatically Ready on creation so Admin can click START GAME PLAY as soon as challengers ready up!
  const hostPlayer: PlayerState = {
    id: hostId,
    displayName: trimmedName,
    selectedStarterAlienId: preferredStarterAlienId,
    isReady: true,
    score: 0,
    publicRevealedCard: null,
    isConnected: true,
    lastHeartbeatAt: now,
    remainingCardsCount: 0,
    isHost: true,
    lastMessage: 'Admin Created Table 👑',
    lastMessageAt: now,
    ultimateUsed: false,
    ultimateActiveThisRound: false,
  };

  const room: RoomState = {
    id: roomCode,
    roomCode,
    hostId,
    maxPlayers,
    status: 'lobby',
    players: {
      [hostId]: hostPlayer,
    },
    playerOrder: [hostId],
    currentTurnPlayerId: hostId,
    turnStartedAt: now,
    turnDurationSec,
    roundNumber: 1,
    maxRounds,
    allowDuplicateCards,
    winnerStealsCardMode,
    tieRule,
    activeStatPool,
    selectedStat: null,
    winnerId: null,
    lastRoundWinnerIds: [],
    lastRoundTie: false,
    lastRoundStolenCount: 0,
    lastRoundComparison: [],
    roundHistory: [],
    messages: [],
    youtubeState: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 1000 * 60 * 60 * 2,
  };

  return {
    room,
    secretDecks: {},
    drawPile: [],
  };
}

export function joinRoomLobby(
  bundle: ServerRoomBundle,
  params: {
    playerId: string;
    displayName: string;
    preferredStarterAlienId?: string | null;
    now?: number;
  }
): ServerRoomBundle {
  const { playerId, displayName, preferredStarterAlienId = null, now = Date.now() } = params;
  const trimmedName = (displayName || '').trim();
  if (!playerId) throw new Error('Player ID is required.');
  if (!trimmedName) throw new Error('Display name is required.');

  const { room } = bundle;
  if (now > room.expiresAt) {
    throw new Error('Room has expired.');
  }

  if (room.players[playerId]) {
    const existing = room.players[playerId];
    const updatedPlayers = {
      ...room.players,
      [playerId]: {
        ...existing,
        displayName: trimmedName || existing.displayName,
        selectedStarterAlienId:
          preferredStarterAlienId !== undefined
            ? preferredStarterAlienId
            : existing.selectedStarterAlienId,
        isConnected: true,
        lastHeartbeatAt: now,
      },
    };
    return {
      ...bundle,
      room: {
        ...room,
        players: updatedPlayers,
        updatedAt: now,
      },
    };
  }

  if (room.status !== 'lobby' && room.status !== 'ready_check') {
    throw new Error('Cannot join: match is already in progress or finished.');
  }

  const currentCount = Object.keys(room.players).length;
  if (currentCount >= room.maxPlayers) {
    throw new Error(`Room is full (${room.maxPlayers}/${room.maxPlayers} players).`);
  }

  const newPlayer: PlayerState = {
    id: playerId,
    displayName: trimmedName,
    selectedStarterAlienId: preferredStarterAlienId,
    isReady: false,
    score: 0,
    publicRevealedCard: null,
    isConnected: true,
    lastHeartbeatAt: now,
    remainingCardsCount: 0,
    isHost: false,
    lastMessage: 'Joined Table ⚡',
    lastMessageAt: now,
    ultimateUsed: false,
    ultimateActiveThisRound: false,
  };

  const nextOrder = room.playerOrder.includes(playerId)
    ? room.playerOrder
    : [...room.playerOrder, playerId];

  return {
    ...bundle,
    room: {
      ...room,
      players: {
        ...room.players,
        [playerId]: newPlayer,
      },
      playerOrder: nextOrder,
      updatedAt: now,
    },
  };
}

export function setPlayerReadyState(
  bundle: ServerRoomBundle,
  params: {
    playerId: string;
    isReady: boolean;
    selectedStarterAlienId?: string | null;
    now?: number;
  }
): ServerRoomBundle {
  const { playerId, isReady, selectedStarterAlienId, now = Date.now() } = params;
  const { room } = bundle;

  if (room.status !== 'lobby' && room.status !== 'ready_check') {
    throw new Error('Cannot change readiness after match has started.');
  }

  const player = room.players[playerId];
  if (!player) {
    throw new Error('Player is not in this room.');
  }

  const updatedPlayers: Record<string, PlayerState> = {
    ...room.players,
    [playerId]: {
      ...player,
      isReady: Boolean(isReady),
      selectedStarterAlienId:
        selectedStarterAlienId !== undefined
          ? selectedStarterAlienId
          : player.selectedStarterAlienId,
      isConnected: true,
      lastHeartbeatAt: now,
      lastMessage: isReady ? 'Ready to Battle! 🔥' : 'Not Ready',
      lastMessageAt: now,
    },
  };

  const allPlayers = Object.values(updatedPlayers);
  const allReady =
    allPlayers.length >= 2 && allPlayers.every((p) => p.isReady && p.isConnected);

  return {
    ...bundle,
    room: {
      ...room,
      status: allReady ? 'ready_check' : 'lobby',
      players: updatedPlayers,
      updatedAt: now,
    },
  };
}

/**
 * Toggles the "Winner Steals Card" Survival Mode setting in the lobby (Host only).
 */
export function setRoomStealMode(
  bundle: ServerRoomBundle,
  params: {
    requesterId: string;
    winnerStealsCardMode: boolean;
    now?: number;
  }
): ServerRoomBundle {
  const { requesterId, winnerStealsCardMode, now = Date.now() } = params;
  const { room } = bundle;
  if (requesterId !== room.hostId) {
    throw new Error('Only the room Admin/Host can change game mode settings.');
  }
  return {
    ...bundle,
    room: {
      ...room,
      winnerStealsCardMode: Boolean(winnerStealsCardMode),
      updatedAt: now,
    },
  };
}

/**
 * Arms a player's 1x-per-match "Ultimate Omnitrix Overcharge" (+15 stat boost) for the current round.
 */
export function activateUltimateOvercharge(
  bundle: ServerRoomBundle,
  params: {
    playerId: string;
    now?: number;
  }
): ServerRoomBundle {
  const { playerId, now = Date.now() } = params;
  const { room } = bundle;

  if (room.status !== 'playing') {
    throw new Error('Ultimate Overcharge can only be activated during an active round.');
  }

  const player = room.players[playerId];
  if (!player) {
    throw new Error('Player is not in this room.');
  }

  if (player.ultimateUsed) {
    throw new Error('You have already used your 1× Ultimate Omnitrix Overcharge this match!');
  }

  if (player.ultimateActiveThisRound) {
    return bundle;
  }

  const updatedPlayers: Record<string, PlayerState> = {
    ...room.players,
    [playerId]: {
      ...player,
      ultimateActiveThisRound: true,
      lastMessage: '⚡ ULTIMATE OVERCHARGE (+15)!',
      lastMessageAt: now,
    },
  };

  return {
    ...bundle,
    room: {
      ...room,
      players: updatedPlayers,
      updatedAt: now,
    },
  };
}

export function postPlayerChatMessage(
  bundle: ServerRoomBundle,
  params: {
    playerId: string;
    text: string;
    now?: number;
  }
): ServerRoomBundle {
  const { playerId, text, now = Date.now() } = params;
  const { room } = bundle;
  const player = room.players[playerId];
  if (!player) {
    throw new Error('Player is not in this room.');
  }
  const cleanText = (text || '').trim().slice(0, 64);
  if (!cleanText) {
    return bundle;
  }

  const msg: PlayerChatMessage = {
    id: `msg_${now}_${Math.random().toString(36).slice(2, 6)}`,
    playerId,
    displayName: player.displayName,
    text: cleanText,
    timestamp: now,
  };

  const updatedPlayers: Record<string, PlayerState> = {
    ...room.players,
    [playerId]: {
      ...player,
      lastMessage: cleanText,
      lastMessageAt: now,
    },
  };

  return {
    ...bundle,
    room: {
      ...room,
      players: updatedPlayers,
      messages: [...(room.messages || []).slice(-19), msg],
      updatedAt: now,
    },
  };
}

export function updateRoomYouTubeState(
  bundle: ServerRoomBundle,
  params: {
    requesterId: string;
    youtubeState: RoomYouTubeState | null;
    now?: number;
  }
): ServerRoomBundle {
  const { requesterId, youtubeState, now = Date.now() } = params;
  const { room } = bundle;

  if (requesterId !== room.hostId) {
    throw new Error('Only the room Admin/Host can change or stop the shared YouTube track.');
  }

  return {
    ...bundle,
    room: {
      ...room,
      youtubeState: youtubeState
        ? {
            ...youtubeState,
            updatedAt: now,
          }
        : null,
      updatedAt: now,
    },
  };
}

export function handlePlayerLeaveOrDisconnect(
  bundle: ServerRoomBundle,
  params: {
    playerId: string;
    permanentLeave?: boolean;
    now?: number;
  }
): ServerRoomBundle {
  const { playerId, permanentLeave = false, now = Date.now() } = params;
  const { room, secretDecks } = bundle;

  if (!room.players[playerId]) {
    return bundle;
  }

  if (permanentLeave && (room.status === 'lobby' || room.status === 'ready_check')) {
    const nextPlayers = { ...room.players };
    delete nextPlayers[playerId];
    const nextOrder = room.playerOrder.filter((id) => id !== playerId);
    const nextHostId =
      room.hostId === playerId ? nextOrder[0] || '' : room.hostId;
    if (nextHostId && nextPlayers[nextHostId]) {
      nextPlayers[nextHostId] = { ...nextPlayers[nextHostId], isHost: true, isReady: true };
    }
    return {
      ...bundle,
      room: {
        ...room,
        hostId: nextHostId,
        players: nextPlayers,
        playerOrder: nextOrder,
        currentTurnPlayerId: nextHostId,
        status: 'lobby',
        updatedAt: now,
      },
    };
  }

  const updatedPlayers: Record<string, PlayerState> = {
    ...room.players,
    [playerId]: {
      ...room.players[playerId],
      isConnected: false,
      isReady: false,
      lastHeartbeatAt: now,
    },
  };

  const connectedOrder = room.playerOrder.filter(
    (id) => updatedPlayers[id]?.isConnected
  );

  let nextHostId = room.hostId;
  if (room.hostId === playerId && connectedOrder.length > 0) {
    nextHostId = connectedOrder[0];
    updatedPlayers[nextHostId] = {
      ...updatedPlayers[nextHostId],
      isHost: true,
    };
  }

  let nextStatus = room.status;
  let nextWinnerId = room.winnerId || null;
  let nextTurnId = room.currentTurnPlayerId;

  if (
    (room.status === 'playing' || room.status === 'round_result') &&
    connectedOrder.length < 2
  ) {
    nextStatus = 'finished';
    nextWinnerId = connectedOrder[0] || null;
  } else if (room.currentTurnPlayerId === playerId && connectedOrder.length >= 2) {
    nextTurnId = connectedOrder[0];
  }

  return {
    room: {
      ...room,
      hostId: nextHostId,
      players: updatedPlayers,
      status: nextStatus,
      winnerId: nextWinnerId,
      currentTurnPlayerId: nextTurnId,
      turnStartedAt: now,
      updatedAt: now,
    },
    secretDecks,
    drawPile: bundle.drawPile,
  };
}

export function startMatch(
  bundle: ServerRoomBundle,
  params: {
    requesterId: string;
    pool?: readonly Alien[];
    now?: number;
    rng?: () => number;
  }
): ServerRoomBundle {
  const { requesterId, pool = characters, now = Date.now(), rng = Math.random } = params;
  const { room } = bundle;

  if (requesterId !== room.hostId) {
    throw new Error('Only the room host can start the match.');
  }

  if (room.status !== 'lobby' && room.status !== 'ready_check' && room.status !== 'finished') {
    throw new Error('Match has already started.');
  }

  const activePlayerIds = room.playerOrder.filter(
    (pid) => room.players[pid] && room.players[pid].isConnected
  );

  if (activePlayerIds.length < 2) {
    throw new Error('At least 2 connected players are required to start.');
  }

  // Only check that non-host players are Ready (pressing Start Match by Host implicitly confirms Host is Ready!)
  const unready = activePlayerIds.filter(
    (pid) => pid !== room.hostId && !room.players[pid].isReady
  );
  if (unready.length > 0 && room.status !== 'finished') {
    throw new Error('Cannot start match until every player in the lobby is Ready.');
  }

  const preferredStarters: Record<string, string | null | undefined> = {};
  activePlayerIds.forEach((pid) => {
    preferredStarters[pid] = room.players[pid].selectedStarterAlienId;
  });

  // If maxRounds was configured as a Total Deck Size (e.g. 24, 36, 48, 60) or exceeds per-player capacity,
  // divide equally by activePlayerIds.length so total cards are split evenly across all players!
  const maxPossiblePerPlayer = Math.floor(pool.length / activePlayerIds.length);
  const cardsPerPlayer =
    room.totalDeckCards && room.totalDeckCards >= activePlayerIds.length * 2
      ? Math.min(maxPossiblePerPlayer, Math.floor(room.totalDeckCards / activePlayerIds.length))
      : Math.min(maxPossiblePerPlayer, room.maxRounds);

  const { hands, drawPile } = dealFairHands({
    playerIds: activePlayerIds,
    cardsPerPlayer,
    allowDuplicateCards: false,
    preferredStarters,
    pool,
    rng,
  });

  const updatedPlayers: Record<string, PlayerState> = {};
  for (const pid of activePlayerIds) {
    updatedPlayers[pid] = {
      ...room.players[pid],
      isReady: true,
      score: 0,
      publicRevealedCard: null,
      remainingCardsCount: hands[pid].length,
      lastMessage: 'Match Started! ⚡',
      lastMessageAt: now,
      ultimateUsed: false,
      ultimateActiveThisRound: false,
    };
  }

  const firstTurnPlayerId = activePlayerIds[0];

  return {
    room: {
      ...room,
      status: 'playing',
      players: updatedPlayers,
      playerOrder: activePlayerIds,
      currentTurnPlayerId: firstTurnPlayerId,
      turnStartedAt: now,
      roundNumber: 1,
      totalDeckCards: cardsPerPlayer * activePlayerIds.length,
      selectedStat: null,
      winnerId: null,
      lastRoundWinnerIds: [],
      lastRoundTie: false,
      lastRoundStolenCount: 0,
      lastRoundComparison: [],
      roundHistory: [],
      updatedAt: now,
    },
    secretDecks: hands,
    drawPile,
  };
}

export function submitStatAndResolveRound(
  bundle: ServerRoomBundle,
  params: {
    requesterId: string;
    selectedStat: StatKey;
    useUltimate?: boolean;
    now?: number;
  }
): ServerRoomBundle {
  const { requesterId, selectedStat, useUltimate = false, now = Date.now() } = params;
  const { room, secretDecks } = bundle;

  if (room.status !== 'playing') {
    throw new Error(`Cannot submit attribute when room status is '${room.status}'.`);
  }

  if (!room.players[requesterId]) {
    throw new Error('Invalid player: you are not a participant in this room.');
  }

  if (room.currentTurnPlayerId !== requesterId) {
    throw new Error('Permission denied: it is not your turn to choose the attribute.');
  }

  if (!room.activeStatPool.includes(selectedStat)) {
    throw new Error(`Attribute '${selectedStat}' is not enabled in this room's stat pool.`);
  }



  const activePlayerIds = room.playerOrder.filter(
    (pid) =>
      room.players[pid] &&
      room.players[pid].isConnected &&
      (secretDecks[pid] || []).length > 0
  );

  if (activePlayerIds.length < 2) {
    throw new Error('Not enough active players with cards to resolve round.');
  }

  const playerCards: Array<{
    playerId: string;
    displayName: string;
    alien: Alien;
    usedUltimate: boolean;
  }> = [];

  for (const pid of activePlayerIds) {
    const deck = secretDecks[pid] || [];
    const currentCard = deck[0];
    if (!currentCard) {
      throw new Error(`Deck exhausted for player ${pid}.`);
    }
    const pState = room.players[pid];
    const armedUltimate =
      !pState.ultimateUsed &&
      (Boolean(pState.ultimateActiveThisRound) || (pid === requesterId && Boolean(useUltimate)));

    playerCards.push({
      playerId: pid,
      displayName: pState.displayName,
      alien: currentCard,
      usedUltimate: armedUltimate,
    });
  }

  const attackerWinStreak = room.players[requesterId]?.winStreak || 0;
  const comparison = evaluateRoundComparison({
    activePlayerId: requesterId,
    selectedStat,
    playerCards,
    attackerWinStreak,
    tieRule: room.tieRule,
  });

  const stolenCount =
    room.winnerStealsCardMode && !comparison.isTie && comparison.resolvedWinnerId
      ? activePlayerIds.length - 1
      : 0;

  const updatedPlayers: Record<string, PlayerState> = { ...room.players };
  for (const entry of comparison.entries) {
    const p = updatedPlayers[entry.playerId];
    const ultTag = entry.usedUltimate ? ` [⚡ULT +${ULTIMATE_OVERCHARGE_BONUS}]` : '';
    const counterTag = entry.counterBonus ? ` [🔥COUNTER +${entry.counterBonus}]` : '';
    const underdogTag = entry.underdogBonus ? ` [🛡️STREAK-BREAKER +${entry.underdogBonus}]` : '';
    const stealTag =
      entry.isWinner && stolenCount > 0 ? ` + Stole ${stolenCount} Card(s)!` : '';

    updatedPlayers[entry.playerId] = {
      ...p,
      score: entry.isWinner ? p.score + 1 : p.score,
      winStreak: entry.isWinner ? (p.winStreak || 0) + 1 : 0,
      publicRevealedCard: entry.alien,
      ultimateUsed: p.ultimateUsed || entry.usedUltimate,
      ultimateActiveThisRound: false,
      lastMessage: entry.isWinner
        ? `Won ${selectedStat.toUpperCase()} (${entry.statValue})${ultTag}${counterTag}${underdogTag}${stealTag} 🏆`
        : entry.isTiedTop
        ? `Tied ${selectedStat.toUpperCase()} (${entry.statValue})${ultTag} ⚡`
        : `${entry.alien.name}: ${entry.statValue}${ultTag}`,
      lastMessageAt: now,
    };
  }

  const historyItem: RoundHistoryEntry = {
    roundNumber: room.roundNumber,
    activePlayerId: requesterId,
    selectedStat,
    highestValue: comparison.highestValue,
    winnerIds: comparison.winnerIds,
    resolvedWinnerId: comparison.resolvedWinnerId,
    isTie: comparison.isTie,
    stolenCardCount: stolenCount,
    entries: comparison.entries,
    timestamp: now,
  };

  return {
    room: {
      ...room,
      status: 'round_result',
      players: updatedPlayers,
      currentTurnPlayerId: comparison.nextTurnPlayerId,
      turnStartedAt: now,
      selectedStat,
      lastRoundWinnerIds: comparison.winnerIds,
      lastRoundTie: comparison.isTie,
      lastRoundStolenCount: stolenCount,
      lastRoundComparison: comparison.entries,
      roundHistory: [...room.roundHistory, historyItem],
      updatedAt: now,
    },
    secretDecks,
    drawPile: bundle.drawPile,
  };
}

/**
 * Advances from `round_result` to the next round (`playing`) or `finished`.
 * Supports BOTH:
 * 1. Standard Fixed-Round Mode (`winnerStealsCardMode === false`)
 * 2. Optional "Winner Steals Card" Survival Mode (`winnerStealsCardMode === true`), where the
 *    round winner captures all defeated opponents' played cards into the bottom of their deck!
 */
export function advanceToNextRound(
  bundle: ServerRoomBundle,
  params: {
    requesterId: string;
    pool?: readonly Alien[];
    now?: number;
    rng?: () => number;
  }
): ServerRoomBundle {
  const { requesterId, pool = characters, now = Date.now(), rng = Math.random } = params;
  const { room, secretDecks } = bundle;

  if (room.status === 'playing' || room.status === 'finished') {
    return bundle;
  }

  if (room.status !== 'round_result') {
    throw new Error(`Cannot advance round from status '${room.status}'.`);
  }

  if (!room.players[requesterId]) {
    throw new Error('Only room participants can advance to the next round.');
  }

  const activePlayerIds = room.playerOrder.filter(
    (pid) => room.players[pid] && room.players[pid].isConnected
  );

  // Branch A: "Winner Steals Card" Survival Mode
  if (room.winnerStealsCardMode) {
    const winnerId =
      !room.lastRoundTie && room.lastRoundWinnerIds?.length === 1
        ? room.lastRoundWinnerIds[0]
        : null;

    const nextDecks: Record<string, Alien[]> = {};
    const capturedCards: Alien[] = [];

    for (const pid of activePlayerIds) {
      const currentDeck = [...(secretDecks[pid] || [])];
      if (currentDeck.length === 0) {
        nextDecks[pid] = [];
        continue;
      }
      const playedCard = currentDeck.shift()!;
      if (winnerId) {
        if (pid === winnerId) {
          // Winner keeps their own winning card at the bottom of their deck
          currentDeck.push(playedCard);
        } else {
          // Loser's card is captured by the winner!
          capturedCards.push(playedCard);
        }
      } else {
        // On a tie, each player cycles their played card to the bottom of their own deck
        currentDeck.push(playedCard);
      }
      nextDecks[pid] = currentDeck;
    }

    if (winnerId && nextDecks[winnerId]) {
      nextDecks[winnerId].push(...capturedCards);
    }

    const updatedPlayers: Record<string, PlayerState> = { ...room.players };
    for (const pid of activePlayerIds) {
      updatedPlayers[pid] = {
        ...updatedPlayers[pid],
        publicRevealedCard: null,
        remainingCardsCount: (nextDecks[pid] || []).length,
        ultimateActiveThisRound: false,
      };
    }

    const playersStillHoldingCards = activePlayerIds.filter(
      (pid) => (nextDecks[pid] || []).length > 0
    );

    // Match ends when 1 player holds all cards (others have 0 cards left) or maxRounds safety cap is reached
    if (playersStillHoldingCards.length <= 1 || room.roundNumber >= 60) {
      const matchWinnerId =
        playersStillHoldingCards[0] ||
        [...activePlayerIds].sort(
          (a, b) =>
            (updatedPlayers[b].remainingCardsCount || 0) -
            (updatedPlayers[a].remainingCardsCount || 0)
        )[0] ||
        null;

      return {
        room: {
          ...room,
          status: 'finished',
          players: updatedPlayers,
          winnerId: matchWinnerId,
          updatedAt: now,
        },
        secretDecks: nextDecks,
        drawPile: bundle.drawPile,
      };
    }

    // Ensure nextTurnPlayerId still has cards
    let nextTurnId = room.currentTurnPlayerId;
    if (!playersStillHoldingCards.includes(nextTurnId)) {
      nextTurnId = playersStillHoldingCards[0];
    }

    return {
      room: {
        ...room,
        status: 'playing',
        players: updatedPlayers,
        currentTurnPlayerId: nextTurnId,
        roundNumber: room.roundNumber + 1,
        turnStartedAt: now,
        lockedStat: null,
        selectedStat: null,
        lastRoundWinnerIds: [],
        lastRoundTie: false,
        lastRoundStolenCount: 0,
        lastRoundComparison: [],
        updatedAt: now,
      },
      secretDecks: nextDecks,
      drawPile: bundle.drawPile,
    };
  }

  // Branch B: Standard Fixed-Round Mode
  if (room.roundNumber >= room.maxRounds) {
    let bestScore = -1;
    let topScorers: string[] = [];
    for (const pid of activePlayerIds) {
      const s = room.players[pid].score;
      if (s > bestScore) {
        bestScore = s;
        topScorers = [pid];
      } else if (s === bestScore) {
        topScorers.push(pid);
      }
    }
    const matchWinnerId = topScorers.length === 1 ? topScorers[0] : topScorers[0] || null;

    return {
      ...bundle,
      room: {
        ...room,
        status: 'finished',
        winnerId: matchWinnerId,
        updatedAt: now,
      },
    };
  }

  const nextDecks: Record<string, Alien[]> = {};
  let nextDrawPile = [...bundle.drawPile];
  const updatedPlayers: Record<string, PlayerState> = { ...room.players };

  for (const pid of activePlayerIds) {
    const remaining = [...(secretDecks[pid] || [])].slice(1);
    if (remaining.length === 0) {
      if (nextDrawPile.length === 0) {
        nextDrawPile = shuffleDeck(pool, rng);
      }
      remaining.push(nextDrawPile.shift()!);
    }
    nextDecks[pid] = remaining;
    updatedPlayers[pid] = {
      ...updatedPlayers[pid],
      publicRevealedCard: null,
      remainingCardsCount: remaining.length,
      ultimateActiveThisRound: false,
    };
  }

  return {
    room: {
      ...room,
      status: 'playing',
      players: updatedPlayers,
      roundNumber: room.roundNumber + 1,
      turnStartedAt: now,
      lockedStat: null,
      selectedStat: null,
      lastRoundWinnerIds: [],
      lastRoundTie: false,
      lastRoundStolenCount: 0,
      lastRoundComparison: [],
      updatedAt: now,
    },
    secretDecks: nextDecks,
    drawPile: nextDrawPile,
  };
}

export function getSanitizedClientState(
  bundle: ServerRoomBundle,
  viewerPlayerId: string
): {
  room: RoomState;
  myHand: PrivatePlayerHand | null;
} {
  const { room, secretDecks } = bundle;

  const sanitizedPlayers: Record<string, PlayerState> = {};
  for (const [pid, pstate] of Object.entries(room.players)) {
    sanitizedPlayers[pid] = {
      ...pstate,
      publicRevealedCard:
        room.status === 'round_result' || room.status === 'finished'
          ? pstate.publicRevealedCard || null
          : null,
    };
  }

  const sanitizedRoom: RoomState = {
    ...room,
    players: sanitizedPlayers,
    lastRoundComparison:
      room.status === 'round_result' || room.status === 'finished'
        ? room.lastRoundComparison
        : [],
  };

  const viewerDeck = secretDecks[viewerPlayerId];
  const myHand: PrivatePlayerHand | null = viewerDeck
    ? {
        playerId: viewerPlayerId,
        roomId: room.roomCode,
        activeCard: viewerDeck[0] || null,
        upcomingDeckCount: Math.max(0, viewerDeck.length - 1),
        upcomingCards: viewerDeck.slice(1, 9),
        updatedAt: room.updatedAt,
      }
    : null;

  return {
    room: sanitizedRoom,
    myHand,
  };
}
