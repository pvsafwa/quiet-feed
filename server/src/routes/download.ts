import { Router } from 'express';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
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

// Memory cache for resolved download URLs (expire after 2 hours)
const urlCache = new Map<string, { res: DownloadResolution; expires: number }>();

function getYtDlpBin(): string {
  const candidates = [
    process.env.YT_DLP_PATH,
    path.resolve(__dirname, '../../bin/yt-dlp'),
    path.resolve(__dirname, '../bin/yt-dlp'),
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    'yt-dlp',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (p === 'yt-dlp' || fs.existsSync(p)) {
      return p;
    }
  }
  return 'yt-dlp';
}

async function resolveViaYtDlp(videoId: string, quality: string): Promise<DownloadResolution | null> {
  const isAudio = quality === 'audio' || quality === 'mp3';
  const cleanQuality = quality.replace('p', '');

  let formatSelector = 'bestaudio[ext=m4a]/bestaudio/140/251/best';
  if (!isAudio) {
    if (cleanQuality === '1080') {
      formatSelector = 'b[height<=1080][ext=mp4]/b[height<=1080]/bestvideo[height<=1080]+bestaudio/best';
    } else if (cleanQuality === '480') {
      formatSelector = 'b[height<=480][ext=mp4]/b[height<=480]/bestvideo[height<=480]+bestaudio/best';
    } else if (cleanQuality === '360') {
      formatSelector = 'b[height<=360][ext=mp4]/b[height<=360]/bestvideo[height<=360]+bestaudio/best';
    } else {
      formatSelector = 'b[height<=720][ext=mp4]/b[height<=720]/bestvideo[height<=720]+bestaudio/best';
    }
  }

  const bin = getYtDlpBin();
  try {
    const { stdout } = await execFileAsync(
      bin,
      [
        '--js-runtimes',
        'node:node',
        '-g',
        '-f',
        formatSelector,
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 20000 },
    );
    const urls = stdout.trim().split('\n').filter(Boolean);
    if (urls.length > 0 && urls[0].startsWith('http')) {
      const ext = isAudio ? 'mp3' : 'mp4';
      return {
        url: urls[0],
        filename: `${videoId}_${quality}.${ext}`,
        isAudio,
      };
    }
  } catch (err) {
    // yt-dlp execution error or timeout
  }
  return null;
}

function spawnYtDlpStream(videoId: string, quality: string, isAudio: boolean, res: any) {
  const bin = getYtDlpBin();
  const cleanQuality = quality.replace('p', '');
  const formatSelector = isAudio
    ? 'bestaudio[ext=m4a]/bestaudio/140/251/best'
    : `b[height<=${cleanQuality}][ext=mp4]/b[height<=${cleanQuality}]/b/best`;

  const proc = spawn(
    bin,
    [
      '--js-runtimes',
      'node:node',
      '-f',
      formatSelector,
      '-o',
      '-',
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    {
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );

  proc.stdout.pipe(res);

  proc.on('error', () => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to stream video download' });
    }
  });

  res.on('close', () => {
    proc.kill('SIGKILL');
  });
}

async function getDownloadResolution(videoId: string, quality: string): Promise<DownloadResolution | null> {
  const cacheKey = `${videoId}:${quality}`;
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.res;
  }

  const resolved = await resolveViaYtDlp(videoId, quality);
  if (resolved) {
    urlCache.set(cacheKey, { res: resolved, expires: Date.now() + 2 * 3600 * 1000 });
  }
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
      if (!resolution) {
        // Return stream URL fallback so client triggers stream endpoint directly
        const isAudio = quality === 'audio' || quality === 'mp3';
        res.json({
          url: `/api/videos/${encodeURIComponent(videoId)}/download-stream?quality=${encodeURIComponent(quality)}`,
          filename: `${videoId}_${quality}.${isAudio ? 'mp3' : 'mp4'}`,
          isAudio,
        });
        return;
      }
      res.json(resolution);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to resolve download URL' });
    }
  }),
);

// Stream video download directly to client as an attachment
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
    const isAudio = quality === 'audio' || quality === 'mp3';
    const ext = isAudio ? 'mp3' : 'mp4';
    const filename = `${videoId}_${quality}.${ext}`;

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');

    const resolution = await getDownloadResolution(videoId, quality);
    if (
      resolution &&
      resolution.url &&
      resolution.url.startsWith('https://') &&
      !resolution.url.includes('youtube.com/watch')
    ) {
      const client = resolution.url.startsWith('https') ? https : http;
      const proxyReq = client.get(resolution.url, (streamRes) => {
        if (streamRes.statusCode && streamRes.statusCode >= 400) {
          spawnYtDlpStream(videoId, quality, isAudio, res);
          return;
        }
        if (streamRes.headers['content-length']) {
          res.setHeader('Content-Length', streamRes.headers['content-length']);
        }
        streamRes.pipe(res);
      });

      proxyReq.on('error', () => {
        spawnYtDlpStream(videoId, quality, isAudio, res);
      });
    } else {
      spawnYtDlpStream(videoId, quality, isAudio, res);
    }
  }),
);
