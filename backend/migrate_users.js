const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'db', 'app.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

try {
  db.transaction(() => {
    // 1. Recover from previous crash (if old_progress exists, put it back or ignore)
    const tables = db.pragma('table_list');
    if (tables.some(t => t.name === 'old_progress')) {
       db.exec('DROP TABLE IF EXISTS progress;');
       db.exec('ALTER TABLE old_progress RENAME TO progress;');
    }
    
    // Create users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    try { db.exec('ALTER TABLE progress ADD COLUMN dismissed INTEGER DEFAULT 0'); } catch(e){}

    const hasUserId = db.pragma('table_info(progress)').some(c => c.name === 'user_id');
    if (!hasUserId) {
      console.log('Migrating progress table to support multiple users...');
      
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update('admin').digest('hex');
      db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (1, 'admin', ?)").run(hash);

      db.exec('ALTER TABLE progress RENAME TO old_progress;');
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS progress (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id             INTEGER NOT NULL,
          video_id            INTEGER NOT NULL,
          watched_percentage  REAL    DEFAULT 0,
          last_timestamp      REAL    DEFAULT 0,
          completed           INTEGER DEFAULT 0,
          dismissed           INTEGER DEFAULT 0,
          updated_at          TEXT,
          FOREIGN KEY (video_id) REFERENCES videos(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          UNIQUE(user_id, video_id)
        );
      `);

      db.exec(`
        INSERT INTO progress (user_id, video_id, watched_percentage, last_timestamp, completed, dismissed, updated_at)
        SELECT 1, video_id, watched_percentage, last_timestamp, completed, dismissed, updated_at FROM old_progress;
      `);
      db.exec('DROP TABLE old_progress;');
    }

    const notesHasUserId = db.pragma('table_info(notes)').some(c => c.name === 'user_id');
    if (!notesHasUserId) {
      db.exec('ALTER TABLE notes ADD COLUMN user_id INTEGER;');
      db.exec('UPDATE notes SET user_id = 1;');
    }

    const batchesHasUserId = db.pragma('table_info(batches)').some(c => c.name === 'user_id');
    if (!batchesHasUserId) {
      db.exec('ALTER TABLE batches ADD COLUMN user_id INTEGER;');
      db.exec('UPDATE batches SET user_id = 1;');
    }

  })();
  console.log('Migration successful.');
} catch (err) {
  console.error('Migration failed:', err);
}
