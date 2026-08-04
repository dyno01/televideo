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
const authRoutes     = require('./routes/authRoutes');
const tagsRoutes     = require('./routes/tagsRoutes');

const app  = express();
const PORT = process.env.PORT || 4000;


// --- Middleware ---
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',') 
  : [
      'http://localhost:3000', 
      'http://127.0.0.1:3000', 
      'http://localhost:3001', 
      'http://127.0.0.1:3001',
      'https://televideo.vercel.app'
    ];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { getSetting } = require('./db/database');
const { verifyPasscodeToken } = require('./routes/authRoutes');

// ─── App Passcode Security Middleware ──────────────────────────────────────
app.use((req, res, next) => {
  const storedHash = getSetting('APP_PASSCODE', process.env.APP_PASSCODE || null);
  if (!storedHash) {
    return next(); // Passcode protection disabled
  }

  const path = req.path;
  if (
    path === '/api/health' ||
    path === '/api/telegram/passcode-status' ||
    path === '/api/telegram/verify-passcode' ||
    path === '/api/telegram/status'
  ) {
    return next();
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/, '') || req.headers['x-app-passcode'] || req.query.token || req.query.passcode;

  if (token && verifyPasscodeToken(token, storedHash)) {
    return next();
  }

  return res.status(401).json({ error: 'Passcode authentication required', passcodeRequired: true });
});

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

// Telegram Auth & Settings
app.use('/api/telegram', authRoutes);         // GET /status, POST /send-code, /login, /logout

// Video Tags
app.use('/api/tags',     tagsRoutes);         // GET /api/tags/:videoId, POST, DELETE

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
