import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { asyncHandler } from '../http/async';
import { requireAuth } from '../auth/middleware';

const execFileAsync = promisify(execFile);

export const downloadRouter = Router();

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function getYtDlpBin(): string {
  const candidates = [
    process.env.YT_DLP_PATH,
    path.resolve(__dirname, '../../bin/yt-dlp'),
    path.resolve(__dirname, '../bin/yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp',
    'yt-dlp',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (p === 'yt-dlp' || fs.existsSync(p)) {
      return p;
    }
  }
  return 'yt-dlp';
}

function findCookiesFile(): string | null {
  const candidates = [
    process.env.YOUTUBE_COOKIES_PATH,
    '/app/cookies/cookies.txt',
    '/app/cookies.txt',
    '/app/data/cookies.txt',
    path.resolve(process.cwd(), 'cookies/cookies.txt'),
    path.resolve(process.cwd(), 'cookies.txt'),
    path.resolve(__dirname, '../../cookies/cookies.txt'),
    path.resolve(__dirname, '../../cookies.txt'),
    path.resolve(__dirname, '../../../cookies.txt'),
    path.resolve(os.homedir(), '.config/yt-dlp/cookies.txt'),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile() && fs.statSync(c).size > 0) {
        return c;
      }
    } catch {}
  }
  return null;
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
    const isAudio = quality === 'audio' || quality === 'mp3';
    const ext = isAudio ? 'mp3' : 'mp4';

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const streamPath = `/api/videos/${encodeURIComponent(videoId)}/download-stream?quality=${encodeURIComponent(quality)}`;
    const fullUrl = host ? `${proto}://${host}${streamPath}` : streamPath;

    res.json({
      url: fullUrl,
      filename: `${videoId}_${quality}.${ext}`,
      isAudio,
    });
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
    const cleanQuality = quality.replace('p', '');

    const bin = getYtDlpBin();
    const tempDir = os.tmpdir();
    const filePrefix = `qf_${videoId}_${Date.now()}`;
    const targetFile = path.join(tempDir, `${filePrefix}.${ext}`);
    const outputTemplate = path.join(tempDir, `${filePrefix}.%(ext)s`);

    const cookieFile = findCookiesFile();

    const buildArgs = (clientStrategy: 'default' | 'tv') => {
      const args = [
        '--js-runtimes',
        'node',
        '--no-playlist',
        '--no-warnings',
        '--retries',
        '3',
      ];

      if (cookieFile) {
        args.push('--cookies', cookieFile);
      }

      if (clientStrategy === 'default') {
        args.push('--extractor-args', 'youtube:player_client=default,tv,web_creator');
      } else if (clientStrategy === 'tv') {
        args.push('--extractor-args', 'youtube:player_client=tv');
      }

      if (isAudio) {
        args.push(
          '-f',
          '140/bestaudio[ext=m4a]/bestaudio/best',
          '-x',
          '--audio-format',
          'mp3',
          '--audio-quality',
          '0',
        );
      } else {
        let formatSelector = '22/b[height<=720][ext=mp4]/b[height<=720]/bestvideo[height<=720]+bestaudio/best';
        if (cleanQuality === '1080') {
          formatSelector = 'bestvideo[height<=1080][ext=mp4]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';
        } else if (cleanQuality === '480') {
          formatSelector = 'b[height<=480][ext=mp4]/b[height<=480]/bestvideo[height<=480]+bestaudio/best';
        } else if (cleanQuality === '360') {
          formatSelector = '18/b[height<=360][ext=mp4]/b[height<=360]/bestvideo[height<=360]+bestaudio/best';
        }
        args.push('-f', formatSelector, '--merge-output-format', 'mp4');
      }

      args.push('-o', outputTemplate, `https://www.youtube.com/watch?v=${videoId}`);
      return args;
    };

    const cleanup = () => {
      try {
        const files = fs.readdirSync(tempDir).filter((f) => f.startsWith(filePrefix));
        for (const f of files) {
          try {
            fs.unlinkSync(path.join(tempDir, f));
          } catch {}
        }
      } catch {}
    };

    const findResultFile = (): string | null => {
      if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 0) {
        return targetFile;
      }
      try {
        const files = fs.readdirSync(tempDir).filter((f) => f.startsWith(filePrefix));
        for (const f of files) {
          const fullPath = path.join(tempDir, f);
          if (fs.statSync(fullPath).size > 0) {
            return fullPath;
          }
        }
      } catch {}
      return null;
    };

    let executionError: any = null;

    // First attempt: standard client combination
    try {
      await execFileAsync(bin, buildArgs('default'), { timeout: 180000 });
    } catch (err: any) {
      executionError = err;
      console.warn(`[Download] Primary strategy failed for ${videoId}:`, err.message);

      // Fallback attempt: TV client
      try {
        await execFileAsync(bin, buildArgs('tv'), { timeout: 180000 });
        executionError = null;
      } catch (fallbackErr: any) {
        executionError = fallbackErr;
        console.warn(`[Download] Fallback strategy failed for ${videoId}:`, fallbackErr.message);
      }
    }

    const mediaFile = findResultFile();
    if (mediaFile) {
      res.download(mediaFile, filename, () => {
        cleanup();
      });
      return;
    }

    cleanup();

    const errMsg = executionError?.message || '';
    if (errMsg.includes('Sign in to confirm you’re not a bot') || errMsg.includes('confirm you') || errMsg.includes('bot')) {
      res.status(502).json({
        error: 'YouTube requires bot verification for cloud servers. Please place a YouTube cookies.txt file in the cookies/ folder on your server.',
      });
      return;
    }

    res.status(502).json({
      error: errMsg ? `Download failed: ${errMsg.split('\n')[0]}` : 'Failed to generate media file',
    });
  }),
);
