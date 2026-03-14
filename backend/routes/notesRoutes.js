/**
 * routes/notesRoutes.js
 * 
 * GET    /api/notes/:videoId — Get all notes for a video
 * POST   /api/notes          — Create a new note
 * DELETE /api/notes/:id      — Delete a note
 */

const express = require('express');
const { getAll, getOne, run } = require('../db/database');

const router = express.Router();

// ─── GET /api/notes/:videoId ───────────────────────────────────────────────
router.get('/:videoId', (req, res) => {
  const videoId = parseInt(req.params.videoId, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const notes = getAll(
    'SELECT * FROM notes WHERE video_id = ? ORDER BY timestamp_sec ASC',
    [videoId]
  );
  res.json(notes);
});

// ─── POST /api/notes ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { videoId, timestampSec, noteText } = req.body;

  if (!videoId || timestampSec === undefined || !noteText || !noteText.trim()) {
    return res.status(400).json({ error: 'videoId, timestampSec, and noteText are required' });
  }

  const result = run(
    `INSERT INTO notes (video_id, timestamp_sec, note_text, created_at)
     VALUES (?, ?, ?, ?)`,
    [parseInt(videoId, 10), parseFloat(timestampSec), noteText.trim(), new Date().toISOString()]
  );

  const note = getOne('SELECT * FROM notes WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(note);
});

// ─── DELETE /api/notes/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid note ID' });

  const existing = getOne('SELECT id FROM notes WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Note not found' });

  run('DELETE FROM notes WHERE id = ?', [id]);
  res.json({ success: true });
});

module.exports = router;
