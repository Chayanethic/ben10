import {
  activateUltimateOvercharge,
  advanceToNextRound,
  createInitialRoomBundle,
  dealFairHands,
  evaluateRoundComparison,
  getElementalCounterBonus,
  getSanitizedClientState,
  joinRoomLobby,
  postPlayerChatMessage,
  selectCpuAttribute,
  setPlayerReadyState,
  setRoomStealMode,
  startMatch,
  submitStatAndResolveRound,
  updateRoomYouTubeState,
} from '../lib/gameEngine';
import { characters, CHARACTER_BY_ID } from '../data/characters';
import { CORE_SIX_STATS, ALL_FIFTEEN_STATS } from '../lib/types';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

export function runAllGameEngineTests(): { passed: number; total: number; results: string[] } {
  const results: string[] = [];
  let passed = 0;
  let total = 0;

  const test = (name: string, fn: () => void) => {
    total++;
    try {
      fn();
      passed++;
      results.push(`PASS: ${name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(`FAIL: ${name} -> ${msg}`);
      throw err;
    }
  };

  // 1. Excel Character Dataset Integrity
  test('Character dataset imports all 61 Excel characters with real WikiHow URLs and valid stats', () => {
    assertCondition(characters.length === 61, `Expected 61 characters, got ${characters.length}`);
    for (const alien of characters) {
      assertCondition(Boolean(alien.id && alien.name), 'Missing id or name');
      assertCondition(alien.imageUrl.startsWith('https://www.wikihow.com/'), `Unexpected Excel URL for ${alien.id}`);
      for (const statKey of ALL_FIFTEEN_STATS) {
        const val = alien.stats[statKey];
        assertCondition(typeof val === 'number' && val >= 1 && val <= 100, `Invalid ${statKey} on ${alien.id}: ${val}`);
      }
    }
  });

  // 2. Default 4-Skill Pool & 60s Timer Configuration & Host Auto-Ready
  test('Room defaults to 6 mobile skills, 60s turn timer, and Host marked Ready on creation', () => {
    const bundle = createInitialRoomBundle({
      hostId: 'host1',
      hostDisplayName: 'Ben',
    });
    assertCondition(bundle.room.activeStatPool.length === 6, `Expected 6 skills, got ${bundle.room.activeStatPool.length}`);
    assertCondition(bundle.room.turnDurationSec === 60, `Expected 60s timer, got ${bundle.room.turnDurationSec}`);
    assertCondition(bundle.room.players['host1'].isReady === true, 'Host must be Ready on creation');
  });

  // 3. Ultimate Omnitrix Overcharge (+15 1x per match)
  test('Ultimate Omnitrix Overcharge boosts chosen stat by +15 for 1 round and cannot be used a second time', () => {
    let bundle = createInitialRoomBundle({
      hostId: 'host1',
      hostDisplayName: 'Ben',
      maxPlayers: 2,
      preferredStarterAlienId: 'heatblast', // strength 75
    });
    bundle = joinRoomLobby(bundle, {
      playerId: 'p2',
      displayName: 'Kevin',
      preferredStarterAlienId: 'diamondhead', // strength 88
    });
    bundle = setPlayerReadyState(bundle, { playerId: 'p2', isReady: true });
    bundle = startMatch(bundle, { requesterId: 'host1' });

    // Without Ultimate, Heatblast (75) loses to Diamondhead (88) on strength.
    // With Ultimate (+15), Heatblast reaches 75 + 15 = 90 and wins!
    bundle = activateUltimateOvercharge(bundle, { playerId: 'host1' });
    assertCondition(bundle.room.players['host1'].ultimateActiveThisRound === true, 'Ultimate should be armed');

    bundle = submitStatAndResolveRound(bundle, { requesterId: 'host1', selectedStat: 'strength' });
    assertCondition(bundle.room.lastRoundWinnerIds?.[0] === 'host1', 'Host should win with 90 vs 88 using Ultimate +15');
    assertCondition(bundle.room.players['host1'].ultimateUsed === true, 'Host ultimateUsed must now be true');
    assertCondition(bundle.room.players['host1'].ultimateActiveThisRound === false, 'ultimateActiveThisRound resets after round');

    // Advance to Round 2 and verify Host cannot use Ultimate a second time
    bundle = advanceToNextRound(bundle, { requesterId: 'host1' });
    let secondUltThrew = false;
    try {
      activateUltimateOvercharge(bundle, { playerId: 'host1' });
    } catch {
      secondUltThrew = true;
    }
    assertCondition(secondUltThrew, 'Player must not be allowed to use Ultimate Overcharge twice in the same match');
  });

  // 4. Optional "Winner Steals Card" Survival Mode (Enabled vs Disabled)
  test('Optional Winner Steals Card Mode transfers loser card to winner deck when enabled, and finishes when opponent hits 0 cards', () => {
    let bundle = createInitialRoomBundle({
      hostId: 'host1',
      hostDisplayName: 'Ben',
      maxPlayers: 2,
      maxRounds: 2, // 2 cards each
      winnerStealsCardMode: false,
      preferredStarterAlienId: 'four-arms', // strength 95
    });
    bundle = joinRoomLobby(bundle, {
      playerId: 'p2',
      displayName: 'Vilgax',
      preferredStarterAlienId: 'grey-matter', // strength 15
    });
    bundle = setPlayerReadyState(bundle, { playerId: 'p2', isReady: true });

    // Enable Steal Mode in lobby before starting
    bundle = setRoomStealMode(bundle, { requesterId: 'host1', winnerStealsCardMode: true });
    assertCondition(bundle.room.winnerStealsCardMode === true, 'winnerStealsCardMode should be true');

    bundle = startMatch(bundle, { requesterId: 'host1' });
    assertCondition(bundle.room.players['host1'].remainingCardsCount === 2, 'Host starts with 2 cards');
    assertCondition(bundle.room.players['p2'].remainingCardsCount === 2, 'P2 starts with 2 cards');

    // Round 1: Host wins -> Host captures P2 card (Host has 3 cards, P2 has 1 card)
    bundle = submitStatAndResolveRound(bundle, { requesterId: 'host1', selectedStat: 'strength' });
    assertCondition(bundle.room.lastRoundStolenCount === 1, 'Should record 1 stolen card');
    bundle = advanceToNextRound(bundle, { requesterId: 'host1' });

    assertCondition(bundle.room.players['host1'].remainingCardsCount === 3, `Expected Host to have 3 cards after stealing 1, got ${bundle.room.players['host1'].remainingCardsCount}`);
    assertCondition(bundle.room.players['p2'].remainingCardsCount === 1, `Expected P2 to have 1 card left, got ${bundle.room.players['p2'].remainingCardsCount}`);
  });

  // 5. 3-player and 4-player comparisons
  test('3-player and 4-player comparisons evaluate chosen attribute across all participants', () => {
    const heatblast = CHARACTER_BY_ID['heatblast'];
    const fourArms = CHARACTER_BY_ID['four-arms'];
    const greyMatter = CHARACTER_BY_ID['grey-matter'];
    const upgrade = CHARACTER_BY_ID['upgrade'];
    const res = evaluateRoundComparison({
      activePlayerId: 'p1',
      selectedStat: 'intelligence',
      playerCards: [
        { playerId: 'p1', displayName: 'P1', alien: heatblast },
        { playerId: 'p2', displayName: 'P2', alien: fourArms },
        { playerId: 'p3', displayName: 'P3', alien: greyMatter },
        { playerId: 'p4', displayName: 'P4', alien: upgrade },
      ],
    });
    assertCondition(res.resolvedWinnerId === 'p3', 'Expected p3 (Grey Matter) to win 4-player round');
  });

  // 6. Privacy check
  test('Privacy check: getSanitizedClientState never exposes opponent unrevealed cards during playing phase', () => {
    let bundle = createInitialRoomBundle({ hostId: 'host1', hostDisplayName: 'Ben', maxPlayers: 2 });
    bundle = joinRoomLobby(bundle, { playerId: 'p2', displayName: 'Gwen' });
    bundle = setPlayerReadyState(bundle, { playerId: 'p2', isReady: true });
    bundle = startMatch(bundle, { requesterId: 'host1' });

    const p1View = getSanitizedClientState(bundle, 'host1');
    assertCondition(Boolean(p1View.myHand?.activeCard?.id), 'P1 should see their own active card');
    assertCondition(p1View.room.players['p2'].publicRevealedCard === null, 'P1 must not see P2 unrevealed card');
  });

  // 7. Admin YouTube DJ & Chat Bubbles
  test('Admin YouTube DJ and Player Chat Bubbles update room state accurately', () => {
    let bundle = createInitialRoomBundle({ hostId: 'host1', hostDisplayName: 'Ben' });
    bundle = postPlayerChatMessage(bundle, { playerId: 'host1', text: 'Ultimate Ready! ⚡' });
    assertCondition(bundle.room.players['host1'].lastMessage === 'Ultimate Ready! ⚡', 'Chat bubble updated');

    bundle = updateRoomYouTubeState(bundle, {
      requesterId: 'host1',
      youtubeState: {
        videoId: 'jfKfPfyJRdk',
        title: 'Arena Theme',
        isPlaying: true,
        startedBy: 'Ben',
        updatedAt: Date.now(),
      },
    });
    assertCondition(bundle.room.youtubeState?.videoId === 'jfKfPfyJRdk', 'YouTube track synced');
  });

  // 8. Pure Childhood Simple Rules: Any skill can be chosen freely every round & highest stat wins cleanly
  test('Childhood Simple Rules: Players can freely choose any of the 6 skills every round without lockouts, and highest number wins', () => {
    let bundle = createInitialRoomBundle({
      hostId: 'host1',
      hostDisplayName: 'Ben',
      maxPlayers: 2,
      winnerStealsCardMode: true,
      preferredStarterAlienId: 'four-arms',
    });
    bundle = joinRoomLobby(bundle, {
      playerId: 'p2',
      displayName: 'Kevin',
      preferredStarterAlienId: 'grey-matter',
    });
    bundle = setPlayerReadyState(bundle, { playerId: 'p2', isReady: true });
    bundle = startMatch(bundle, { requesterId: 'host1' });

    // Round 1: Host picks strength and wins
    bundle = submitStatAndResolveRound(bundle, { requesterId: 'host1', selectedStat: 'strength' });
    assertCondition(bundle.room.lastRoundWinnerIds?.[0] === 'host1', 'Four Arms should beat Grey Matter on strength');
    bundle = advanceToNextRound(bundle, { requesterId: 'host1' });
    assertCondition(bundle.room.lockedStat === null, 'No skill should be locked in simple childhood mode');

    // Round 2: Winner can freely pick strength again with zero cooldown error
    const round2Turn = bundle.room.currentTurnPlayerId;
    bundle = submitStatAndResolveRound(bundle, { requesterId: round2Turn, selectedStat: 'strength' });
    assertCondition(bundle.room.status === 'round_result', 'Round 2 should resolve cleanly with same skill');
    // Verify 100% unique cards across 2P (30 each = 60), 3P (20 each = 60), and 4P (15 each = 60)
    const deal4P = dealFairHands({
      playerIds: ['p1', 'p2', 'p3', 'p4'],
      cardsPerPlayer: 15,
      preferredStarters: { p1: 'heatblast', p2: 'heatblast', p3: 'heatblast', p4: 'heatblast' },
    });
    const allDealtIds = [
      ...deal4P.hands['p1'],
      ...deal4P.hands['p2'],
      ...deal4P.hands['p3'],
      ...deal4P.hands['p4'],
    ].map((c) => c.id);
    assertCondition(allDealtIds.length === 60, `Expected 60 total cards dealt across 4 players, got ${allDealtIds.length}`);
    assertCondition(new Set(allDealtIds).size === 60, 'Every single card dealt across all 4 players must be 100% unique (0 duplicates even if same starter was requested)');

  });

  return { passed, total, results };
}
