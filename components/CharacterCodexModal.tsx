'use client';

import React, { useMemo, useState } from 'react';
import { characters, CHARACTER_VALIDATION_SUMMARY } from '../data/characters';
import { Alien, ALL_STATS_METADATA, StatKey } from '../lib/types';
import Card from './Card';

export default function CharacterCodexModal({
  isOpen,
  onClose,
  onSelectAlien,
  selectedAlienId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectAlien?: (alien: Alien) => void;
  selectedAlienId?: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [elementFilter, setElementFilter] = useState<string>('ALL');
  const [sortByStat, setSortByStat] = useState<StatKey | 'name'>('name');
  const [inspectedAlien, setInspectedAlien] = useState<Alien>(characters[0]);

  const roles = useMemo(
    () => ['ALL', ...Array.from(new Set(characters.map((c) => c.role)))],
    []
  );
  const elements = useMemo(
    () => ['ALL', ...Array.from(new Set(characters.map((c) => c.element)))],
    []
  );

  const filteredCharacters = useMemo(() => {
    return characters
      .filter((c) => {
        const matchesQuery =
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.species.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.element.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === 'ALL' || c.role === roleFilter;
        const matchesElement = elementFilter === 'ALL' || c.element === elementFilter;
        return matchesQuery && matchesRole && matchesElement;
      })
      .sort((a, b) => {
        if (sortByStat === 'name') return a.name.localeCompare(b.name);
        return b.stats[sortByStat] - a.stats[sortByStat];
      });
  }, [searchQuery, roleFilter, elementFilter, sortByStat]);

  if (!isOpen) return null;

  return (
    <div className="oa-modal-backdrop" onClick={onClose}>
      <div className="oa-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid #28422d',
            background: '#07100a',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#baff39', textTransform: 'uppercase' }}>
              Omnitrix DNA Codex ({characters.length} Aliens)
            </h2>
            <p className="mono" style={{ margin: '4px 0 0', fontSize: '11px', color: '#93a892' }}>
              Source: {CHARACTER_VALIDATION_SUMMARY.sourceExcelFile} • 15-Attribute Balanced Deck
            </p>
          </div>
          <button type="button" onClick={onClose} className="oa-btn mono">
            ✕ CLOSE
          </button>
        </div>

        {/* Filters */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            padding: '12px 20px',
            borderBottom: '1px solid #28422d',
            background: '#09130c',
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search alien, species, element..."
            className="oa-input"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="oa-select"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                Role: {r}
              </option>
            ))}
          </select>
          <select
            value={elementFilter}
            onChange={(e) => setElementFilter(e.target.value)}
            className="oa-select"
          >
            {elements.map((el) => (
              <option key={el} value={el}>
                Element: {el}
              </option>
            ))}
          </select>
          <select
            value={sortByStat}
            onChange={(e) => setSortByStat(e.target.value as StatKey | 'name')}
            className="oa-select"
          >
            <option value="name">Sort by: Name (A–Z)</option>
            {ALL_STATS_METADATA.map((s) => (
              <option key={s.key} value={s.key}>
                Sort by Highest: {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Body */}
        <div className="oa-codex-body">
          <div className="oa-codex-grid">
            {filteredCharacters.map((alien) => {
              const isSelected = inspectedAlien.id === alien.id;
              const isStarter = selectedAlienId === alien.id;
              return (
                <div
                  key={alien.id}
                  onClick={() => setInspectedAlien(alien)}
                  className={`oa-starter-item ${isSelected ? 'selected' : ''}`}
                  style={{ padding: '10px', cursor: 'pointer', justifyContent: 'space-between' }}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#fff' }}>
                      {alien.name}
                    </div>
                    <div className="mono" style={{ fontSize: '10px', color: '#93a892' }}>
                      {alien.species}
                    </div>
                  </div>

                  <img
                    src={alien.fallbackImageUrl}
                    alt={alien.name}
                    style={{ width: '100%', height: '84px', objectFit: 'contain', margin: '8px 0' }}
                  />

                  <div
                    className="mono"
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      color: '#baff39',
                    }}
                  >
                    <span>{alien.role}</span>
                    <span>
                      {sortByStat === 'name'
                        ? `AVG ${Math.round(
                            (alien.stats.strength +
                              alien.stats.speed +
                              alien.stats.energy +
                              alien.stats.intelligence +
                              alien.stats.durability) /
                              5
                          )}`
                        : `${alien.stats[sortByStat]}`}
                    </span>
                  </div>

                  {onSelectAlien && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAlien(alien);
                        onClose();
                      }}
                      className={isStarter ? 'oa-btn oa-btn-primary' : 'oa-btn'}
                      style={{ width: '100%', marginTop: '8px', padding: '6px', fontSize: '10px' }}
                    >
                      {isStarter ? '✓ Selected' : 'Select Alien'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Card
              alien={inspectedAlien}
              activeStatPool={ALL_STATS_METADATA.map((s) => s.key)}
            />
            <div className="oa-panel" style={{ width: '100%', padding: '14px' }}>
              <div
                className="mono"
                style={{ fontSize: '11px', fontWeight: 800, color: '#baff39', marginBottom: '6px' }}
              >
                HOMEWORLD: {inspectedAlien.homeworld.toUpperCase()}
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#cde0c9', lineHeight: 1.5 }}>
                {inspectedAlien.lore}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {inspectedAlien.abilities.map((ab) => (
                  <span key={ab} className="oa-mini-tag mono">
                    {ab}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
