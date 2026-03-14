/**
 * routes/filesRoutes.js
 * 
 * GET /api/channel/:username/files — List all PDFs + documents for a channel
 */

const express = require('express');
const { getOne, getAll } = require('../db/database');

const router = express.Router();

// ─── GET /api/channel/:username/files ─────────────────────────────────────
router.get('/channel/:username/files', (req, res) => {
  const username = req.params.username.replace(/^@/, '');

  const channel = getOne('SELECT id FROM channels WHERE username = ?', [username]);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found. Scan it first.' });
  }

  const files = getAll(
    `SELECT * FROM files WHERE channel_id = ? ORDER BY
       CASE
         WHEN mime_type = 'application/pdf' THEN 0
         ELSE 1
       END,
       created_at ASC`,
    [channel.id]
  );

  res.json(files);
});

module.exports = router;
