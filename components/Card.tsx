'use client';

import React, { useEffect, useState } from 'react';
import {
  Alien,
  ALL_STATS_METADATA,
  CORE_SIX_STATS,
  StatKey,
  ULTIMATE_OVERCHARGE_BONUS,
} from '../lib/types';

export type CardSweepState =
  | 'none'
  | 'stolen-to-left'
  | 'stolen-to-right'
  | 'sweep-to-bottom'
  | 'sweep-to-top'
  | 'sweep-to-left'
  | 'sweep-to-right'
  | 'captured-winner';

export interface CardProps {
  alien?: Alien | null;
  character?: Alien | null;
  isHidden?: boolean;
  hiddenLabel?: string;
  playerName?: string;
  ownerLabel?: string;
  takenByWinnerName?: string | null;
  onStatSelect?: (stat: StatKey) => void;
  onSelectStat?: (stat: StatKey) => void;
  isSelectable?: boolean;
  disabled?: boolean;
  selectedStat?: StatKey | null;
  lockedStat?: StatKey | null;
  isWinner?: boolean;
  isLoser?: boolean;
  isTiedTop?: boolean;
  activeStatPool?: StatKey[];
  compact?: boolean;
  tableThrown?: boolean;
  throwDirection?: 'from-bottom' | 'from-top' | 'from-left' | 'from-right' | null;
  reducedMotion?: boolean;
  showUltimateControl?: boolean;
  ultimateUsed?: boolean;
  ultimateActiveThisRound?: boolean;
  onActivateUltimate?: () => void;
  counterBonus?: number;
  underdogBonus?: number;
  stealAnimState?: CardSweepState;
}

const CLASSIC_STAT_LABELS: Partial<Record<StatKey, string>> = {
  strength: 'ATTACK',
  speed: 'COAST',
  energy: 'POWER',
  intelligence: 'INTEL',
  durability: 'DEFENSE',
  combatSkill: 'DAMAGE',
};

const SUITS = [
  { symbol: '♥', color: '#e11d48' },
  { symbol: '♦', color: '#e11d48' },
  { symbol: '♣', color: '#0f172a' },
  { symbol: '♠', color: '#0f172a' },
];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];

export function getPlayingCardCorner(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const suit = SUITS[hash % SUITS.length];
  const rank = RANKS[(hash >> 2) % RANKS.length];
  const transformCode = String(10000 + (hash % 89999));
  return { suit, rank, transformCode };
}

export function HiddenCardBack({
  hiddenLabel = 'CARD LOCKED',
  playerName,
  compact = false,
}: {
  hiddenLabel?: string;
  playerName?: string;
  compact?: boolean;
  reducedMotion?: boolean;
}) {
  return (
    <div
      className={`b10-vintage-card b10-hidden-back ${compact ? 'b10-compact' : ''}`}
      data-testid="hidden-card-back"
    >
      <div className="b10-lime-shell b10-back-shell">
        <div className="b10-top-corners">
          <div className="b10-suit-box">
            <span className="b10-suit-symbol" style={{ color: '#e11d48' }}>
              ♠
            </span>
            <span className="b10-suit-rank" style={{ color: '#0f172a' }}>
              ?
            </span>
          </div>
          <div className="b10-owner-wrap">
            <span className="b10-owner-pill">🔒 {playerName || 'OPPONENT'}</span>
          </div>
          <div className="b10-logo-badge">
            <span className="b10-logo-ben">BEN</span>
            <span className="b10-logo-10">10</span>
          </div>
        </div>

        <div className="b10-art-window">
          <div className="b10-side-vent b10-vent-left" />
          <div
            className="b10-art-inner"
            style={{ background: 'radial-gradient(circle, #dcfce7 0%, #86efac 100%)' }}
          >
            <div className="b10-omnitrix-dial">
              <div className="b10-omnitrix-hourglass" />
            </div>
          </div>
          <div className="b10-side-vent b10-vent-right" />
        </div>

        <div className="b10-yellow-ribbon">
          <span className="b10-ribbon-title">{hiddenLabel}</span>
        </div>

        <div className="b10-red-total-pill">????</div>
      </div>
    </div>
  );
}

export default function Card({
  alien,
  character,
  isHidden = false,
  hiddenLabel,
  playerName,
  ownerLabel,
  takenByWinnerName = null,
  onStatSelect,
  onSelectStat,
  isSelectable = false,
  disabled = false,
  selectedStat = null,
  isWinner = false,
  isLoser = false,
  isTiedTop = false,
  activeStatPool = CORE_SIX_STATS,
  compact = false,
  tableThrown = false,
  throwDirection = null,
  ultimateActiveThisRound = false,
  stealAnimState = 'none',
}: CardProps) {
  const targetAlien = alien ?? character ?? null;
  const effectivePlayerName = playerName || ownerLabel;
  const handleSelect = onStatSelect || onSelectStat;
  const canInteract = isSelectable && !disabled && Boolean(handleSelect);

  const [imgStage, setImgStage] = useState<'proxy' | 'direct' | 'local'>('proxy');

  useEffect(() => {
    setImgStage('proxy');
  }, [targetAlien?.id]);

  if (isHidden || !targetAlien) {
    return (
      <HiddenCardBack
        hiddenLabel={hiddenLabel}
        playerName={effectivePlayerName}
        compact={compact}
      />
    );
  }

  const sixSkills = ALL_STATS_METADATA.filter((m) =>
    activeStatPool.slice(0, 6).includes(m.key)
  );

  const proxyUrl = `/api/alien-image?id=${encodeURIComponent(targetAlien.id)}`;
  const localFallbackUrl = targetAlien.fallbackImageUrl || `/images/aliens/${targetAlien.id}.svg`;
  const currentSrc =
    imgStage === 'proxy'
      ? proxyUrl
      : imgStage === 'direct'
      ? targetAlien.imageUrl || localFallbackUrl
      : localFallbackUrl;

  const { suit, rank } = getPlayingCardCorner(targetAlien.id);
  const rawTotal = sixSkills.reduce(
    (sum, m) =>
      sum +
      (targetAlien.stats[m.key] || 0) +
      (ultimateActiveThisRound ? ULTIMATE_OVERCHARGE_BONUS : 0),
    0
  );
  const vintagePowerTotal = rawTotal * 10;

  let cardStateClass = `b10-vintage-card ${compact ? 'b10-compact' : ''} ${
    tableThrown ? 'b10-table-thrown' : ''
  }`;
  if (throwDirection) cardStateClass += ` b10-throw-${throwDirection}`;
  if (isWinner) cardStateClass += ' b10-winner-glow';
  else if (isTiedTop) cardStateClass += ' tied';
  else if (isLoser) cardStateClass += ' loser';

  if (stealAnimState !== 'none') {
    cardStateClass += ` oa-card-${stealAnimState}`;
  }

  return (
    <div className={cardStateClass} data-testid={`alien-card-${targetAlien.id}`}>
      {/* Top Badge showing Winner or Taken By on Table-Matched Cards (placed at top so it never covers skills!) */}
      {isLoser && takenByWinnerName && (
        <div className="tp-card-taken-stamp">
          → {takenByWinnerName.toUpperCase()}
        </div>
      )}
      {isWinner && tableThrown && (
        <div className="tp-card-winner-crown">
          👑 WINNER!
        </div>
      )}

      <div className="b10-lime-shell">
        {/* Top Row: Playing Card Corner Suit/Rank + Owner Tag + Classic BEN 10 Logo */}
        <div className="b10-top-corners">
          <div className="b10-suit-box" title="Classic Trump Card Index">
            <span className="b10-suit-symbol" style={{ color: suit.color }}>
              {suit.symbol}
            </span>
            <span className="b10-suit-rank" style={{ color: suit.color }}>
              {rank}
            </span>
          </div>

          <div className="b10-owner-wrap">
            {effectivePlayerName && (
              <span className="b10-owner-pill">{effectivePlayerName}</span>
            )}
          </div>

          <div className="b10-logo-badge">
            <span className="b10-logo-ben">BEN</span>
            <span className="b10-logo-10">10</span>
          </div>
        </div>

        {/* Character Portrait Window */}
        <div className="b10-art-window b10-art-hero">
          <div className="b10-side-vent b10-vent-left" />
          <div className="b10-art-inner">
            <img
              src={currentSrc}
              alt={targetAlien.name}
              className="b10-character-img"
              loading="eager"
              onError={() => {
                if (imgStage === 'proxy') {
                  setImgStage('direct');
                } else if (imgStage === 'direct') {
                  setImgStage('local');
                }
              }}
            />
          </div>
          <div className="b10-side-vent b10-vent-right" />
        </div>

        {/* Classic Golden-Yellow Name Plate with Bold Red Text */}
        <div className="b10-yellow-ribbon">
          <span className="b10-ribbon-title">{targetAlien.name}</span>
        </div>

        {/* Pure, Simple Childhood 6-Skill Grid — Full Skill Names Always 100% Readable! */}
        <div className="b10-stats-belly">
          <div className="b10-skills-grid-6">
            {sixSkills.map((meta) => {
              const baseVal = targetAlien.stats[meta.key];
              const val =
                baseVal + (ultimateActiveThisRound ? ULTIMATE_OVERCHARGE_BONUS : 0);
              const isChosen = selectedStat === meta.key;
              const isWinningBox = isChosen && (isWinner || isTiedTop);
              const shortLabel = CLASSIC_STAT_LABELS[meta.key] || meta.label.toUpperCase();

              return (
                <button
                  key={meta.key}
                  type="button"
                  disabled={!canInteract}
                  onClick={() => canInteract && handleSelect && handleSelect(meta.key)}
                  title={`${meta.label}: ${val}`}
                  className={`b10-stat-btn ${
                    isWinningBox || isChosen ? 'b10-stat-selected' : ''
                  } ${canInteract ? 'b10-stat-clickable' : ''}`}
                >
                  {!tableThrown && <span className="b10-stat-star">★</span>}
                  <span className="b10-stat-name">{shortLabel}</span>
                  <span className="b10-stat-val">{val}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Glossy Red Capsule Pill for Total Score */}
        <div className="b10-red-total-pill">{vintagePowerTotal}</div>
      </div>
    </div>
  );
}
