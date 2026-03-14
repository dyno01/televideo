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

// Create the client (singleton)
const client = new TelegramClient(session, API_ID, API_HASH, {
  connectionRetries: 5,
  useWSS: false,
});

let isConnected = false;

/**
 * Returns the connected TelegramClient.
 * If not yet connected, connects first.
 * On the very first run (no SESSION_STRING), GramJS will prompt
 * for a phone number and code via the terminal.
 */
async function getClient() {
  if (isConnected) return client;

  console.log('[Telegram] Connecting to Telegram...');

  await client.start({
    phoneNumber: async () => {
      // Dynamic import so we don't need readline in every file
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
    onError: (err) => {
      console.error('[Telegram] Connection error:', err.message);
    },
  });

  isConnected = true;

  // Save session so next time we skip the login prompt
  const savedSession = client.session.save();
  if (savedSession && savedSession !== SESSION_STRING) {
    console.log('\n[Telegram] ✅ Connected! Save this SESSION_STRING in your .env file:');
    console.log('SESSION_STRING=' + savedSession);
    console.log('');
  } else {
    console.log('[Telegram] ✅ Connected using saved session.');
  }

  return client;
}

module.exports = { getClient };
