/**
 * generate_session.js
 * 
 * Run this LOCALLY to generate a fresh Telegram SESSION_STRING.
 * 
 * Usage:
 * 1. Open your terminal in the 'backend' folder.
 * 2. Run: node generate_session.js
 * 3. Follow the prompts (Phone number, Code, 2FA).
 * 4. Copy the long string it gives you and paste it into SESSION_STRING on Render.
 */

require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

const API_ID = parseInt(process.env.TELEGRAM_API_ID, 10);
const API_HASH = process.env.TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
  console.error('ERROR: Please make sure TELEGRAM_API_ID and TELEGRAM_API_HASH are in your .env file.');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const consoleInput = (query) => new Promise((resolve) => rl.question(query, resolve));

(async () => {
  console.log('\n--- Telegram Session Generator ---\n');
  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await consoleInput('Enter your phone number (e.g. +919876543210): '),
    password: async () => await consoleInput('Enter your 2FA password (leave blank if none): '),
    phoneCode: async () => await consoleInput('Enter the code Telegram sent you: '),
    onError: (err) => console.error('Error:', err.message),
  });

  const sessionString = client.session.save();
  console.log('\n✅ SUCCESS! Here is your new SESSION_STRING:');
  console.log('-------------------------------------------');
  console.log(sessionString);
  console.log('-------------------------------------------\n');
  console.log('Copy the entire string above and update it in your Render Environment Variables.\n');
  
  await client.disconnect();
  rl.close();
  process.exit(0);
})();
