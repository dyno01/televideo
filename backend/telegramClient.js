const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { computeCheck } = require('telegram/Password');
const { getSetting, setSetting, db } = require('./db/database');

const clients = new Map();
const connectionPromises = new Map();

function getConfig(userId) {
  const apiIdStr = getSetting('TELEGRAM_API_ID', process.env.TELEGRAM_API_ID || '');
  const apiHash = getSetting('TELEGRAM_API_HASH', process.env.TELEGRAM_API_HASH || '');
  const apiId = parseInt(apiIdStr, 10) || 0;

  let sessionString = '';
  if (userId) {
    const userRow = db.prepare('SELECT telegram_session FROM users WHERE id = ?').get(userId);
    if (userRow && userRow.telegram_session) {
      sessionString = userRow.telegram_session;
    }
  }

  return { apiId, apiHash, sessionString };
}

function initOrGetClientInstance(userId) {
  if (!userId) throw new Error("userId is required");
  const { apiId, apiHash, sessionString } = getConfig(userId);

  if (!apiId || !apiHash) {
    return null;
  }

  let clientObj = clients.get(userId);

  if (
    !clientObj ||
    clientObj.apiId !== apiId ||
    clientObj.apiHash !== apiHash ||
    clientObj.sessionString !== sessionString
  ) {
    if (clientObj && clientObj.client) {
      try { clientObj.client.disconnect(); } catch (_) {}
    }

    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      useWSS: false,
      deviceModel: `TelevideoServer-${Math.random().toString(36).substring(2, 7)}`,
      systemVersion: `Render-${process.env.RENDER_INSTANCE_ID || 'Local'}`,
      appVersion: '1.0.0',
    });

    clientObj = {
      client,
      apiId,
      apiHash,
      sessionString,
      isConnected: false
    };
    clients.set(userId, clientObj);
    connectionPromises.delete(userId);
  }

  return clientObj;
}

async function attemptConnection(userId, retries = 3, delayMs = 3000) {
  const clientObj = initOrGetClientInstance(userId);
  if (!clientObj) {
    throw new Error('TELEGRAM_CONFIG_MISSING: TELEGRAM_API_ID and TELEGRAM_API_HASH must be configured in Telegram Settings.');
  }

  const { client } = clientObj;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Telegram] Connecting to Telegram for user ${userId}... (Attempt ${attempt}/${retries})`);
      await client.connect();

      const authorized = await client.checkAuthorization();
      if (!authorized) {
        console.warn(`[Telegram] ⚠️ Session string is invalid or unauthenticated for user ${userId}.`);
        clientObj.isConnected = false;
        throw new Error('TELEGRAM_AUTH_REQUIRED: Telegram session is not authorized. Please log in via Telegram Settings.');
      }

      clientObj.isConnected = true;
      const savedSession = client.session.save();
      if (savedSession && savedSession !== clientObj.sessionString) {
        clientObj.sessionString = savedSession;
        db.prepare('UPDATE users SET telegram_session = ? WHERE id = ?').run(savedSession, userId);
        console.log(`[Telegram] ✅ Session refreshed and saved for user ${userId}.`);
      } else {
        console.log(`[Telegram] ✅ Connected successfully for user ${userId}.`);
      }

      return client;

    } catch (err) {
      if (err.message && err.message.startsWith('TELEGRAM_')) {
        throw err;
      }
      
      console.error(`[Telegram] Connection error for user ${userId} on attempt ${attempt}:`, err.message);

      if (attempt === retries) {
        connectionPromises.delete(userId);
        clientObj.isConnected = false;
        throw err;
      }

      await new Promise(res => setTimeout(res, delayMs));
      delayMs *= 2;
    }
  }
}

async function getClient(userId) {
  if (!userId) throw new Error("userId is required to get Telegram client");
  
  const clientObj = clients.get(userId);
  if (clientObj && clientObj.isConnected && clientObj.client) {
    return clientObj.client;
  }
  
  let promise = connectionPromises.get(userId);
  if (promise) return promise;

  promise = (async () => {
    try {
      return await attemptConnection(userId);
    } catch (err) {
      connectionPromises.delete(userId);
      throw err;
    }
  })();

  connectionPromises.set(userId, promise);
  return promise;
}

async function getStatus(userId) {
  if (!userId) return { configured: false, authenticated: false, hasSession: false };
  const { apiId, apiHash, sessionString } = getConfig(userId);
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
    const client = await getClient(userId);
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

async function sendPhoneCode(userId, apiId, apiHash, phoneNumber) {
  const parsedApiId = parseInt(apiId, 10);
  if (!parsedApiId || !apiHash || !phoneNumber) {
    throw new Error('apiId, apiHash, and phoneNumber are required');
  }

  setSetting('TELEGRAM_API_ID', parsedApiId);
  setSetting('TELEGRAM_API_HASH', apiHash.trim());

  clients.delete(userId);
  const clientObj = initOrGetClientInstance(userId);
  await clientObj.client.connect();

  const res = await clientObj.client.sendCode(
    { apiId: parsedApiId, apiHash: apiHash.trim() },
    phoneNumber.trim()
  );

  return {
    phoneCodeHash: res.phoneCodeHash,
    isCodeViaApp: res.isCodeViaApp,
  };
}

async function signInUser(userId, { phoneNumber, phoneCode, phoneCodeHash, password }) {
  const clientObj = initOrGetClientInstance(userId);
  if (!clientObj || !clientObj.client) {
    throw new Error('Telegram client not initialized. Please request code first.');
  }

  const { client } = clientObj;
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
    db.prepare('UPDATE users SET telegram_session = ? WHERE id = ?').run(savedSession, userId);
    clientObj.sessionString = savedSession;
    clientObj.isConnected = true;

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

      const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
      const passwordCheck = await computeCheck(passwordSrpResult, password.trim());
      const res = await client.invoke(
        new Api.auth.CheckPassword({ password: passwordCheck })
      );

      const savedSession = client.session.save();
      db.prepare('UPDATE users SET telegram_session = ? WHERE id = ?').run(savedSession, userId);
      clientObj.sessionString = savedSession;
      clientObj.isConnected = true;

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

async function saveSessionString(userId, apiId, apiHash, sessionString) {
  const parsedApiId = parseInt(apiId, 10);
  if (!parsedApiId || !apiHash || !sessionString) {
    throw new Error('apiId, apiHash, and sessionString are required');
  }

  setSetting('TELEGRAM_API_ID', parsedApiId);
  setSetting('TELEGRAM_API_HASH', apiHash.trim());
  db.prepare('UPDATE users SET telegram_session = ? WHERE id = ?').run(sessionString.trim(), userId);

  clients.delete(userId);
  connectionPromises.delete(userId);

  const client = await getClient(userId);
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

async function logout(userId) {
  const clientObj = clients.get(userId);
  if (clientObj && clientObj.isConnected && clientObj.client) {
    try {
      await clientObj.client.invoke(new Api.auth.LogOut());
    } catch (_) {}
    try { clientObj.client.disconnect(); } catch (_) {}
  }

  db.prepare('UPDATE users SET telegram_session = NULL WHERE id = ?').run(userId);
  clients.delete(userId);
  connectionPromises.delete(userId);

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
