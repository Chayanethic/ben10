import { NextRequest, NextResponse } from 'next/server';

export interface YouTubeTrackItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
}

/**
 * Built-in Curated Gaming / Sci-Fi / Action Tracks
 * Available immediately even before `NEXT_PUBLIC_YOUTUBE_API_KEY` is filled in `.env.local`,
 * or if the YouTube Data API v3 quota/key is missing.
 */
const CURATED_ARENA_TRACKS: YouTubeTrackItem[] = [
  {
    videoId: 'jfKfPfyJRdk',
    title: 'Lofi Hip Hop Radio — Beats to Study/Game To',
    channelTitle: 'Lofi Girl',
    thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
  },
  {
    videoId: '4xDzrJKXOOY',
    title: 'Synthwave Radio — ChillSynth / Retro Sci-Fi Gaming Beats',
    channelTitle: 'Lofi Girl Synthwave',
    thumbnailUrl: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
  },
  {
    videoId: '5qap5aO4i9A',
    title: 'Chillhop Arena Beats — Smooth Gaming Background Mix',
    channelTitle: 'Chillhop Music',
    thumbnailUrl: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
  },
  {
    videoId: 'DWcJFNfaw9c',
    title: 'Ambient Space & Sci-Fi Cyber Arena Soundtrack',
    channelTitle: 'Space Wave',
    thumbnailUrl: 'https://i.ytimg.com/vi/DWcJFNfaw9c/hqdefault.jpg',
  },
];

function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').slice(0, 11);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    const vParam = url.searchParams.get('v');
    if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
      return vParam;
    }
    if (url.pathname.includes('/embed/')) {
      const id = url.pathname.split('/embed/')[1]?.slice(0, 11);
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
  } catch {
    // Not a URL
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('q') || '').trim();

  if (!query) {
    return NextResponse.json({
      items: CURATED_ARENA_TRACKS,
      source: 'curated',
    });
  }

  // 1. Check if the user pasted a direct YouTube URL or 11-char Video ID
  const directVideoId = extractYouTubeVideoId(query);
  if (directVideoId) {
    return NextResponse.json({
      items: [
        {
          videoId: directVideoId,
          title: `YouTube Track (${directVideoId})`,
          channelTitle: 'Direct YouTube Link',
          thumbnailUrl: `https://i.ytimg.com/vi/${directVideoId}/hqdefault.jpg`,
        },
        ...CURATED_ARENA_TRACKS,
      ],
      source: 'direct_url',
    });
  }

  // 2. Use YouTube Data API v3 if YOUTUBE_API_KEY or NEXT_PUBLIC_YOUTUBE_API_KEY is configured in .env.local
  const apiKey =
    process.env.YOUTUBE_API_KEY ||
    process.env.NEXT_PUBLIC_YOUTUBE_API_KEY ||
    '';

  if (apiKey && !apiKey.includes('your-') && !apiKey.includes('YOUR_')) {
    try {
      const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=6&q=${encodeURIComponent(
        query
      )}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(ytUrl);
      if (res.ok) {
        const data = await res.json();
        const items: YouTubeTrackItem[] = (data.items || [])
          .filter((item: { id?: { videoId?: string } }) => Boolean(item?.id?.videoId))
          .map(
            (item: {
              id: { videoId: string };
              snippet?: {
                title?: string;
                channelTitle?: string;
                thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
              };
            }) => ({
              videoId: item.id.videoId,
              title: item.snippet?.title || 'YouTube Track',
              channelTitle: item.snippet?.channelTitle || 'YouTube',
              thumbnailUrl:
                item.snippet?.thumbnails?.medium?.url ||
                item.snippet?.thumbnails?.default?.url ||
                `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
            })
          );

        if (items.length > 0) {
          return NextResponse.json({
            items,
            source: 'youtube_api_v3',
          });
        }
      }
    } catch {
      // Fallback to curated filter below
    }
  }

  // 3. Fallback search across curated tracks if API key is not yet set in .env.local
  const filtered = CURATED_ARENA_TRACKS.filter(
    (t) =>
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.channelTitle.toLowerCase().includes(query.toLowerCase())
  );

  return NextResponse.json({
    items: filtered.length > 0 ? filtered : CURATED_ARENA_TRACKS,
    source: 'curated_fallback',
    note: 'Add NEXT_PUBLIC_YOUTUBE_API_KEY in .env.local for live YouTube keyword search, or paste any YouTube video URL/ID directly!',
  });
}
