'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { characters, CHARACTER_VALIDATION_SUMMARY } from '../data/characters';
import AudioSettingsBar from '../components/AudioSettingsBar';
import CharacterCodexModal from '../components/CharacterCodexModal';
import { soundEngine } from '../lib/soundEngine';

export default function ModeSelectionPage() {
  const [codexOpen, setCodexOpen] = useState(false);

  return (
    <main className="oa-shell">
      {/* Header */}
      <header className="oa-header">
        <div className="oa-brand">
          <div className="oa-logo-ring">
            <svg viewBox="0 0 100 100" width="26" height="26">
              <polygon points="22,18 78,18 57,50 78,82 22,82 43,50" fill="#baff39" />
            </svg>
          </div>
          <div>
            <span className="oa-brand-title">OMNITRIX ARENA</span>
            <span className="oa-brand-sub mono">
              ULTIMATE EDITION • {characters.length} ALIEN DECK
            </span>
          </div>
        </div>

        <div className="oa-nav-group">
          <button
            type="button"
            onClick={() => {
              soundEngine.playSfx('button-click');
              setCodexOpen(true);
            }}
            className="oa-btn oa-btn-primary mono"
          >
            ▦ ALIEN CODEX ({characters.length})
          </button>
          <AudioSettingsBar />
        </div>
      </header>

      {/* Hero Section */}
      <section className="oa-hero">
        <div className="oa-badge mono">
          ◉ {CHARACTER_VALIDATION_SUMMARY.totalRows} VERIFIED BEN 10 ALIENS • 15 ATTRIBUTES • HIDDEN HANDS
        </div>
        <h1>
          CHOOSE YOUR <span>BATTLE MODE</span>
        </h1>
        <p>
          Select a dedicated arena below. Opponent cards remain strictly hidden until a round is
          resolved, and the winner of each round claims the next turn.
        </p>
      </section>

      {/* Two Dedicated Mode Cards */}
      <section className="oa-mode-grid">
        <Link
          href="/computer"
          onClick={() => soundEngine.playSfx('boot-up')}
          className="oa-mode-card"
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="oa-badge mono">SOLO ARENA</span>
              <span style={{ fontSize: '28px' }}>⚡</span>
            </div>
            <h2>1. VS COMPUTER</h2>
            <p>
              Battle the Omnitrix Tactical AI across Easy, Normal, and Hard difficulties. Pick your
              starter alien, compare 5 or 15 attributes, and fight for turn ownership.
            </p>
            <ul className="oa-mode-features mono">
              <li>✓ Hidden CPU cards until round reveal</li>
              <li>✓ Fair AI choices using only its own private card</li>
              <li>✓ Winner of each round controls the next turn</li>
            </ul>
          </div>
          <div className="oa-mode-cta mono">
            <span>PLAY VS COMPUTER</span>
            <span>LAUNCH →</span>
          </div>
        </Link>

        <Link
          href="/multiplayer"
          onClick={() => soundEngine.playSfx('boot-up')}
          className="oa-mode-card"
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="oa-badge mono" style={{ color: '#22d3ee', borderColor: '#155e75' }}>
                2, 3, OR 4 PLAYERS
              </span>
              <span style={{ fontSize: '28px' }}>◉</span>
            </div>
            <h2>2. MULTIPLAYER</h2>
            <p>
              Create or join a live 2, 3, or 4-player battle room using a 6-character code. Ready
              up in the lobby, keep your hand private, and clash in real time.
            </p>
            <ul className="oa-mode-features mono">
              <li>✓ Server-isolated private hands (zero opponent peeking)</li>
              <li>✓ Live Ready check &amp; Host match start control</li>
              <li>✓ Instant AI Spar Bot fill for testing 2–4 player rooms</li>
            </ul>
          </div>
          <div className="oa-mode-cta mono">
            <span>OPEN MULTIPLAYER LOBBY</span>
            <span>ENTER →</span>
          </div>
        </Link>
      </section>

      {/* Quick Preview Strip of Character Cards */}
      <section className="oa-panel" style={{ marginTop: 'auto' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <span className="mono" style={{ fontSize: '12px', fontWeight: 800, color: '#baff39' }}>
            FEATURED OMNITRIX ROSTER (CLICK ANY ALIEN TO INSPECT ALL 15 STATS)
          </span>
          <button
            type="button"
            onClick={() => setCodexOpen(true)}
            className="oa-btn mono"
            style={{ fontSize: '11px', padding: '6px 12px' }}
          >
            OPEN FULL 23-CARD GALLERY →
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: '8px',
          }}
        >
          {characters.slice(0, 8).map((alien) => (
            <div
              key={alien.id}
              onClick={() => setCodexOpen(true)}
              className="oa-starter-item"
              style={{ cursor: 'pointer' }}
            >
              <img src={alien.fallbackImageUrl} alt={alien.name} />
              <span style={{ color: '#fff', fontSize: '11px' }}>{alien.name}</span>
              <span className="mono" style={{ fontSize: '9px', color: '#baff39' }}>
                {alien.role}
              </span>
            </div>
          ))}
        </div>
      </section>

      <CharacterCodexModal isOpen={codexOpen} onClose={() => setCodexOpen(false)} />
    </main>
  );
}
