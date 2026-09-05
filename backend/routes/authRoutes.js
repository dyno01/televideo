const express = require('express');
const telegramClient = require('../telegramClient');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getSetting, setSetting, db } = require('../db/database');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const JWT_SECRET = getSetting('JWT_SECRET', 'super_secret_televideo_key_2026');

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password).trim()).digest('hex');
}

// ─── MULTI-USER AUTH ROUTES (Public) ───────────────────────────────────────
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

router.get('/passcode-status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  res.json({ passcodeSet: true, userCount: count });
});

// ─── PROTECTED TELEGRAM ROUTES ──────────────────────────────────────────────
router.use(authMiddleware);

router.get('/status', async (req, res) => {
  try {
    const status = await telegramClient.getStatus(req.user.id);
    const config = telegramClient.getConfig(req.user.id);
    res.json({
      ...status,
      apiId: config.apiId || null,
      apiHash: config.apiHash ? '••••••••' + config.apiHash.slice(-4) : null,
      hasServerConfig: Boolean(config.apiId && config.apiHash),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config', (req, res) => {
  const { apiId, apiHash } = req.body;
  if (!apiId || !apiHash) {
    return res.status(400).json({ error: 'Both API ID and API Hash are required' });
  }
  const parsedId = parseInt(apiId, 10);
  if (!parsedId) return res.status(400).json({ error: 'API ID must be a valid number' });

  setSetting('TELEGRAM_API_ID', parsedId);
  setSetting('TELEGRAM_API_HASH', String(apiHash).trim());

  res.json({ success: true, message: 'Telegram API credentials saved to database' });
});

router.post('/send-code', async (req, res) => {
  let { apiId, apiHash, phoneNumber } = req.body;

  if (!apiId || !apiHash) {
    const config = telegramClient.getConfig(req.user.id);
    apiId = config.apiId;
    apiHash = config.apiHash;
  }

  if (!apiId || !apiHash) {
    return res.status(400).json({ 
      error: 'TELEGRAM_API_ID and TELEGRAM_API_HASH are not configured. Please set them in Render Environment.' 
    });
  }

  if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });

  try {
    const result = await telegramClient.sendPhoneCode(req.user.id, apiId, apiHash, phoneNumber);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { phoneNumber, phoneCode, phoneCodeHash, password } = req.body;
  if (!phoneNumber || !phoneCode || !phoneCodeHash) return res.status(400).json({ error: 'Missing fields' });
  try {
    const result = await telegramClient.signInUser(req.user.id, { phoneNumber, phoneCode, phoneCodeHash, password });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/save-session', async (req, res) => {
  let { apiId, apiHash, sessionString } = req.body;
  if (!apiId || !apiHash) {
    const config = telegramClient.getConfig(req.user.id);
    apiId = config.apiId;
    apiHash = config.apiHash;
  }
  if (!sessionString) return res.status(400).json({ error: 'Session string is required' });
  try {
    const result = await telegramClient.saveSessionString(req.user.id, apiId, apiHash, sessionString);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const result = await telegramClient.logout(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/me', (req, res) => {
  res.json({ success: true, user: req.user });
});

router.post('/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'New password too short' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || user.password_hash !== hashPassword(currentPassword)) {
    return res.status(401).json({ error: 'Incorrect current password' });
  }

  const newHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  
  res.json({ success: true });
});

module.exports = router;
