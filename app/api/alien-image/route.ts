import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { CHARACTER_BY_ID } from '../../../data/characters';

/**
 * Real Character Image Proxy with Multi-Source Resolution & SVG Fallback
 * `/api/alien-image?id=<characterId>`
 *
 * 1. Fetches the exact `imageUrl` from your uploaded `Omnitrix_Character_Image_Library.xlsx`
 *    (`https://www.wikihow.com/images/thumb/...`) using server-side headers so the browser
 *    never gets blocked by Referer/hotlink checks.
 * 2. For `upchuck` (where row 18 in the Excel sheet had `/7/76/` instead of the WikiHow MD5 hash
 *    for `All-Ben-10-Aliens-Step-17.jpg`, which is `/4/4c/`), automatically tries both the exact
 *    Excel URL and the computed MediaWiki MD5 hash URL before falling back to the local SVG illustration.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawId = (searchParams.get('id') || 'heatblast').trim().toLowerCase();
  const mode = (searchParams.get('mode') || 'auto').trim().toLowerCase();

  const alien = CHARACTER_BY_ID[rawId];
  const safeId = alien ? alien.id : 'heatblast';
  const svgPath = path.join(process.cwd(), 'public', 'images', 'aliens', `${safeId}.svg`);

  const serveLocalSvg = () => {
    try {
      const svgContent = fs.readFileSync(svgPath, 'utf-8');
      return new NextResponse(svgContent, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch {
      return new NextResponse('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>', {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    }
  };

  if (mode === 'svg' || !alien?.imageUrl) {
    return serveLocalSvg();
  }

  // Candidate URLs to try server-side (exact Excel URL first, then corrected MD5 path for Step-17 if upchuck)
  const candidateUrls = [alien.imageUrl];
  if (safeId === 'upchuck') {
    candidateUrls.push(
      'https://www.wikihow.com/images/thumb/4/4c/All-Ben-10-Aliens-Step-17.jpg/728px-All-Ben-10-Aliens-Step-17.jpg.webp'
    );
  }

  for (const url of candidateUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://www.wikihow.com/',
          Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      clearTimeout(timer);

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'image/webp';
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer && arrayBuffer.byteLength > 250) {
          return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400',
            },
          });
        }
      }
    } catch {
      clearTimeout(timer);
    }
  }

  return serveLocalSvg();
}
