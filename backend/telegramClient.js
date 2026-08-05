/**
 * telegramClient.js
 * 
 * Manages the singleton GramJS TelegramClient.
 * Dynamic settings are retrieved from SQLite `settings` table with .env fallbacks.
 * Interactive authentication can be performed via web API routes without terminal scripts.
 */

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { computeCheck } = require('telegram/Password');
const { getSetting, setSetting } = require('./db/database');

let clientInstance = null;
let currentSessionString = '';
let currentApiId = 0;
let currentApiHash = '';
let isConnected = false;
let connectionPromise = null;

function getConfig() {
  const apiIdStr = getSetting('TELEGRAM_API_ID', process.env.TELEGRAM_API_ID || '');
  const apiHash = getSetting('TELEGRAM_API_HASH', process.env.TELEGRAM_API_HASH || '');
  const sessionString = getSetting('SESSION_STRING', process.env.SESSION_STRING || '');

  const apiId = parseInt(apiIdStr, 10) || 0;
  return { apiId, apiHash, sessionString };
}

function initOrGetClientInstance() {
  const { apiId, apiHash, sessionString } = getConfig();

  if (!apiId || !apiHash) {
    return null;
  }

  // Re-create client if credentials changed or not created yet
  if (
    !clientInstance ||
    currentApiId !== apiId ||
    currentApiHash !== apiHash ||
    currentSessionString !== sessionString
  ) {
    if (clientInstance) {
      try { clientInstance.disconnect(); } catch (_) {}
    }

    currentApiId = apiId;
    currentApiHash = apiHash;
    currentSessionString = sessionString;
    isConnected = false;
    connectionPromise = null;

    const session = new StringSession(sessionString);
    clientInstance = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      useWSS: false,
      deviceModel: `TelevideoServer-${Math.random().toString(36).substring(2, 7)}`,
      systemVersion: `Render-${process.env.RENDER_INSTANCE_ID || 'Local'}`,
      appVersion: '1.0.0',
    });
  }

  return clientInstance;
}

async function attemptConnection(retries = 3, delayMs = 3000) {
  const client = initOrGetClientInstance();
  if (!client) {
    throw new Error('TELEGRAM_CONFIG_MISSING: TELEGRAM_API_ID and TELEGRAM_API_HASH must be configured in Telegram Settings.');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Telegram] Connecting to Telegram... (Attempt ${attempt}/${retries})`);
      await client.connect();

      const authorized = await client.checkAuthorization();
      if (!authorized) {
        console.warn('[Telegram] ⚠️ Session string is invalid or unauthenticated.');
        isConnected = false;
        throw new Error('TELEGRAM_AUTH_REQUIRED: Telegram session is not authorized. Please log in via Telegram Settings.');
      }

      isConnected = true;
      const savedSession = client.session.save();
      if (savedSession && savedSession !== currentSessionString) {
        currentSessionString = savedSession;
        setSetting('SESSION_STRING', savedSession);
        console.log('[Telegram] ✅ Session refreshed and saved to database settings.');
      } else {
        console.log('[Telegram] ✅ Connected successfully.');
      }

      return client;

    } catch (err) {
      if (err.message && err.message.startsWith('TELEGRAM_')) {
        throw err;
      }

      console.error(`[Telegram] Connection error on attempt ${attempt}:`, err.message);

      if (err.message && err.message.includes('AUTH_KEY_DUPLICATED')) {
        console.warn(`[Telegram] ⚠️ Session conflict detected. Retrying in ${delayMs / 1000}s...`);
      }

      if (attempt === retries) {
        connectionPromise = null;
        isConnected = false;
        throw err;
      }

      await new Promise(res => setTimeout(res, delayMs));
      delayMs *= 2;
    }
  }
}

async function getClient() {
  if (isConnected && clientInstance) return clientInstance;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      return await attemptConnection();
    } catch (err) {
      connectionPromise = null;
      throw err;
    }
  })();

  return connectionPromise;
}

async function getStatus() {
  const { apiId, apiHash, sessionString } = getConfig();
  const configured = Boolean(apiId && apiHash);
  const hasSession = Boolean(sessionString && sessionString.trim().length > 10);

  if (!configured) {
    return {
      configured: false,
      authenticated: false,
      hasSession: false,
      user: null,
      apiId,
      apiHashConfigured: Boolean(apiHash),
    };
  }

  try {
    const client = await getClient();
    const me = await client.getMe();
    return {
      configured: true,
      authenticated: true,
      hasSession: true,
      user: me ? {
        id: String(me.id),
        username: me.username || null,
        firstName: me.firstName || null,
        phone: me.phone || null,
      } : null,
      apiId,
      apiHashConfigured: true,
    };
  } catch (err) {
    return {
      configured: true,
      authenticated: hasSession,
      hasSession,
      user: null,
      apiId,
      apiHashConfigured: true,
      error: err.message,
    };
  }
}

async function sendPhoneCode(apiId, apiHash, phoneNumber) {
  const parsedApiId = parseInt(apiId, 10);
  if (!parsedApiId || !apiHash || !phoneNumber) {
    throw new Error('apiId, apiHash, and phoneNumber are required');
  }

  setSetting('TELEGRAM_API_ID', parsedApiId);
  setSetting('TELEGRAM_API_HASH', apiHash.trim());

  // Force re-creation of client
  clientInstance = null;
  const client = initOrGetClientInstance();
  await client.connect();

  const res = await client.sendCode(
    { apiId: parsedApiId, apiHash: apiHash.trim() },
    phoneNumber.trim()
  );

  return {
    phoneCodeHash: res.phoneCodeHash,
    isCodeViaApp: res.isCodeViaApp,
  };
}

async function signInUser({ phoneNumber, phoneCode, phoneCodeHash, password }) {
  const client = initOrGetClientInstance();
  if (!client) {
    throw new Error('Telegram client not initialized. Please request code first.');
  }

  if (!client.connected) {
    await client.connect();
  }

  try {
    const result = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phoneNumber.trim(),
        phoneCodeHash: phoneCodeHash.trim(),
        phoneCode: phoneCode.trim(),
      })
    );

    const savedSession = client.session.save();
    setSetting('SESSION_STRING', savedSession);
    currentSessionString = savedSession;
    isConnected = true;

    return {
      success: true,
      user: result.user ? {
        id: String(result.user.id),
        username: result.user.username || null,
        firstName: result.user.firstName || null,
        phone: result.user.phone || null,
      } : null,
    };
  } catch (err) {
    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      if (!password) {
        const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
        return {
          needs2FA: true,
          hint: passwordSrpResult.hint || '',
        };
      }

      // Check 2FA password
      const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
      const passwordCheck = await computeCheck(passwordSrpResult, password.trim());
      const res = await client.invoke(
        new Api.auth.CheckPassword({ password: passwordCheck })
      );

      const savedSession = client.session.save();
      setSetting('SESSION_STRING', savedSession);
      currentSessionString = savedSession;
      isConnected = true;

      return {
        success: true,
        user: res.user ? {
          id: String(res.user.id),
          username: res.user.username || null,
          firstName: res.user.firstName || null,
          phone: res.user.phone || null,
        } : null,
      };
    }

    throw err;
  }
}

async function saveSessionString(apiId, apiHash, sessionString) {
  const parsedApiId = parseInt(apiId, 10);
  if (!parsedApiId || !apiHash || !sessionString) {
    throw new Error('apiId, apiHash, and sessionString are required');
  }

  setSetting('TELEGRAM_API_ID', parsedApiId);
  setSetting('TELEGRAM_API_HASH', apiHash.trim());
  setSetting('SESSION_STRING', sessionString.trim());

  clientInstance = null;
  isConnected = false;
  connectionPromise = null;

  const client = await getClient();
  const me = await client.getMe();

  return {
    success: true,
    user: me ? {
      id: String(me.id),
      username: me.username || null,
      firstName: me.firstName || null,
      phone: me.phone || null,
    } : null,
  };
}

async function logout() {
  if (clientInstance && isConnected) {
    try {
      await clientInstance.invoke(new Api.auth.LogOut());
    } catch (_) {}
  }

  setSetting('SESSION_STRING', null);
  currentSessionString = '';
  isConnected = false;
  connectionPromise = null;
  if (clientInstance) {
    try { clientInstance.disconnect(); } catch (_) {}
    clientInstance = null;
  }

  return { success: true };
}

module.exports = {
  getClient,
  getStatus,
  sendPhoneCode,
  signInUser,
  saveSessionString,
  logout,
};
