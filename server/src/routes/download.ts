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

    res.json({
      url: `/api/videos/${encodeURIComponent(videoId)}/download-stream?quality=${encodeURIComponent(quality)}`,
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
    const tempFile = path.join(tempDir, `qf_${videoId}_${Date.now()}.${ext}`);

    let formatSelector = '140/bestaudio[ext=m4a]/bestaudio/best';
    if (!isAudio) {
      if (cleanQuality === '1080') {
        formatSelector = 'bestvideo[height<=1080][ext=mp4]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';
      } else if (cleanQuality === '480') {
        formatSelector = 'b[height<=480][ext=mp4]/b[height<=480]/bestvideo[height<=480]+bestaudio/best';
      } else if (cleanQuality === '360') {
        formatSelector = '18/b[height<=360][ext=mp4]/b[height<=360]/bestvideo[height<=360]+bestaudio/best';
      } else {
        formatSelector = '22/b[height<=720][ext=mp4]/b[height<=720]/bestvideo[height<=720]+bestaudio/best';
      }
    }

    try {
      await execFileAsync(
        bin,
        [
          '--extractor-args',
          'youtube:player_client=ios,android',
          '-f',
          formatSelector,
          '-o',
          tempFile,
          `https://www.youtube.com/watch?v=${videoId}`,
        ],
        { timeout: 120000 },
      );

      if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
        res.download(tempFile, filename, () => {
          try {
            fs.unlinkSync(tempFile);
          } catch {}
        });
      } else {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {}
        }
        res.status(502).json({ error: 'Failed to generate media file' });
      }
    } catch (err: any) {
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch {}
      }
      if (!res.headersSent) {
        res.status(502).json({ error: err.message || 'Download processing failed' });
      }
    }
  }),
);
