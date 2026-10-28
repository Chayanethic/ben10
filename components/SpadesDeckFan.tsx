'use client';

import React from 'react';
import { Alien, CORE_SIX_STATS, StatKey } from '../lib/types';
import Card, { CardSweepState } from './Card';

export interface ArenaSeatPlayer {
  id: string;
  name: string;
  score: number;
  cardsCount: number;
  avatarAlienId: string;
  isMe: boolean;
  isTurn: boolean;
  isWinner?: boolean;
  isTiedTop?: boolean;
  winStreak?: number;
  chatBubble?: string | null;
  playedCard?: Alien | null;
  usedUltimate?: boolean;
  counterBonus?: number;
  underdogBonus?: number;
}

export interface SpadesFourSeatArenaProps {
  seats: ArenaSeatPlayer[];
  isRoundResult: boolean;
  myActiveCard: Alien | null;
  canSelectStat: boolean;
  onSelectStat: (stat: StatKey) => void;
  selectedStat: StatKey | null;
  lockedStat?: StatKey | null;
  activeStatPool?: StatKey[];
  showUltimateControl?: boolean;
  ultimateUsed?: boolean;
  ultimateActiveThisRound?: boolean;
  onActivateUltimate?: () => void;
  turnPromptText: string;
  winnerBannerText?: string | null;
}

export interface SeatPlaqueProps {
  position: 'top' | 'bottom' | 'left' | 'right';
  name: string;
  score: number;
  cardsCount: number;
  avatarAlienId?: string;
  isTurn?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  capturedCount?: number;
  chatBubble?: string | null;
}

export function TableSeatPlaque({
  position,
  name,
  score,
  cardsCount,
  avatarAlienId = 'heatblast',
  isTurn = false,
  isWinner = false,
  isLoser = false,
  capturedCount = 1,
  chatBubble = null,
}: SeatPlaqueProps) {
  const badgeColorClass =
    position === 'bottom'
      ? 'badge-green'
      : position === 'left'
      ? 'badge-red'
      : position === 'top'
      ? 'badge-purple'
      : 'badge-cyan';

  return (
    <div
      className={`s4-seat s4-seat-${position} ${isTurn ? 's4-active-turn' : ''} ${
        isWinner ? 's4-winner-seat' : ''
      } ${isLoser ? 's4-loser-seat' : ''}`}
    >
      {/* Teen Patti Winner / Loser Card Delta Popup right above the Seat */}
      {isWinner && (
        <div className="tp-seat-pot-badge tp-pot-won">
          👑 TOOK +{capturedCount} CARD{capturedCount > 1 ? 'S' : ''}! 🃏
        </div>
      )}
      {isLoser && (
        <div className="tp-seat-pot-badge tp-pot-lost">
          -1 CARD LOST 🃏
        </div>
      )}
      {!isWinner && !isLoser && chatBubble && (
        <div className="s4-chat-bubble">{chatBubble}</div>
      )}

      <div className="s4-pedestal-avatar">
        {isWinner && <span className="tp-seat-crown">👑</span>}
        <img
          src={`/images/aliens/${avatarAlienId}.svg`}
          alt={name}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/images/aliens/heatblast.svg';
          }}
        />
        {isTurn && (
          <span className="s4-dealer-chip" title="Active Turn">
            D
          </span>
        )}
      </div>

      <div className={`s4-name-score-pill ${badgeColorClass}`}>
        <span className="s4-pill-name">{name}</span>
        <span className="s4-pill-score">
          ★{score} • 🃏{cardsCount}
        </span>
      </div>
    </div>
  );
}

/**
 * 4-Corner / 4-Side Teen Patti & Spades Card Table (`SpadesFourSeatArena`):
 * - Pure, Simple Childhood Trump Card Rules (tap 1 of 6 skills -> highest number wins!)
 * - Smaller player card in bottom hand dock (`154px–168px`) with a large, prominent character portrait.
 * - Teen Patti-style "WHO TOOK THE CARDS" directional pot sweep:
 *   When a round resolves, a bright golden Teen Patti banner + directional arrow points to the
 *   exact winning seat (`bottom`, `top`, `left`, or `right`), the winner's seat lights up with
 *   a golden crown & `👑 TOOK +X CARDS!`, and all defeated cards in the center pot physically
 *   sweep directly into the winner's seat!
 */
export function SpadesFourSeatArena({
  seats,
  isRoundResult,
  myActiveCard,
  canSelectStat,
  onSelectStat,
  selectedStat,
  activeStatPool = CORE_SIX_STATS,
  turnPromptText,
}: SpadesFourSeatArenaProps) {
  // Rotate seats so `isMe` is always index 0 (Bottom)
  const meIndex = Math.max(
    0,
    seats.findIndex((s) => s.isMe)
  );
  const rotated = [...seats.slice(meIndex), ...seats.slice(0, meIndex)];

  const mySeat = rotated[0];
  const opponents = rotated.slice(1);

  let leftSeat: ArenaSeatPlayer | null = null;
  let topSeat: ArenaSeatPlayer | null = null;
  let rightSeat: ArenaSeatPlayer | null = null;

  if (opponents.length === 1) {
    topSeat = opponents[0];
  } else if (opponents.length === 2) {
    leftSeat = opponents[0];
    rightSeat = opponents[1];
  } else if (opponents.length >= 3) {
    leftSeat = opponents[0];
    topSeat = opponents[1];
    rightSeat = opponents[2];
  }

  // Identify which seat position won the round ('bottom' | 'top' | 'left' | 'right' | null)
  let winnerPos: 'bottom' | 'top' | 'left' | 'right' | null = null;
  let winnerSeat: ArenaSeatPlayer | null = null;
  if (isRoundResult) {
    if (mySeat?.isWinner) {
      winnerPos = 'bottom';
      winnerSeat = mySeat;
    } else if (topSeat?.isWinner) {
      winnerPos = 'top';
      winnerSeat = topSeat;
    } else if (leftSeat?.isWinner) {
      winnerPos = 'left';
      winnerSeat = leftSeat;
    } else if (rightSeat?.isWinner) {
      winnerPos = 'right';
      winnerSeat = rightSeat;
    }
  }

  const capturedCardsCount = Math.max(1, rotated.length - 1);
  const winnerStatVal =
    winnerSeat && selectedStat && winnerSeat.playedCard
      ? winnerSeat.playedCard.stats[selectedStat]
      : null;

  const directionArrow =
    winnerPos === 'bottom'
      ? '⬇'
      : winnerPos === 'top'
      ? '⬆'
      : winnerPos === 'left'
      ? '⬅'
      : winnerPos === 'right'
      ? '➡'
      : '⚡';

  // Teen Patti directional sweep: defeated cards fly directly toward the winning seat!
  const getSweepStateForSeat = (seat: ArenaSeatPlayer): CardSweepState => {
    if (!isRoundResult || !winnerPos) return 'none';
    if (seat.isWinner) return 'captured-winner';
    if (winnerPos === 'bottom') return 'sweep-to-bottom';
    if (winnerPos === 'top') return 'sweep-to-top';
    if (winnerPos === 'left') return 'sweep-to-left';
    return 'sweep-to-right';
  };

  return (
    <div className="s4-casino-stage">
      {/* Top Opponent Seat */}
      {topSeat && (
        <TableSeatPlaque
          position="top"
          name={topSeat.name}
          score={topSeat.score}
          cardsCount={topSeat.cardsCount}
          avatarAlienId={topSeat.avatarAlienId}
          isTurn={topSeat.isTurn}
          isWinner={Boolean(isRoundResult && topSeat.isWinner)}
          isLoser={Boolean(isRoundResult && winnerPos && !topSeat.isWinner)}
          capturedCount={capturedCardsCount}
          chatBubble={topSeat.chatBubble}
        />
      )}

      {/* Left Opponent Seat */}
      {leftSeat && (
        <TableSeatPlaque
          position="left"
          name={leftSeat.name}
          score={leftSeat.score}
          cardsCount={leftSeat.cardsCount}
          avatarAlienId={leftSeat.avatarAlienId}
          isTurn={leftSeat.isTurn}
          isWinner={Boolean(isRoundResult && leftSeat.isWinner)}
          isLoser={Boolean(isRoundResult && winnerPos && !leftSeat.isWinner)}
          capturedCount={capturedCardsCount}
          chatBubble={leftSeat.chatBubble}
        />
      )}

      {/* Right Opponent Seat */}
      {rightSeat && (
        <TableSeatPlaque
          position="right"
          name={rightSeat.name}
          score={rightSeat.score}
          cardsCount={rightSeat.cardsCount}
          avatarAlienId={rightSeat.avatarAlienId}
          isTurn={rightSeat.isTurn}
          isWinner={Boolean(isRoundResult && rightSeat.isWinner)}
          isLoser={Boolean(isRoundResult && winnerPos && !rightSeat.isWinner)}
          capturedCount={capturedCardsCount}
          chatBubble={rightSeat.chatBubble}
        />
      )}

      {/* Bottom-Left Local Player Seat ("You") */}
      {mySeat && (
        <TableSeatPlaque
          position="bottom"
          name={mySeat.name}
          score={mySeat.score}
          cardsCount={mySeat.cardsCount}
          avatarAlienId={mySeat.avatarAlienId}
          isTurn={mySeat.isTurn}
          isWinner={Boolean(isRoundResult && mySeat.isWinner)}
          isLoser={Boolean(isRoundResult && winnerPos && !mySeat.isWinner)}
          capturedCount={capturedCardsCount}
          chatBubble={mySeat.chatBubble}
        />
      )}

      {/* Royal Teen Patti / Spades Wooden-Rimmed Crimson Velvet Table */}
      <div className="s4-crimson-oval-table">
        <div className="s4-inner-felt-line" />

        {/* Teen Patti Center Pot Chip at Top of Table Felt */}
        <div className="tp-center-pot-chip mono">
          <span>🃏 TABLE POT: {rotated.length} CARDS</span>
          {selectedStat && (
            <span className="tp-pot-skill-tag">
              ★ SKILL: {selectedStat.toUpperCase()}
            </span>
          )}
        </div>

        {!isRoundResult ? (
          <div className="s4-open-felt-prompt">
            <div className="s4-turn-callout">
              <span>{turnPromptText}</span>
            </div>
          </div>
        ) : (
          <div className="s4-center-thrown-pot">
            {/* Crystal-Clear Teen Patti "WHO TOOK THE CARDS" Trophy Callout */}
            <div
              className={`tp-who-took-banner ${
                winnerPos === 'bottom'
                  ? 'tp-banner-you-won'
                  : winnerPos
                  ? 'tp-banner-opp-won'
                  : 'tp-banner-tie'
              }`}
            >
              {winnerSeat ? (
                <>
                  <span className="tp-banner-arrow">{directionArrow}</span>
                  <span>
                    👑{' '}
                    <strong>
                      {winnerSeat.isMe ? 'YOU' : winnerSeat.name.toUpperCase()}
                    </strong>{' '}
                    WON {selectedStat?.toUpperCase()}{' '}
                    {winnerStatVal !== null ? `(${winnerStatVal})` : ''} &amp; TOOK ALL{' '}
                    {rotated.length} CARDS!
                  </span>
                  <span className="tp-banner-arrow">{directionArrow}</span>
                </>
              ) : (
                <span>🤝 ROUND TIED ON {selectedStat?.toUpperCase()} — NO CARDS TAKEN!</span>
              )}
            </div>

            <div className={`s4-thrown-cards-grid players-${rotated.length}`}>
              {topSeat && topSeat.playedCard && (
                <div className="s4-thrown-slot slot-top">
                  <Card
                    alien={topSeat.playedCard}
                    playerName={topSeat.name}
                    takenByWinnerName={
                      winnerSeat && !topSeat.isWinner
                        ? winnerSeat.isMe
                          ? 'YOU'
                          : winnerSeat.name
                        : null
                    }
                    isSelectable={false}
                    selectedStat={selectedStat}
                    activeStatPool={activeStatPool}
                    compact={true}
                    tableThrown={true}
                    throwDirection="from-top"
                    isWinner={Boolean(topSeat.isWinner)}
                    isTiedTop={Boolean(topSeat.isTiedTop)}
                    isLoser={Boolean(winnerSeat && !topSeat.isWinner)}
                    stealAnimState={getSweepStateForSeat(topSeat)}
                  />
                </div>
              )}

              {leftSeat && leftSeat.playedCard && (
                <div className="s4-thrown-slot slot-left">
                  <Card
                    alien={leftSeat.playedCard}
                    playerName={leftSeat.name}
                    takenByWinnerName={
                      winnerSeat && !leftSeat.isWinner
                        ? winnerSeat.isMe
                          ? 'YOU'
                          : winnerSeat.name
                        : null
                    }
                    isSelectable={false}
                    selectedStat={selectedStat}
                    activeStatPool={activeStatPool}
                    compact={true}
                    tableThrown={true}
                    throwDirection="from-left"
                    isWinner={Boolean(leftSeat.isWinner)}
                    isTiedTop={Boolean(leftSeat.isTiedTop)}
                    isLoser={Boolean(winnerSeat && !leftSeat.isWinner)}
                    stealAnimState={getSweepStateForSeat(leftSeat)}
                  />
                </div>
              )}

              {rightSeat && rightSeat.playedCard && (
                <div className="s4-thrown-slot slot-right">
                  <Card
                    alien={rightSeat.playedCard}
                    playerName={rightSeat.name}
                    takenByWinnerName={
                      winnerSeat && !rightSeat.isWinner
                        ? winnerSeat.isMe
                          ? 'YOU'
                          : winnerSeat.name
                        : null
                    }
                    isSelectable={false}
                    selectedStat={selectedStat}
                    activeStatPool={activeStatPool}
                    compact={true}
                    tableThrown={true}
                    throwDirection="from-right"
                    isWinner={Boolean(rightSeat.isWinner)}
                    isTiedTop={Boolean(rightSeat.isTiedTop)}
                    isLoser={Boolean(winnerSeat && !rightSeat.isWinner)}
                    stealAnimState={getSweepStateForSeat(rightSeat)}
                  />
                </div>
              )}

              {mySeat && (mySeat.playedCard || myActiveCard) && (
                <div className="s4-thrown-slot slot-bottom">
                  <Card
                    alien={mySeat.playedCard || myActiveCard}
                    playerName="YOU"
                    takenByWinnerName={
                      winnerSeat && !mySeat.isWinner ? winnerSeat.name : null
                    }
                    isSelectable={false}
                    selectedStat={selectedStat}
                    activeStatPool={activeStatPool}
                    compact={true}
                    tableThrown={true}
                    throwDirection="from-bottom"
                    isWinner={Boolean(mySeat.isWinner)}
                    isTiedTop={Boolean(mySeat.isTiedTop)}
                    isLoser={Boolean(winnerSeat && !mySeat.isWinner)}
                    stealAnimState={getSweepStateForSeat(mySeat)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Active Single-Card Hand Dock (Compact size with large character portrait!) */}
        {!isRoundResult && myActiveCard && (
          <div className="s4-my-single-card-dock">
            <Card
              alien={myActiveCard}
              playerName="YOUR CARD"
              onStatSelect={onSelectStat}
              isSelectable={canSelectStat}
              selectedStat={selectedStat}
              activeStatPool={activeStatPool}
              compact={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
