const express = require('express');
const telegramClient = require('../telegramClient');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getSetting, db } = require('../db/database');

const router = express.Router();
const JWT_SECRET = getSetting('JWT_SECRET', 'super_secret_televideo_key_2026');

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password).trim()).digest('hex');
}

// ─── GET /api/telegram/status ───────────────────────────────────────────────
router.get('/status', async (_req, res) => {
  try {
    const status = await telegramClient.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/telegram/send-code ───────────────────────────────────────────
router.post('/send-code', async (req, res) => {
  const { apiId, apiHash, phoneNumber } = req.body;
  if (!apiId || !apiHash || !phoneNumber) return res.status(400).json({ error: 'Missing fields' });
  try {
    const result = await telegramClient.sendPhoneCode(apiId, apiHash, phoneNumber);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── POST /api/telegram/login ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { phoneNumber, phoneCode, phoneCodeHash, password } = req.body;
  if (!phoneNumber || !phoneCode || !phoneCodeHash) return res.status(400).json({ error: 'Missing fields' });
  try {
    const result = await telegramClient.signInUser({ phoneNumber, phoneCode, phoneCodeHash, password });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/save-session', async (req, res) => {
  const { apiId, apiHash, sessionString } = req.body;
  try {
    const result = await telegramClient.saveSessionString(apiId, apiHash, sessionString);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const result = await telegramClient.logoutUser();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── MULTI-USER AUTH ROUTES ────────────────────────────────────────────────
router.get('/users/count', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  res.json({ count });
});

router.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 4) return res.status(400).json({ error: 'Password too short' });

  try {
    const hash = hashPassword(password);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: result.lastInsertRowid, username } });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/user-login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user: { id: user.id, username: user.username } });
});

// ─── GET /api/telegram/me ────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', passcodeRequired: true });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user: decoded });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token', passcodeRequired: true });
  }
});

// ─── POST /api/telegram/change-password ────────────────────────────────────
router.post('/change-password', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'New password too short' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
  if (!user || user.password_hash !== hashPassword(currentPassword)) {
    return res.status(401).json({ error: 'Incorrect current password' });
  }

  const newHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, decoded.id);
  
  res.json({ success: true });
});

// Legacy passcode endpoints for backwards compatibility during transition
router.get('/passcode-status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  // Always return true to enforce multi-user auth on the frontend
  res.json({ passcodeSet: true, userCount: count });
});

module.exports = router;
