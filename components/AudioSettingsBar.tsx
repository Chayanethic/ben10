'use client';

import React, { useEffect, useState } from 'react';
import { AudioSettings, soundEngine } from '../lib/soundEngine';

export default function AudioSettingsBar() {
  const [settings, setSettings] = useState<AudioSettings>(soundEngine.getSettings());
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    return soundEngine.subscribe(setSettings);
  }, []);

  const toggleMute = () => {
    const nextMuted = !settings.muted;
    soundEngine.updateSettings({ muted: nextMuted });
    if (!nextMuted) soundEngine.playSfx('button-click');
  };

  const toggleMusic = () => {
    const nextMusic = !settings.musicEnabled;
    soundEngine.updateSettings({ musicEnabled: nextMusic, muted: false });
    soundEngine.playSfx('button-click');
    if (nextMusic) soundEngine.setMusicTrack('menu');
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button
        type="button"
        onClick={toggleMute}
        className="oa-btn mono"
        style={
          settings.muted
            ? { borderColor: '#ff6b6b', color: '#fecaca' }
            : { borderColor: '#3b6342', color: '#baff39' }
        }
      >
        {settings.muted ? '🔇 MUTED' : '🔊 SFX ON'}
      </button>

      <button
        type="button"
        onClick={toggleMusic}
        className="oa-btn mono"
        style={
          settings.musicEnabled && !settings.muted
            ? {
                background: 'rgba(186, 255, 57, 0.2)',
                borderColor: '#baff39',
                color: '#baff39',
              }
            : undefined
        }
      >
        {settings.musicEnabled && !settings.muted ? '🎵 MUSIC ON' : '🎵 MUSIC OFF'}
      </button>

      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
          soundEngine.playSfx('button-click');
        }}
        className="oa-btn mono"
        aria-label="Audio and Motion Settings"
      >
        ⚙
      </button>

      {open && (
        <div
          className="oa-panel"
          style={{
            position: 'absolute',
            right: 0,
            top: '44px',
            width: '260px',
            zIndex: 80,
            padding: '14px',
            border: '1px solid #baff39',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
              paddingBottom: '6px',
              borderBottom: '1px solid #28422d',
            }}
          >
            <span className="mono" style={{ fontSize: '11px', fontWeight: 800, color: '#baff39' }}>
              AUDIO &amp; MOTION
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#93a892' }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div
              className="mono"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                marginBottom: '4px',
              }}
            >
              <span>SFX Volume</span>
              <span>{Math.round(settings.sfxVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfxVolume}
              onChange={(e) =>
                soundEngine.updateSettings({
                  sfxVolume: parseFloat(e.target.value),
                  muted: false,
                })
              }
              style={{ width: '100%', accentColor: '#baff39' }}
            />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div
              className="mono"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                marginBottom: '4px',
              }}
            >
              <span>Music Volume</span>
              <span>{Math.round(settings.musicVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.musicVolume}
              onChange={(e) =>
                soundEngine.updateSettings({
                  musicVolume: parseFloat(e.target.value),
                  musicEnabled: true,
                  muted: false,
                })
              }
              style={{ width: '100%', accentColor: '#baff39' }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '8px',
              borderTop: '1px solid #28422d',
              fontSize: '11px',
            }}
          >
            <span>Reduced Motion</span>
            <button
              type="button"
              onClick={() =>
                soundEngine.updateSettings({ reducedMotion: !settings.reducedMotion })
              }
              className="oa-btn mono"
              style={{ padding: '4px 10px', fontSize: '10px' }}
            >
              {settings.reducedMotion ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
