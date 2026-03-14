/**
 * server.js — Express application entry point
 * 
 * Loads environment variables, mounts all route modules,
 * and starts the HTTP server.
 */

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

// ─── Import routes ─────────────────────────────────────────────────────────
const channelRoutes  = require('./routes/channelRoutes');
const videoRoutes    = require('./routes/videoRoutes');
const progressRoutes = require('./routes/progressRoutes');
const notesRoutes    = require('./routes/notesRoutes');
const filesRoutes    = require('./routes/filesRoutes');
const streamRoutes   = require('./routes/streamRoutes');
const batchRoutes    = require('./routes/batchRoutes');

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://127.0.0.1:3000', 
    'http://localhost:3001', 
    'http://127.0.0.1:3001',
    'https://televideo.vercel.app'
  ],
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ────────────────────────────────────────────────────────────────
// Channel scanning and info
app.use('/api/channel',  channelRoutes);
app.use('/api/channels', channelRoutes);    // GET /api/channels → list all

// Videos
app.use('/api', videoRoutes);              // GET /api/channel/:u/videos, GET /api/video/:id

// Files
app.use('/api', filesRoutes);              // GET /api/channel/:u/files

// Progress tracking
app.use('/api/progress', progressRoutes);  // GET /api/progress/:id, POST /api/progress

// Notes
app.use('/api/notes', notesRoutes);        // GET /api/notes/:videoId, POST, DELETE

// Video streaming proxy
app.use('/api/stream',   streamRoutes);       // GET /api/stream/:videoId  (HTTP Range supported)

// Batches
app.use('/api/batches',  batchRoutes);        // POST/GET/DELETE /api/batches

// ─── 404 catch-all ─────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ──────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Start server ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Telegram Learning Dashboard API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
