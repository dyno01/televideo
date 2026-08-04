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

const crypto = require('crypto');
const { getSetting, setSetting } = require('../db/database');

function hashPasscode(passcode) {
  return crypto.createHash('sha256').update(String(passcode).trim()).digest('hex');
}

function generatePasscodeToken(passcodeHash) {
  const salt = 'televideo_secure_salt_2026';
  return crypto.createHash('sha256').update(passcodeHash + salt).digest('hex');
}

function verifyPasscodeToken(token, passcodeHash) {
  if (!token || !passcodeHash) return false;
  const expectedToken = generatePasscodeToken(passcodeHash);
  return token === expectedToken || token === passcodeHash;
}

// ─── GET /api/telegram/passcode-status ──────────────────────────────────────
router.get('/passcode-status', (_req, res) => {
  const stored = getSetting('APP_PASSCODE', process.env.APP_PASSCODE || null);
  res.json({ passcodeSet: Boolean(stored) });
});

// ─── POST /api/telegram/verify-passcode ─────────────────────────────────────
router.post('/verify-passcode', (req, res) => {
  const { passcode } = req.body;
  const stored = getSetting('APP_PASSCODE', process.env.APP_PASSCODE || null);

  if (!stored) {
    return res.json({ success: true, token: 'unlocked' });
  }

  if (!passcode) {
    return res.status(400).json({ error: 'Passcode is required' });
  }

  const inputHash = hashPasscode(passcode);
  if (inputHash === stored) {
    const token = generatePasscodeToken(stored);
    return res.json({ success: true, token });
  }

  return res.status(401).json({ error: 'Incorrect passcode. Please try again.' });
});

// ─── POST /api/telegram/set-passcode ────────────────────────────────────────
router.post('/set-passcode', (req, res) => {
  const { passcode, currentPasscode } = req.body;
  const stored = getSetting('APP_PASSCODE', process.env.APP_PASSCODE || null);

  if (stored) {
    if (!currentPasscode || hashPasscode(currentPasscode) !== stored) {
      return res.status(401).json({ error: 'Current passcode is incorrect.' });
    }
  }

  if (!passcode || String(passcode).trim().length < 4) {
    return res.status(400).json({ error: 'Passcode must be at least 4 characters long.' });
  }

  const newHash = hashPasscode(passcode);
  setSetting('APP_PASSCODE', newHash);
  const token = generatePasscodeToken(newHash);

  res.json({ success: true, message: 'App Passcode set successfully.', token });
});

// ─── POST /api/telegram/remove-passcode ─────────────────────────────────────
router.post('/remove-passcode', (req, res) => {
  const { currentPasscode } = req.body;
  const stored = getSetting('APP_PASSCODE', process.env.APP_PASSCODE || null);

  if (stored) {
    if (!currentPasscode || hashPasscode(currentPasscode) !== stored) {
      return res.status(401).json({ error: 'Current passcode is incorrect.' });
    }
  }

  setSetting('APP_PASSCODE', null);
  res.json({ success: true, message: 'App Passcode protection disabled.' });
});

module.exports = router;
module.exports.verifyPasscodeToken = verifyPasscodeToken;
module.exports.generatePasscodeToken = generatePasscodeToken;
