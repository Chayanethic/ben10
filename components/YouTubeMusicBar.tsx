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
  // Default TV to visible when a track is playing so YouTube never blocks a 1x1px iframe!
  const [showTv, setShowTv] = useState<boolean>(true);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchItem[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Draggable Floating TV Position (Move anywhere on screen!)
  const [tvPos, setTvPos] = useState<{ x: number; y: number }>({ x: 10, y: 66 });
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
    origX: 10,
    origY: 66,
  });

  const activeVideoId = youtubeState?.isPlaying ? youtubeState.videoId : null;

  // Send a command to the YouTube IFrame Player via postMessage (playVideo, mute, unMute, setVolume)
  const sendYouTubeCommand = (func: string, args: unknown[] = []) => {
    try {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(
        JSON.stringify({
          event: 'command',
          func,
          args,
        }),
        '*'
      );
    } catch {
      // ignore cross-origin frame timing errors
    }
  };

  // Whenever a new song starts playing, auto-open the floating TV and trigger play + unmute!
  useEffect(() => {
    if (!activeVideoId) return;
    setShowTv(true);
    const t1 = setTimeout(() => {
      sendYouTubeCommand('playVideo');
      if (!localMuted) {
        sendYouTubeCommand('unMute');
        sendYouTubeCommand('setVolume', [100]);
      }
    }, 650);
    const t2 = setTimeout(() => {
      sendYouTubeCommand('playVideo');
      if (!localMuted) {
        sendYouTubeCommand('unMute');
        sendYouTubeCommand('setVolume', [100]);
      }
    }, 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideoId, youtubeState?.updatedAt]);

  // Toggle mute/unmute smoothly via YouTube JS API without restarting the song!
  const handleToggleMute = () => {
    const nextMuted = !localMuted;
    setLocalMuted(nextMuted);
    if (nextMuted) {
      sendYouTubeCommand('mute');
    } else {
      sendYouTubeCommand('unMute');
      sendYouTubeCommand('setVolume', [100]);
      sendYouTubeCommand('playVideo');
    }
  };

  // Force-unlock audio playback on mobile/desktop browsers if autoplay was paused
  const handleForcePlayAudio = () => {
    setLocalMuted(false);
    sendYouTubeCommand('unMute');
    sendYouTubeCommand('setVolume', [100]);
    sendYouTubeCommand('playVideo');
  };

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
    setLocalMuted(false);
    setShowTv(true);
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
    const maxX = typeof window !== 'undefined' ? window.innerWidth - 224 : 800;
    const maxY = typeof window !== 'undefined' ? window.innerHeight - 165 : 600;
    setTvPos({
      x: Math.max(6, Math.min(maxX, dragRef.current.origX + dx)),
      y: Math.max(6, Math.min(maxY, dragRef.current.origY + dy)),
    });
  };

  const onPointerUpTv = () => {
    dragRef.current.dragging = false;
  };

  return (
    <div className="oa-yt-bar-wrap">
      <div className="oa-yt-pill">
        <span className="oa-yt-icon">🎵</span>
        <div className="oa-yt-info">
          {activeVideoId && youtubeState ? (
            <span className="oa-yt-marquee mono">
              <strong>NOW PLAYING:</strong> {youtubeState.title}
            </span>
          ) : (
            <span className="oa-yt-marquee mono" style={{ color: '#94a3b8' }}>
              {isAdmin
                ? 'Admin DJ: Tap PLAY SONG to broadcast YouTube music to all players'
                : 'Waiting for Admin to play a YouTube song...'}
            </span>
          )}
        </div>

        {activeVideoId && (
          <>
            <button
              type="button"
              onClick={handleForcePlayAudio}
              className="oa-yt-mini-btn active mono"
              title="Tap if your browser blocked autoplay sound"
            >
              ▶ HEAR
            </button>
            <button
              type="button"
              onClick={handleToggleMute}
              className={`oa-yt-mini-btn mono ${localMuted ? 'muted' : 'active'}`}
            >
              {localMuted ? '🔇 UNMUTE' : '🔊 MUTE'}
            </button>
            <button
              type="button"
              onClick={() => setShowTv((v) => !v)}
              className={`oa-yt-mini-btn mono ${showTv ? 'active' : ''}`}
            >
              📺 {showTv ? 'MINIMIZE' : 'SHOW TV'}
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
              🎵 {activeVideoId ? 'CHANGE SONG' : 'PLAY SONG'}
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

      {/* Movable / Draggable Floating TV Window:
          IMPORTANT: Never shrink iframe below 200x114px! When minimized (`showTv === false`),
          keep full 216x122px dimensions and park off-screen (`left: -9999px`) so YouTube
          never pauses or blocks audio playback! */}
      {activeVideoId && (
        <div
          style={
            showTv
              ? {
                  position: 'fixed',
                  left: `${tvPos.x}px`,
                  top: `${tvPos.y}px`,
                  zIndex: 95,
                  width: '220px',
                  background: '#0f172a',
                  border: '2px solid #34d399',
                  borderRadius: '12px',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.88)',
                  overflow: 'hidden',
                  touchAction: 'none',
                }
              : {
                  position: 'fixed',
                  left: '-9999px',
                  top: '0px',
                  width: '220px',
                  height: '150px',
                  opacity: 1,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                }
          }
        >
          <div
            onPointerDown={onPointerDownTv}
            onPointerMove={onPointerMoveTv}
            onPointerUp={onPointerUpTv}
            style={{
              padding: '4px 8px',
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
            <span>✥ DRAG YOUTUBE TV</span>
            <button
              type="button"
              onClick={() => setShowTv(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#cbd5e1',
                fontSize: '10px',
                fontWeight: 800,
              }}
              title="Minimize TV (Audio keeps playing!)"
            >
              _ HIDE
            </button>
          </div>

          <iframe
            ref={iframeRef}
            key={activeVideoId}
            width="216"
            height="122"
            src={`https://www.youtube.com/embed/${encodeURIComponent(
              activeVideoId
            )}?autoplay=1&enablejsapi=1&playsinline=1&controls=1&rel=0`}
            title={youtubeState?.title || 'YouTube TV'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            onLoad={() => {
              sendYouTubeCommand('playVideo');
              if (localMuted) {
                sendYouTubeCommand('mute');
              } else {
                sendYouTubeCommand('unMute');
                sendYouTubeCommand('setVolume', [100]);
              }
            }}
            style={{ border: 0, display: 'block', background: '#000' }}
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
              <strong style={{ color: '#34d399', fontSize: '15px' }}>
                🎵 ADMIN YOUTUBE DJ (PLAYS FOR ALL PLAYERS)
              </strong>
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
                placeholder="Type any song name (e.g. Ben 10, Believer, Arijit) or paste YouTube URL..."
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
                maxHeight: '280px',
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
