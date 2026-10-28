export type StatKey =
  | 'strength'
  | 'speed'
  | 'energy'
  | 'intelligence'
  | 'durability'
  | 'agility'
  | 'combatSkill'
  | 'specialPower'
  | 'defense'
  | 'stamina'
  | 'adaptability'
  | 'elementalPower'
  | 'stealth'
  | 'range'
  | 'regeneration';

export interface AlienStats {
  strength: number;
  speed: number;
  energy: number;
  intelligence: number;
  durability: number;
  agility: number;
  combatSkill: number;
  specialPower: number;
  defense: number;
  stamina: number;
  adaptability: number;
  elementalPower: number;
  stealth: number;
  range: number;
  regeneration: number;
}

export type AlienRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export type AlienRole =
  | 'Blaster'
  | 'Tank'
  | 'Speedster'
  | 'Brawler'
  | 'Tactician'
  | 'Controller'
  | 'Infiltrator'
  | 'Tracker'
  | 'Specialist'
  | 'Titan'
  | 'All-Rounder';

export interface Alien {
  id: string;
  characterId: string;
  name: string;
  characterName: string;
  imageUrl: string;
  fallbackImageUrl: string;
  storagePath: string;
  species: string;
  homeworld: string;
  element: string;
  role: AlienRole;
  rarity: AlienRarity;
  accentColor: string;
  secondaryColor: string;
  abilities: string[];
  lore: string;
  provisionalRatings: boolean;
  stats: AlienStats;
}

export type GameStatus =
  | 'lobby'
  | 'ready_check'
  | 'playing'
  | 'round_resolving'
  | 'round_result'
  | 'finished';

export type CpuDifficulty = 'easy' | 'normal' | 'hard';

export type TieRule = 'keep_active' | 'carry_over_pot' | 're_draw';

export interface PlayerChatMessage {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  timestamp: number;
}

export interface RoomYouTubeState {
  videoId: string;
  title: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  isPlaying: boolean;
  startedBy: string;
  updatedAt: number;
}

export interface PlayerState {
  id: string;
  displayName: string;
  avatarId?: string;
  selectedStarterAlienId?: string | null;
  isReady: boolean;
  score: number;
  publicRevealedCard?: Alien | null;
  isConnected: boolean;
  lastHeartbeatAt?: number;
  remainingCardsCount: number;
  isHost?: boolean;
  lastMessage?: string | null;
  lastMessageAt?: number | null;
  /**
   * "Ultimate Omnitrix" Overcharge (1x Per Match)
   * - `ultimateUsed`: true once the player has consumed their 1x +15 Overcharge in the match.
   * - `ultimateActiveThisRound`: true if armed for the current round (+15 to the chosen stat).
   */
  ultimateUsed?: boolean;
  ultimateActiveThisRound?: boolean;
  winStreak?: number;
}

export interface RoundComparisonEntry {
  playerId: string;
  displayName: string;
  alien: Alien;
  baseStatValue: number;
  ultimateBonus: number;
  counterBonus?: number;
  underdogBonus?: number;
  statValue: number;
  usedUltimate: boolean;
  isWinner: boolean;
  isTiedTop: boolean;
}

export interface RoundHistoryEntry {
  roundNumber: number;
  activePlayerId: string;
  selectedStat: StatKey;
  highestValue: number;
  winnerIds: string[];
  resolvedWinnerId: string | null;
  isTie: boolean;
  stolenCardCount?: number;
  entries: RoundComparisonEntry[];
  timestamp: number;
}

export interface RoomState {
  id: string;
  roomCode: string;
  hostId: string;
  maxPlayers: 2 | 3 | 4;
  status: GameStatus;
  players: Record<string, PlayerState>;
  playerOrder: string[];
  currentTurnPlayerId: string;
  turnStartedAt: number;
  turnDurationSec: number;
  roundNumber: number;
  maxRounds: number;
  allowDuplicateCards: boolean;
  /**
   * Optional "Winner Steals Card" Survival Mode:
   * - When `true`, the round winner captures the defeated opponents' played cards into the bottom of their deck!
   * - When `false`, standard fixed-round points mode is used.
   */
  winnerStealsCardMode: boolean;
  tieRule: TieRule;
  activeStatPool: StatKey[];
  selectedStat?: StatKey | null;
  lockedStat?: StatKey | null;
  winnerId?: string | null;
  lastRoundWinnerIds?: string[];
  lastRoundTie?: boolean;
  lastRoundStolenCount?: number;
  lastRoundComparison?: RoundComparisonEntry[];
  roundHistory: RoundHistoryEntry[];
  messages: PlayerChatMessage[];
  youtubeState?: RoomYouTubeState | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface PrivatePlayerHand {
  playerId: string;
  roomId: string;
  activeCard: Alien | null;
  upcomingDeckCount: number;
  upcomingCards?: Alien[];
  updatedAt: number;
}

export interface StatMetadata {
  key: StatKey;
  label: string;
  shortLabel: string;
  category: 'Core' | 'Combat' | 'Tactical';
  description: string;
}

export const ULTIMATE_OVERCHARGE_BONUS = 15;
export const ELEMENTAL_COUNTER_BONUS = 10;
export const UNDERDOG_STREAK_BONUS = 8;

export const ALL_STATS_METADATA: StatMetadata[] = [
  { key: 'strength', label: 'Strength', shortLabel: 'STR', category: 'Core', description: 'Raw physical lifting, striking, and grappling force.' },
  { key: 'speed', label: 'Speed', shortLabel: 'SPD', category: 'Core', description: 'Maximum velocity across ground, air, or water.' },
  { key: 'energy', label: 'Energy', shortLabel: 'NRG', category: 'Core', description: 'Output of plasma, laser, thermal, or cosmic projection.' },
  { key: 'intelligence', label: 'Intellect', shortLabel: 'INT', category: 'Core', description: 'Analytical calculation, problem-solving, and strategic genius.' },
  { key: 'durability', label: 'Durability', shortLabel: 'DUR', category: 'Core', description: 'Structural resilience against kinetic and energy impacts.' },
  { key: 'agility', label: 'Agility', shortLabel: 'AGI', category: 'Combat', description: 'Reflexes, evasion, acrobatics, and maneuvering precision.' },
  { key: 'combatSkill', label: 'Combat Skill', shortLabel: 'CMB', category: 'Combat', description: 'Martial mastery, weaponized anatomy, and close-quarters technique.' },
  { key: 'specialPower', label: 'Special Power', shortLabel: 'SPC', category: 'Combat', description: 'Potency of signature alien biological or dimensional abilities.' },
  { key: 'defense', label: 'Defense', shortLabel: 'DEF', category: 'Combat', description: 'Shielding, armor plating, deflection, and damage mitigation.' },
  { key: 'stamina', label: 'Stamina', shortLabel: 'STA', category: 'Combat', description: 'Sustained combat endurance before Omnitrix recharge.' },
  { key: 'adaptability', label: 'Adaptability', shortLabel: 'ADP', category: 'Tactical', description: 'Versatility across extreme environments and shifting threats.' },
  { key: 'elementalPower', label: 'Elemental Power', shortLabel: 'ELM', category: 'Tactical', description: 'Command over fire, ice, electricity, crystal, acid, or nature.' },
  { key: 'stealth', label: 'Stealth', shortLabel: 'STL', category: 'Tactical', description: 'Infiltration, invisibility, intangibility, and low-signature ambush.' },
  { key: 'range', label: 'Range', shortLabel: 'RNG', category: 'Tactical', description: 'Effective engagement distance of beams, projectiles, or vines.' },
  { key: 'regeneration', label: 'Regeneration', shortLabel: 'REG', category: 'Tactical', description: 'Cellular repair, limb regrowth, and self-reassembly speed.' },
];

export const CORE_FOUR_STATS: StatKey[] = [
  'strength',
  'speed',
  'energy',
  'intelligence',
];

export const CORE_SIX_STATS: StatKey[] = [
  'strength',
  'speed',
  'energy',
  'intelligence',
  'durability',
  'combatSkill',
];

export const CORE_FIVE_STATS: StatKey[] = [
  'strength',
  'speed',
  'energy',
  'intelligence',
  'durability',
];

export const ALL_FIFTEEN_STATS: StatKey[] = ALL_STATS_METADATA.map((s) => s.key);
