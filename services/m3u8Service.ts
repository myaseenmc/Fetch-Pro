
import { Segment, PlaylistInfo, Variant } from '../types';

/**
 * Resolves a URL relative to a base URL
 */
const resolveUrl = (baseUrl: string, relativeUrl: string): string => {
  if (relativeUrl.startsWith('http')) return relativeUrl;
  
  const url = new URL(baseUrl);
  if (relativeUrl.startsWith('/')) {
    return url.origin + relativeUrl;
  }
  
  const path = url.pathname;
  const directory = path.substring(0, path.lastIndexOf('/') + 1);
  return url.origin + directory + relativeUrl;
};

/**
 * Parses an M3U8 file and determines if it's a master or media playlist
 */
export const parseM3U8 = async (playlistUrl: string): Promise<Omit<PlaylistInfo, 'id'>> => {
  const response = await fetch(playlistUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch playlist: ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split('\n');
  
  // Detect if it's a master playlist
  const isMaster = text.includes('#EXT-X-STREAM-INF');

  if (isMaster) {
    const variants: Variant[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const variantUrl = lines[i + 1]?.trim();
        if (variantUrl && !variantUrl.startsWith('#')) {
          const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
          const bwMatch = line.match(/BANDWIDTH=(\d+)/);
          const nameMatch = line.match(/NAME="([^"]+)"/);
          
          variants.push({
            url: resolveUrl(playlistUrl, variantUrl),
            resolution: resMatch ? resMatch[1] : undefined,
            bandwidth: bwMatch ? parseInt(bwMatch[1]) : undefined,
            name: nameMatch ? nameMatch[1] : undefined
          });
        }
      }
    }
    
    if (variants.length === 0) {
      throw new Error('Master playlist found but no variant streams detected.');
    }

    // SORT BY BANDWIDTH DESCENDING - Ensure highest quality is first
    variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

    return {
      url: playlistUrl,
      type: 'master',
      variants
    };
  }

  // It's a media playlist
  const segments: Segment[] = [];
  let totalDuration = 0;
  let segmentIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const durationMatch = line.match(/#EXTINF:([\d.]+)/);
      const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
      const segmentUrl = lines[i + 1]?.trim();
      
      if (segmentUrl && !segmentUrl.startsWith('#')) {
        segments.push({
          url: resolveUrl(playlistUrl, segmentUrl),
          duration,
          index: segmentIndex++
        });
        totalDuration += duration;
      }
    }
  }

  if (segments.length === 0) {
    throw new Error('Media playlist found but no segments detected.');
  }

  return {
    url: playlistUrl,
    type: 'media',
    segments,
    totalDuration
  };
};

/**
 * Helper to fetch a specific variant stream's segments
 */
export const fetchMediaPlaylist = async (variantUrl: string): Promise<{ segments: Segment[], totalDuration: number }> => {
  const info = await parseM3U8(variantUrl);
  if (info.type !== 'media' || !info.segments) {
    throw new Error('Selected quality does not point to a valid media playlist.');
  }
  return {
    segments: info.segments,
    totalDuration: info.totalDuration || 0
  };
};

export const downloadSegment = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Segment fetch failed: ${response.statusText}`);
  }
  return await response.arrayBuffer();
};
