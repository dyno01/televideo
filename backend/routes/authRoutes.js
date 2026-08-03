/**
 * routes/authRoutes.js
 * 
 * Express routes for managing Telegram credentials and authenticating sessions directly from the Web UI.
 */

const express = require('express');
const telegramClient = require('../telegramClient');

const router = express.Router();

// GET /api/telegram/status — check current Telegram connection & session status
router.get('/status', async (_req, res) => {
  try {
    const status = await telegramClient.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/telegram/send-code — send verification code to user's phone
router.post('/send-code', async (req, res) => {
  const { apiId, apiHash, phoneNumber } = req.body;

  if (!apiId || !apiHash || !phoneNumber) {
    return res.status(400).json({ error: 'apiId, apiHash, and phoneNumber are required' });
  }

  try {
    const result = await telegramClient.sendPhoneCode(apiId, apiHash, phoneNumber);
    res.json(result);
  } catch (err) {
    console.error('[Auth API Error] send-code:', err.message);
    res.status(400).json({ error: err.message || 'Failed to send verification code. Check phone number and API credentials.' });
  }
});

// POST /api/telegram/login — complete login with phone code (+ optional 2FA password)
router.post('/login', async (req, res) => {
  const { phoneNumber, phoneCode, phoneCodeHash, password } = req.body;

  if (!phoneNumber || !phoneCode || !phoneCodeHash) {
    return res.status(400).json({ error: 'phoneNumber, phoneCode, and phoneCodeHash are required' });
  }

  try {
    const result = await telegramClient.signInUser({
      phoneNumber,
      phoneCode,
      phoneCodeHash,
      password,
    });
    res.json(result);
  } catch (err) {
    console.error('[Auth API Error] login:', err.message);
    res.status(400).json({ error: err.message || 'Login failed. Please verify your code or 2FA password.' });
  }
});

// POST /api/telegram/save-session — save pre-generated SESSION_STRING directly
router.post('/save-session', async (req, res) => {
  const { apiId, apiHash, sessionString } = req.body;

  if (!apiId || !apiHash || !sessionString) {
    return res.status(400).json({ error: 'apiId, apiHash, and sessionString are required' });
  }

  try {
    const result = await telegramClient.saveSessionString(apiId, apiHash, sessionString);
    res.json(result);
  } catch (err) {
    console.error('[Auth API Error] save-session:', err.message);
    res.status(400).json({ error: err.message || 'Failed to authorize with provided SESSION_STRING.' });
  }
});

// POST /api/telegram/logout — logout current session
router.post('/logout', async (_req, res) => {
  try {
    const result = await telegramClient.logout();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
