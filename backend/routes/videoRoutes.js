/**
 * routes/videoRoutes.js
 * 
 * GET /api/channel/:username/videos — List all videos for a channel
 * GET /api/video/:id                — Get a single video's metadata
 */

const express = require('express');
const { getAll, getOne } = require('../db/database');

const router = express.Router();

// ─── GET /api/channel/:username/videos ────────────────────────────────────
router.get('/channel/:username/videos', (req, res) => {
  const username = req.params.username.replace(/^@/, '');

  const channel = getOne('SELECT id FROM channels WHERE username = ?', [username]);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found. Scan it first.' });
  }

  const videos = getAll(
    `SELECT
       v.*,
       COALESCE(p.watched_percentage, 0) AS watched_percentage,
       COALESCE(p.last_timestamp, 0)     AS last_timestamp,
       COALESCE(p.completed, 0)          AS completed
     FROM videos v
     LEFT JOIN progress p ON p.video_id = v.id
     WHERE v.channel_id = ?
     ORDER BY v.created_at ASC`,
    [channel.id]
  );

  res.json(videos);
});

// ─── GET /api/video/:id ────────────────────────────────────────────────────
router.get('/video/:id', (req, res) => {
  const videoId = parseInt(req.params.id, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const video = getOne(
    `SELECT
       v.*,
       c.username AS channel_username,
       c.title    AS channel_title,
       COALESCE(p.watched_percentage, 0) AS watched_percentage,
       COALESCE(p.last_timestamp, 0)     AS last_timestamp,
       COALESCE(p.completed, 0)          AS completed
     FROM videos v
     JOIN channels c ON c.id = v.channel_id
     LEFT JOIN progress p ON p.video_id = v.id
     WHERE v.id = ?`,
    [videoId]
  );

  if (!video) return res.status(404).json({ error: 'Video not found' });

  // Return video metadata — file_reference and access_hash are for streaming proxy use
  res.json(video);
});

// ─── GET /api/video/:id/files ─────────────────────────────────────────────
router.get('/video/:id/files', (req, res) => {
  const videoId = parseInt(req.params.id, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const files = getAll(
    `SELECT f.*, c.username AS channel_username
     FROM files f
     JOIN channels c ON c.id = f.channel_id
     WHERE f.parent_video_id = ?
     ORDER BY f.message_id ASC`,
    [videoId]
  );

  res.json(files);
});

module.exports = router;
