/**
 * telegramClient.js
 * 
 * Initializes and exports a singleton GramJS TelegramClient.
 * The client uses StringSession so it only authenticates once —
 * subsequent startups reuse the saved session string from .env.
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

// We need API_ID and API_HASH from environment variables
const API_ID = parseInt(process.env.TELEGRAM_API_ID, 10);
const API_HASH = process.env.TELEGRAM_API_HASH;
const SESSION_STRING = process.env.SESSION_STRING || '';

if (!API_ID || !API_HASH) {
  console.error(
    '[Telegram] ERROR: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in your .env file.\n' +
    '  Get them at https://my.telegram.org'
  );
  process.exit(1);
}

// Reuse existing session or start fresh
const session = new StringSession(SESSION_STRING);

// Create the client (singleton) - randomize device model to avoid some session collisions
const client = new TelegramClient(session, API_ID, API_HASH, {
  connectionRetries: 5,
  useWSS: false,
  deviceModel: `TelevideoServer-${Math.random().toString(36).substring(2, 7)}`,
  systemVersion: `Render-${process.env.RENDER_INSTANCE_ID || 'Local'}`,
  appVersion: '1.0.0',
});

let isConnected = false;
let connectionPromise = null;

async function attemptConnection(retries = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Telegram] Connecting to Telegram... (Attempt ${attempt}/${retries})`);
      await client.connect(); 
      
      // If we need to login (no valid session string), we call start
      if (!await client.checkAuthorization()) {
        console.log('[Telegram] Valid session not found, starting full login flow...');
        await client.start({
          phoneNumber: async () => {
            const readline = require('readline');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            return new Promise((resolve) => {
              rl.question('[Telegram] Enter your phone number (with country code, e.g. +919876543210): ', (ans) => {
                rl.close();
                resolve(ans.trim());
              });
            });
          },
          password: async () => {
            const readline = require('readline');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            return new Promise((resolve) => {
              rl.question('[Telegram] Enter your 2FA password (leave blank if none): ', (ans) => {
                rl.close();
                resolve(ans.trim());
              });
            });
          },
          phoneCode: async () => {
            const readline = require('readline');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            return new Promise((resolve) => {
              rl.question('[Telegram] Enter the code Telegram sent you: ', (ans) => {
                rl.close();
                resolve(ans.trim());
              });
            });
          },
          onError: (err) => console.error('[Telegram] Login error:', err.message),
        });
      }

      isConnected = true;
      
      const savedSession = client.session.save();
      if (savedSession && savedSession !== SESSION_STRING) {
        console.log('\n[Telegram] ✅ Connected! Save this SESSION_STRING in your .env file:');
        console.log('SESSION_STRING=' + savedSession + '\n');
      } else {
        console.log('[Telegram] ✅ Connected using saved session.');
      }
      return client;

    } catch (err) {
      console.error(`[Telegram] Connection error on attempt ${attempt}:`, err.message);
      
      if (err.message.includes('AUTH_KEY_DUPLICATED')) {
        console.warn(`[Telegram] ⚠️ Session conflict detected. Another instance is likely running. Waiting ${delayMs/1000}s before retry...`);
      }
      
      if (attempt === retries) {
        console.error('[Telegram] ❌ Max retries reached. Connection failed.');
        throw err;
      }
      
      await new Promise(res => setTimeout(res, delayMs));
      // Exponential backoff
      delayMs *= 2; 
    }
  }
}

async function getClient() {
  if (isConnected) return client;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      return await attemptConnection();
    } catch (err) {
      // If the final attempt fails, clear the promise so future calls can try again
      connectionPromise = null;
      throw err;
    }
  })();

  return connectionPromise;
}

module.exports = { getClient };
