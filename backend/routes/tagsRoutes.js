/**
 * tagsRoutes.js — Video tag management
 */
const express = require('express');
const router  = express.Router();
const { getAll, getOne, run } = require('../db/database');

// GET /api/tags/:videoId — Get all tags for a video
router.get('/:videoId', (req, res) => {
  const videoId = parseInt(req.params.videoId, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const tags = getAll('SELECT * FROM video_tags WHERE video_id = ? ORDER BY tag ASC', [videoId]);
  res.json(tags);
});

// POST /api/tags — Add a tag to a video
router.post('/', (req, res) => {
  const { videoId, tag } = req.body;
  if (!videoId || !tag || !tag.trim()) {
    return res.status(400).json({ error: 'videoId and tag are required' });
  }

  const cleanTag = tag.trim().toLowerCase();
  
  try {
    run('INSERT OR IGNORE INTO video_tags (video_id, tag) VALUES (?, ?)', [videoId, cleanTag]);
    const inserted = getOne('SELECT * FROM video_tags WHERE video_id = ? AND tag = ?', [videoId, cleanTag]);
    res.status(201).json(inserted);
  } catch (err) {
    console.error('[Tags Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/:id — Remove a tag
router.delete('/:id', (req, res) => {
  const tagId = parseInt(req.params.id, 10);
  if (isNaN(tagId)) return res.status(400).json({ error: 'Invalid tag ID' });

  const tag = getOne('SELECT * FROM video_tags WHERE id = ?', [tagId]);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  run('DELETE FROM video_tags WHERE id = ?', [tagId]);
  res.json({ success: true });
});

module.exports = router;
