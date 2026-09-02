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

const authMiddleware = require('./middleware/authMiddleware');

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
app.use(express.text({ type: ['text/plain', 'application/json'] }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ────────────────────────────────────────────────────────────────
// Files and stream and auth can be public or handle their own auth
app.use('/api', filesRoutes);              // /api/channel/:u/files
app.use('/api/stream', streamRoutes);       
app.use('/api/telegram', authRoutes);         

// Protect these with authMiddleware
app.use('/api/channel', authMiddleware, channelRoutes);
app.use('/api/channels', authMiddleware, channelRoutes); // some use /api/channels
app.use('/api', authMiddleware, videoRoutes); // /api/video, /api/channel/:u/videos
app.use('/api/progress', authMiddleware, progressRoutes);
app.use('/api/notes', authMiddleware, notesRoutes);
app.use('/api/batches', authMiddleware, batchRoutes);
app.use('/api/tags', authMiddleware, tagsRoutes);

// ─── 404 catch-all ─────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ──────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Process Crash Guards (Prevent Render Restarts) ────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

// ─── Start server ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[TeleVideo] Backend server running on http://localhost:${PORT}`);
});
