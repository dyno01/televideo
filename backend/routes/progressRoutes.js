/**
 * routes/progressRoutes.js
 * 
 * GET  /api/progress/:videoId — Get progress for a video
 * POST /api/progress          — Save/update progress for a video
 */

const express = require('express');
const { getOne, run } = require('../db/database');

const router = express.Router();

// ─── GET /api/progress/:videoId ────────────────────────────────────────────
router.get('/:videoId', (req, res) => {
  const videoId = parseInt(req.params.videoId, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const progress = getOne('SELECT * FROM progress WHERE video_id = ?', [videoId]);

  if (!progress) {
    // Return a default zero-progress object if none saved yet
    return res.json({
      video_id: videoId,
      watched_percentage: 0,
      last_timestamp: 0,
      completed: 0,
    });
  }

  res.json(progress);
});

// ─── POST /api/progress ────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { videoId, currentTime, duration } = req.body;

  if (!videoId || currentTime === undefined || !duration) {
    return res.status(400).json({ error: 'videoId, currentTime, and duration are required' });
  }

  const videoIdInt = parseInt(videoId, 10);
  const current    = parseFloat(currentTime);
  const dur        = parseFloat(duration);

  if (isNaN(videoIdInt) || isNaN(current) || isNaN(dur) || dur <= 0) {
    return res.status(400).json({ error: 'Invalid numeric values' });
  }

  const percentage = Math.min(100, (current / dur) * 100);
  const completed  = percentage >= 90 ? 1 : 0;

  run(
    `INSERT INTO progress (video_id, watched_percentage, last_timestamp, completed, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET
       watched_percentage = excluded.watched_percentage,
       last_timestamp     = excluded.last_timestamp,
       completed          = excluded.completed,
       updated_at         = excluded.updated_at`,
    [videoIdInt, percentage, current, completed, new Date().toISOString()]
  );

  res.json({ success: true, watched_percentage: percentage, completed });
});

module.exports = router;
