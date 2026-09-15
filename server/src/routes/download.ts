import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import { asyncHandler } from '../http/async';
import { requireAuth } from '../auth/middleware';

const execFileAsync = promisify(execFile);

export const downloadRouter = Router();

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

interface DownloadResolution {
  url: string;
  filename: string;
  isAudio: boolean;
}

// Memory cache for resolved download URLs (expire after 3 hours)
const urlCache = new Map<string, { res: DownloadResolution; expires: number }>();

async function resolveViaYtDlp(videoId: string, quality: string): Promise<DownloadResolution | null> {
  const isAudio = quality === 'audio' || quality === 'mp3';
  let formatSelector = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best';
  if (isAudio) {
    formatSelector = 'bestaudio[ext=m4a]/bestaudio/best';
  } else if (quality === '1080' || quality === '1080p') {
    formatSelector = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best';
  } else if (quality === '480' || quality === '480p') {
    formatSelector = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]/best';
  } else if (quality === '360' || quality === '360p') {
    formatSelector = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]/best';
  }

  try {
    const { stdout } = await execFileAsync(
      'yt-dlp',
      ['-g', '-f', formatSelector, `https://www.youtube.com/watch?v=${videoId}`],
      { timeout: 15000 }
    );
    const urls = stdout.trim().split('\n').filter(Boolean);
    if (urls.length > 0) {
      const ext = isAudio ? 'mp3' : 'mp4';
      return {
        url: urls[0],
        filename: `${videoId}_${quality}.${ext}`,
        isAudio,
      };
    }
  } catch (err) {
    // yt-dlp not available or failed
  }
  return null;
}

async function resolveViaCobalt(videoId: string, quality: string): Promise<DownloadResolution | null> {
  const isAudio = quality === 'audio' || quality === 'mp3';
  const cleanQuality = quality.replace('p', '');
  const body = JSON.stringify({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    videoQuality: isAudio ? '720' : ['1080', '720', '480', '360'].includes(cleanQuality) ? cleanQuality : '720',
    downloadMode: isAudio ? 'audio' : 'auto',
    audioFormat: 'mp3',
  });

  return new Promise((resolve) => {
    const req = https.request(
      'https://api.cobalt.tools/',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'QuietFeed/1.0',
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.url) {
              const ext = isAudio ? 'mp3' : 'mp4';
              resolve({
                url: json.url,
                filename: json.filename || `${videoId}_${quality}.${ext}`,
                isAudio,
              });
              return;
            }
          } catch {}
          resolve(null);
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

async function getDownloadResolution(videoId: string, quality: string): Promise<DownloadResolution> {
  const cacheKey = `${videoId}:${quality}`;
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.res;
  }

  // 1. Try yt-dlp first
  let resolved = await resolveViaYtDlp(videoId, quality);

  // 2. Fallback to Cobalt API
  if (!resolved) {
    resolved = await resolveViaCobalt(videoId, quality);
  }

  if (!resolved) {
    // 3. Fallback: direct YouTube redirect for mobile/external player
    const isAudio = quality === 'audio' || quality === 'mp3';
    resolved = {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      filename: `${videoId}.${isAudio ? 'mp3' : 'mp4'}`,
      isAudio,
    };
  }

  urlCache.set(cacheKey, { res: resolved, expires: Date.now() + 3 * 3600 * 1000 });
  return resolved;
}

// Get direct download URL for the requested quality
downloadRouter.get(
  '/:id/download-url',
  requireAuth,
  asyncHandler(async (req, res) => {
    const videoId = req.params.id;
    if (!YOUTUBE_ID_RE.test(videoId)) {
      res.status(400).json({ error: 'Invalid video ID format' });
      return;
    }

    const quality = String(req.query.quality || '720');
    try {
      const resolution = await getDownloadResolution(videoId, quality);
      res.json(resolution);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to resolve download URL' });
    }
  }),
);

// Stream video download directly to client as an attachment (avoids CORS)
downloadRouter.get(
  '/:id/download-stream',
  requireAuth,
  asyncHandler(async (req, res) => {
    const videoId = req.params.id;
    if (!YOUTUBE_ID_RE.test(videoId)) {
      res.status(400).json({ error: 'Invalid video ID format' });
      return;
    }

    const quality = String(req.query.quality || '720');
    const resolution = await getDownloadResolution(videoId, quality);

    // If resolution.url is an external watch page, redirect
    if (resolution.url.includes('youtube.com/watch')) {
      res.redirect(resolution.url);
      return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resolution.filename)}"`);
    res.setHeader('Content-Type', resolution.isAudio ? 'audio/mpeg' : 'video/mp4');

    const client = resolution.url.startsWith('https') ? https : http;
    const proxyReq = client.get(resolution.url, (streamRes) => {
      if (streamRes.statusCode && streamRes.statusCode >= 400) {
        res.status(streamRes.statusCode).end();
        return;
      }
      if (streamRes.headers['content-length']) {
        res.setHeader('Content-Length', streamRes.headers['content-length']);
      }
      streamRes.pipe(res);
    });

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to stream download' });
      }
    });
  }),
);
