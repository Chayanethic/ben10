'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RoomYouTubeState } from '../lib/types';

interface YouTubeSearchItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
}

export default function YouTubeMusicBar({
  youtubeState,
  isAdmin,
  onAdminChangeTrack,
}: {
  youtubeState: RoomYouTubeState | null | undefined;
  isAdmin: boolean;
  onAdminChangeTrack: (nextState: RoomYouTubeState | null) => void;
}) {
  const [localMuted, setLocalMuted] = useState<boolean>(false);
  const [showTv, setShowTv] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchItem[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  // Draggable Floating TV Position (Move anywhere on screen!)
  const [tvPos, setTvPos] = useState<{ x: number; y: number }>({ x: 14, y: 88 });
  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 14,
    origY: 88,
  });

  useEffect(() => {
    if (drawerOpen && searchResults.length === 0) {
      handleSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  const handleSearch = async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.items) setSearchResults(data.items);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const handleSelectTrack = (item: YouTubeSearchItem) => {
    onAdminChangeTrack({
      videoId: item.videoId,
      title: item.title,
      channelTitle: item.channelTitle,
      thumbnailUrl: item.thumbnailUrl,
      isPlaying: true,
      startedBy: 'Admin',
      updatedAt: Date.now(),
    });
    setDrawerOpen(false);
  };

  const onPointerDownTv = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: tvPos.x,
      origY: tvPos.y,
    };
  };

  const onPointerMoveTv = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const maxX = typeof window !== 'undefined' ? window.innerWidth - 240 : 800;
    const maxY = typeof window !== 'undefined' ? window.innerHeight - 170 : 600;
    setTvPos({
      x: Math.max(6, Math.min(maxX, dragRef.current.origX + dx)),
      y: Math.max(6, Math.min(maxY, dragRef.current.origY + dy)),
    });
  };

  const onPointerUpTv = () => {
    dragRef.current.dragging = false;
  };

  const activeVideoId = youtubeState?.isPlaying ? youtubeState.videoId : null;

  return (
    <div className="oa-yt-bar-wrap">
      <div className="oa-yt-pill">
        <span className="oa-yt-icon">▶</span>
        <div className="oa-yt-info">
          {activeVideoId && youtubeState ? (
            <span className="oa-yt-marquee mono">
              <strong>SONG:</strong> {youtubeState.title}
            </span>
          ) : (
            <span className="oa-yt-marquee mono" style={{ color: '#94a3b8' }}>
              {isAdmin
                ? 'Admin DJ: Select a YouTube song to play for all players'
                : 'No YouTube song playing right now'}
            </span>
          )}
        </div>

        {activeVideoId && (
          <>
            <button
              type="button"
              onClick={() => setLocalMuted((m) => !m)}
              className={`oa-yt-mini-btn mono ${localMuted ? 'muted' : 'active'}`}
            >
              {localMuted ? '🔇 UNMUTE' : '🔊 MUTE'}
            </button>
            <button
              type="button"
              onClick={() => setShowTv((v) => !v)}
              className={`oa-yt-mini-btn mono ${showTv ? 'active' : ''}`}
            >
              📺 {showTv ? 'HIDE TV' : 'TV'}
            </button>
          </>
        )}

        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => setDrawerOpen((o) => !o)}
              className="oa-yt-mini-btn admin mono"
            >
              🎵 {activeVideoId ? 'CHANGE' : 'PLAY SONG'}
            </button>
            {activeVideoId && (
              <button
                type="button"
                onClick={() => onAdminChangeTrack(null)}
                className="oa-yt-mini-btn danger mono"
              >
                ⏹ STOP
              </button>
            )}
          </>
        )}
      </div>

      {/* Movable / Draggable Floating TV Window */}
      {activeVideoId && (
        <div
          style={
            showTv
              ? {
                  position: 'fixed',
                  left: `${tvPos.x}px`,
                  top: `${tvPos.y}px`,
                  zIndex: 90,
                  width: '236px',
                  background: '#0f172a',
                  border: '2px solid #34d399',
                  borderRadius: '12px',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.85)',
                  overflow: 'hidden',
                  touchAction: 'none',
                }
              : {
                  position: 'fixed',
                  bottom: '2px',
                  right: '2px',
                  width: '1px',
                  height: '1px',
                  opacity: 0.01,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                }
          }
        >
          {showTv && (
            <div
              onPointerDown={onPointerDownTv}
              onPointerMove={onPointerMoveTv}
              onPointerUp={onPointerUpTv}
              style={{
                padding: '5px 8px',
                background: '#1e293b',
                color: '#34d399',
                fontSize: '10px',
                fontWeight: 800,
                cursor: 'grab',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                userSelect: 'none',
              }}
            >
              <span>✥ DRAG TV ANYWHERE</span>
              <button
                type="button"
                onClick={() => setShowTv(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: '11px' }}
              >
                ✕
              </button>
            </div>
          )}
          <iframe
            key={`${activeVideoId}-${localMuted ? 'muted' : 'unmuted'}`}
            width={showTv ? '232' : '1'}
            height={showTv ? '130' : '1'}
            src={`https://www.youtube.com/embed/${encodeURIComponent(
              activeVideoId
            )}?autoplay=1&loop=1&playlist=${encodeURIComponent(
              activeVideoId
            )}&controls=1&playsinline=1&mute=${localMuted ? 1 : 0}`}
            title={youtubeState?.title || 'YouTube TV'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            style={{ border: 0, display: 'block' }}
          />
        </div>
      )}

      {isAdmin && drawerOpen && (
        <div className="oa-modal-backdrop" onClick={() => setDrawerOpen(false)}>
          <div
            className="oa-modal-content"
            style={{ maxWidth: '500px', padding: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
              }}
            >
              <strong style={{ color: '#34d399', fontSize: '15px' }}>🎵 ADMIN YOUTUBE DJ</strong>
              <button type="button" onClick={() => setDrawerOpen(false)} className="oa-icon-btn">
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch(searchQuery);
              }}
              style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search YouTube song or paste URL..."
                className="oa-input"
              />
              <button type="submit" disabled={searching} className="oa-btn oa-btn-primary mono">
                {searching ? '...' : 'SEARCH'}
              </button>
            </form>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {searchResults.map((item) => (
                <div key={item.videoId} className="oa-slot-card" style={{ padding: '8px' }}>
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    style={{
                      width: '56px',
                      height: '40px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#f8fafc',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                    </div>
                    <div className="mono" style={{ fontSize: '10px', color: '#94a3b8' }}>
                      {item.channelTitle}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectTrack(item)}
                    className="oa-btn oa-btn-primary mono"
                  >
                    ▶ PLAY
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
