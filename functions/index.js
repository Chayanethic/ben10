/**
 * OMNITRIX ARENA — ULTIMATE EDITION
 * Firebase Cloud Functions (Authoritative Multiplayer Backend)
 *
 * Implements transactional, server-authoritative multiplayer rooms for 2, 3, or 4 players:
 * - createRoom
 * - joinRoom
 * - toggleReady
 * - startMatch
 * - resolveRound (submit stat & compare across all active players)
 * - advanceRound (consume round cards, draw next private card, or finish match)
 * - leaveRoom / handleDisconnect
 *
 * Private hands are written to `/rooms/{roomId}/privateHands/{playerId}` (readable only by that UID)
 * and full multi-round secret decks are stored in `/rooms/{roomId}/serverSecrets/deckState` (unreadable by any client).
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const characterCatalog = require('../data/characters.json');

if (!admin.apps.length) {
  admin.initializeApp();
}

const CORE_FIVE_STATS = ['strength', 'speed', 'energy', 'intelligence', 'durability'];
const ALL_FIFTEEN_STATS = [
  'strength',
  'speed',
  'energy',
  'intelligence',
  'durability',
  'agility',
  'combatSkill',
  'specialPower',
  'defense',
  'stamina',
  'adaptability',
  'elementalPower',
  'stealth',
  'range',
  'regeneration',
];

function secureRandomFloat() {
  return crypto.randomInt(0, 1000000) / 1000000;
}

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

function dealServerHands(playerIds, cardsPerPlayer, allowDuplicateCards, preferredStarters) {
  const hands = {};
  playerIds.forEach((pid) => {
    hands[pid] = [];
  });

  if (allowDuplicateCards) {
    for (const pid of playerIds) {
      const starterId = preferredStarters[pid];
      const found = starterId ? characterCatalog.find((c) => c.id === starterId) : null;
      if (found) hands[pid].push(found);
      while (hands[pid].length < cardsPerPlayer) {
        hands[pid].push(characterCatalog[crypto.randomInt(0, characterCatalog.length)]);
      }
    }
    return { hands, drawPile: shuffleArray(characterCatalog) };
  }

  let available = shuffleArray(characterCatalog);
  const usedIds = new Set();

  for (const pid of playerIds) {
    const starterId = preferredStarters[pid];
    if (starterId && !usedIds.has(starterId)) {
      const idx = available.findIndex((c) => c.id === starterId);
      if (idx !== -1) {
        const [picked] = available.splice(idx, 1);
        hands[pid].push(picked);
        usedIds.add(picked.id);
      }
    }
  }

  for (let r = 0; r < cardsPerPlayer; r++) {
    for (const pid of playerIds) {
      if (hands[pid].length > r) continue;
      if (available.length === 0) {
        available = shuffleArray(characterCatalog);
      }
      hands[pid].push(available.shift());
    }
  }

  return { hands, drawPile: available };
}

exports.createRoom = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = context.auth.uid;
  const displayName = String(data.displayName || '').trim();
  const maxPlayers = Number(data.maxPlayers || 2);
  const maxRounds = Math.min(15, Math.max(1, Number(data.maxRounds || 5)));
  const allowDuplicateCards = Boolean(data.allowDuplicateCards);
  const useExtendedStats = Boolean(data.useExtendedStats);
  const preferredStarterAlienId = data.preferredStarterAlienId || null;

  if (!displayName) {
    throw new functions.https.HttpsError('invalid-argument', 'Display name is required.');
  }
  if (![2, 3, 4].includes(maxPlayers)) {
    throw new functions.https.HttpsError('invalid-argument', 'maxPlayers must be 2, 3, or 4.');
  }

  const db = admin.firestore();
  const roomCode = generateRoomCode();
  const roomRef = db.collection('rooms').doc(roomCode);
  const now = Date.now();

  const roomDoc = {
    id: roomCode,
    roomCode,
    hostId: uid,
    maxPlayers,
    status: 'lobby',
    players: {
      [uid]: {
        id: uid,
        displayName,
        selectedStarterAlienId: preferredStarterAlienId,
        isReady: false,
        score: 0,
        publicRevealedCard: null,
        isConnected: true,
        lastHeartbeatAt: now,
        remainingCardsCount: 0,
        isHost: true,
      },
    },
    playerOrder: [uid],
    currentTurnPlayerId: uid,
    roundNumber: 1,
    maxRounds,
    allowDuplicateCards,
    tieRule: 'keep_active',
    activeStatPool: useExtendedStats ? ALL_FIFTEEN_STATS : CORE_FIVE_STATS,
    selectedStat: null,
    winnerId: null,
    lastRoundWinnerIds: [],
    lastRoundTie: false,
    lastRoundComparison: [],
    roundHistory: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 1000 * 60 * 60 * 2,
  };

  await roomRef.set(roomDoc);
  return { success: true, roomCode, room: roomDoc };
});

exports.joinRoom = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = context.auth.uid;
  const roomCode = String(data.roomId || data.roomCode || '').trim().toUpperCase();
  const displayName = String(data.displayName || '').trim();
  const preferredStarterAlienId = data.preferredStarterAlienId || null;

  if (!roomCode || !displayName) {
    throw new functions.https.HttpsError('invalid-argument', 'Room code and display name are required.');
  }

  const db = admin.firestore();
  const roomRef = db.collection('rooms').doc(roomCode);

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Room not found.');
    }

    const roomData = snap.data();
    const now = Date.now();
    if (now > roomData.expiresAt) {
      throw new functions.https.HttpsError('deadline-exceeded', 'Room has expired.');
    }

    const players = { ...roomData.players };
    const playerOrder = [...(roomData.playerOrder || Object.keys(players))];

    if (players[uid]) {
      players[uid] = {
        ...players[uid],
        displayName,
        isConnected: true,
        lastHeartbeatAt: now,
      };
      transaction.update(roomRef, { players, updatedAt: now });
      return { success: true, roomCode, reconnected: true };
    }

    if (roomData.status !== 'lobby' && roomData.status !== 'ready_check') {
      throw new functions.https.HttpsError('failed-precondition', 'Match is already in progress.');
    }

    if (Object.keys(players).length >= roomData.maxPlayers) {
      throw new functions.https.HttpsError('resource-exhausted', 'Room is full.');
    }

    players[uid] = {
      id: uid,
      displayName,
      selectedStarterAlienId: preferredStarterAlienId,
      isReady: false,
      score: 0,
      publicRevealedCard: null,
      isConnected: true,
      lastHeartbeatAt: now,
      remainingCardsCount: 0,
      isHost: false,
    };
    playerOrder.push(uid);

    transaction.update(roomRef, {
      players,
      playerOrder,
      status: 'lobby',
      updatedAt: now,
    });

    return { success: true, roomCode, reconnected: false };
  });
});

exports.toggleReady = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = context.auth.uid;
  const roomCode = String(data.roomId || data.roomCode || '').trim().toUpperCase();
  const isReady = Boolean(data.isReady);
  const selectedStarterAlienId = data.selectedStarterAlienId;

  const db = admin.firestore();
  const roomRef = db.collection('rooms').doc(roomCode);

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Room not found.');
    }
    const roomData = snap.data();
    if (!roomData.players[uid]) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant in this room.');
    }
    if (roomData.status !== 'lobby' && roomData.status !== 'ready_check') {
      throw new functions.https.HttpsError('failed-precondition', 'Match already started.');
    }

    const players = { ...roomData.players };
    players[uid] = {
      ...players[uid],
      isReady,
      selectedStarterAlienId:
        selectedStarterAlienId !== undefined ? selectedStarterAlienId : players[uid].selectedStarterAlienId,
      isConnected: true,
      lastHeartbeatAt: Date.now(),
    };

    const allPlayers = Object.values(players);
    const allReady = allPlayers.length >= 2 && allPlayers.every((p) => p.isReady && p.isConnected);

    transaction.update(roomRef, {
      players,
      status: allReady ? 'ready_check' : 'lobby',
      updatedAt: Date.now(),
    });

    return { success: true, isReady };
  });
});

exports.startMatch = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = context.auth.uid;
  const roomCode = String(data.roomId || data.roomCode || '').trim().toUpperCase();
  const db = admin.firestore();
  const roomRef = db.collection('rooms').doc(roomCode);

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Room not found.');
    }
    const roomData = snap.data();

    if (roomData.hostId !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'Only the room host can start the match.');
    }

    const activePlayerIds = (roomData.playerOrder || Object.keys(roomData.players)).filter(
      (pid) => roomData.players[pid] && roomData.players[pid].isConnected
    );

    if (activePlayerIds.length < 2) {
      throw new functions.https.HttpsError('failed-precondition', 'At least 2 connected players are required.');
    }

    const unready = activePlayerIds.filter((pid) => !roomData.players[pid].isReady);
    if (unready.length > 0 && roomData.status !== 'finished') {
      throw new functions.https.HttpsError('failed-precondition', 'Every player must be Ready before starting.');
    }

    const preferredStarters = {};
    activePlayerIds.forEach((pid) => {
      preferredStarters[pid] = roomData.players[pid].selectedStarterAlienId || null;
    });

    const { hands, drawPile } = dealServerHands(
      activePlayerIds,
      roomData.maxRounds || 5,
      Boolean(roomData.allowDuplicateCards),
      preferredStarters
    );

    const now = Date.now();
    const updatedPlayers = {};
    activePlayerIds.forEach((pid) => {
      updatedPlayers[pid] = {
        ...roomData.players[pid],
        score: 0,
        publicRevealedCard: null,
        remainingCardsCount: hands[pid].length,
      };
      // Write private active card to /rooms/{roomId}/privateHands/{playerId}
      const privateHandRef = roomRef.collection('privateHands').doc(pid);
      transaction.set(privateHandRef, {
        playerId: pid,
        roomId: roomCode,
        activeCard: hands[pid][0],
        upcomingDeckCount: Math.max(0, hands[pid].length - 1),
        updatedAt: now,
      });
    });

    // Store full secret decks in server-only vault
    const deckVaultRef = roomRef.collection('serverSecrets').doc('deckState');
    transaction.set(deckVaultRef, {
      hands,
      drawPile,
      updatedAt: now,
    });

    transaction.update(roomRef, {
      status: 'playing',
      players: updatedPlayers,
      playerOrder: activePlayerIds,
      currentTurnPlayerId: activePlayerIds[0],
      roundNumber: 1,
      selectedStat: null,
      winnerId: null,
      lastRoundWinnerIds: [],
      lastRoundTie: false,
      lastRoundComparison: [],
      roundHistory: [],
      updatedAt: now,
    });

    return { success: true };
  });
});

exports.resolveRound = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  const uid = context.auth.uid;
  const roomCode = String(data.roomId || '').trim().toUpperCase();
  const selectedStat = String(data.selectedStat || '').trim();

  if (!ALL_FIFTEEN_STATS.includes(selectedStat)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid attribute selected.');
  }

  const db = admin.firestore();
  const roomRef = db.collection('rooms').doc(roomCode);

  return db.runTransaction(async (transaction) => {
    const roomDoc = await transaction.get(roomRef);
    if (!roomDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Room not found.');
    }

    const roomData = roomDoc.data();
    if (roomData.status !== 'playing') {
      throw new functions.https.HttpsError('failed-precondition', 'Round is not in playing state.');
    }
    if (roomData.currentTurnPlayerId !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'Not your turn.');
    }

    const handsSnapshot = await transaction.get(roomRef.collection('privateHands'));
    const activePlayerIds = (roomData.playerOrder || Object.keys(roomData.players)).filter(
      (pid) => roomData.players[pid] && roomData.players[pid].isConnected
    );

    let highestValue = -1;
    let winners = [];
    const handMap = {};

    handsSnapshot.forEach((doc) => {
      handMap[doc.id] = doc.data().activeCard;
    });

    activePlayerIds.forEach((pid) => {
      const activeCard = handMap[pid];
      if (!activeCard) return;
      const statValue = activeCard.stats[selectedStat];
      if (statValue > highestValue) {
        highestValue = statValue;
        winners = [pid];
      } else if (statValue === highestValue) {
        winners.push(pid);
      }
    });

    const isTie = winners.length > 1;
    const resolvedWinnerId = isTie ? null : winners[0];
    const nextTurnPlayerId = !isTie && resolvedWinnerId ? resolvedWinnerId : roomData.currentTurnPlayerId;

    const entries = activePlayerIds.map((pid) => {
      const alien = handMap[pid];
      const statValue = alien.stats[selectedStat];
      return {
        playerId: pid,
        displayName: roomData.players[pid].displayName,
        alien,
        statValue,
        isWinner: !isTie && statValue === highestValue,
        isTiedTop: isTie && statValue === highestValue,
      };
    });

    const updatedPlayers = { ...roomData.players };
    entries.forEach((entry) => {
      const p = updatedPlayers[entry.playerId];
      updatedPlayers[entry.playerId] = {
        ...p,
        score: entry.isWinner ? p.score + 1 : p.score,
        publicRevealedCard: entry.alien,
      };
    });

    const now = Date.now();
    const historyItem = {
      roundNumber: roomData.roundNumber,
      activePlayerId: uid,
      selectedStat,
      highestValue,
      winnerIds: winners,
      resolvedWinnerId,
      isTie,
      entries,
      timestamp: now,
    };

    transaction.update(roomRef, {
      status: 'round_result',
      players: updatedPlayers,
      currentTurnPlayerId: nextTurnPlayerId,
      lastWinnerId: resolvedWinnerId,
      lastRoundWinnerIds: winners,
      lastRoundTie: isTie,
      selectedStat,
      lastRoundComparison: entries,
      roundHistory: [...(roomData.roundHistory || []), historyItem],
      updatedAt: now,
    });

    return { success: true, winners, isTie, nextTurnPlayerId };
  });
});

exports.advanceRound = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  const uid = context.auth.uid;
  const roomCode = String(data.roomId || '').trim().toUpperCase();
  const db = admin.firestore();
  const roomRef = db.collection('rooms').doc(roomCode);
  const deckVaultRef = roomRef.collection('serverSecrets').doc('deckState');

  return db.runTransaction(async (transaction) => {
    const [roomDoc, vaultDoc] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(deckVaultRef),
    ]);

    if (!roomDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Room not found.');
    }
    const roomData = roomDoc.data();
    if (roomData.status !== 'round_result') {
      throw new functions.https.HttpsError('failed-precondition', 'Room is not in round_result state.');
    }
    if (!roomData.players[uid]) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant.');
    }

    const activePlayerIds = (roomData.playerOrder || Object.keys(roomData.players)).filter(
      (pid) => roomData.players[pid] && roomData.players[pid].isConnected
    );

    const now = Date.now();
    if (roomData.roundNumber >= roomData.maxRounds) {
      let bestScore = -1;
      let topScorers = [];
      activePlayerIds.forEach((pid) => {
        const s = roomData.players[pid].score;
        if (s > bestScore) {
          bestScore = s;
          topScorers = [pid];
        } else if (s === bestScore) {
          topScorers.push(pid);
        }
      });

      transaction.update(roomRef, {
        status: 'finished',
        winnerId: topScorers[0] || null,
        updatedAt: now,
      });
      return { success: true, finished: true };
    }

    const vaultData = vaultDoc.exists ? vaultDoc.data() : { hands: {}, drawPile: [] };
    const nextHands = {};
    let drawPile = [...(vaultData.drawPile || [])];
    const updatedPlayers = { ...roomData.players };

    activePlayerIds.forEach((pid) => {
      const remaining = [...(vaultData.hands[pid] || [])].slice(1);
      if (remaining.length === 0) {
        if (drawPile.length === 0) {
          drawPile = shuffleArray(characterCatalog);
        }
        remaining.push(drawPile.shift());
      }
      nextHands[pid] = remaining;
      updatedPlayers[pid] = {
        ...updatedPlayers[pid],
        publicRevealedCard: null,
        remainingCardsCount: remaining.length,
      };
      const privateHandRef = roomRef.collection('privateHands').doc(pid);
      transaction.set(privateHandRef, {
        playerId: pid,
        roomId: roomCode,
        activeCard: remaining[0],
        upcomingDeckCount: Math.max(0, remaining.length - 1),
        updatedAt: now,
      });
    });

    transaction.set(deckVaultRef, {
      hands: nextHands,
      drawPile,
      updatedAt: now,
    });

    transaction.update(roomRef, {
      status: 'playing',
      players: updatedPlayers,
      roundNumber: roomData.roundNumber + 1,
      selectedStat: null,
      lastRoundWinnerIds: [],
      lastRoundTie: false,
      lastRoundComparison: [],
      updatedAt: now,
    });

    return { success: true, finished: false };
  });
});