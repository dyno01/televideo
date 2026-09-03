const Database = require('better-sqlite3');
const path = require('path');

const fs = require('fs');

// Database file lives in the backend/db/ folder (or custom DATABASE_PATH env)
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'app.db');

// Ensure the directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Open (or create) the SQLite database
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Create tables on startup ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT UNIQUE NOT NULL,
    title       TEXT,
    photo_url   TEXT,
    scanned_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS videos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id      INTEGER NOT NULL,
    message_id      INTEGER NOT NULL,
    title           TEXT,
    duration        INTEGER,
    file_id         TEXT,
    access_hash     TEXT,
    file_reference  BLOB,
    mime_type       TEXT,
    size            INTEGER,
    created_at      TEXT,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );

  CREATE TABLE IF NOT EXISTS files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id      INTEGER NOT NULL,
    message_id      INTEGER NOT NULL,
    file_name       TEXT,
    mime_type       TEXT,
    file_size       INTEGER,
    file_id         TEXT,
    access_hash     TEXT,
    file_reference  BLOB,
    created_at      TEXT,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

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

  CREATE TABLE IF NOT EXISTS notes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER,
    video_id      INTEGER NOT NULL,
    timestamp_sec REAL    NOT NULL,
    note_text     TEXT    NOT NULL,
    created_at    TEXT,
    FOREIGN KEY (video_id) REFERENCES videos(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Safe migration: add dc_id if it doesn't exist yet
try { db.exec('ALTER TABLE videos ADD COLUMN dc_id INTEGER DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE files  ADD COLUMN dc_id INTEGER DEFAULT 0'); } catch (_) {}

// Batches feature
db.exec(`
  CREATE TABLE IF NOT EXISTS batches (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER,
    channel_id   INTEGER NOT NULL,
    name         TEXT    NOT NULL,
    tg_link      TEXT,
    start_msg_id INTEGER,
    end_msg_id   INTEGER,
    scanned_at   TEXT,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );
`);
try { db.exec('ALTER TABLE videos ADD COLUMN batch_id INTEGER REFERENCES batches(id)'); } catch (_) {}
try { db.exec('ALTER TABLE files  ADD COLUMN batch_id INTEGER REFERENCES batches(id)'); } catch (_) {}
try { db.exec('ALTER TABLE files  ADD COLUMN parent_video_id INTEGER REFERENCES videos(id)'); } catch (_) {}

// Tags feature
db.exec(`
  CREATE TABLE IF NOT EXISTS video_tags (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    tag      TEXT    NOT NULL,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  );
`);

// ─── Auto-Migration to Multi-User ───────────────────────────────────────────
try {
  const hasProgressRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='progress'").get();
  const hasProgress = !!hasProgressRow;
  
  if (hasProgress) {
    const hasUserId = db.pragma('table_info(progress)').some(c => c.name === 'user_id');
    if (!hasUserId) {
      console.log('Migrating progress table to support multiple users...');
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update('admin').digest('hex');
      db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (1, 'admin', ?)").run(hash);

      try { db.exec('ALTER TABLE progress ADD COLUMN dismissed INTEGER DEFAULT 0'); } catch(e) {}
      db.exec('ALTER TABLE progress RENAME TO old_progress;');
    }
  }

  const hasProgressAfterRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='progress'").get();
  const hasProgressAfter = !!hasProgressAfterRow;
  const hasUserIdAfter = hasProgressAfter && db.pragma('table_info(progress)').some(c => c.name === 'user_id');

  if (!hasUserIdAfter) {
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
  }

  const hasOldProgressRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='old_progress'").get();
  if (hasOldProgressRow) {
    try {
      db.exec(`
        INSERT OR IGNORE INTO progress (user_id, video_id, watched_percentage, last_timestamp, completed, dismissed, updated_at)
        SELECT 1, video_id, watched_percentage, last_timestamp, completed, dismissed, updated_at FROM old_progress;
      `);
      db.exec('DROP TABLE old_progress;');
    } catch(e) {
      console.error('Error recovering old_progress data:', e);
    }
  }
} catch (e) {
  console.error('Migration error:', e);
}

try {
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
} catch (e) {}

// --- MIGRATION: Deduplicate videos and files before applying unique constraints ---
try {
  db.transaction(() => {
    // 1. Find all duplicate videos
    const dupVideos = db.prepare(`
      SELECT channel_id, message_id, MIN(id) as keep_id
      FROM videos GROUP BY channel_id, message_id HAVING COUNT(*) > 1
    `).all();

    for (const group of dupVideos) {
      const others = db.prepare(`SELECT id FROM videos WHERE channel_id = ? AND message_id = ? AND id != ?`).all(group.channel_id, group.message_id, group.keep_id);
      for (const other of others) {
        const oldId = other.id;
        db.prepare(`UPDATE OR IGNORE progress SET video_id = ? WHERE video_id = ?`).run(group.keep_id, oldId);
        db.prepare(`DELETE FROM progress WHERE video_id = ?`).run(oldId);
        db.prepare(`UPDATE notes SET video_id = ? WHERE video_id = ?`).run(group.keep_id, oldId);
        try {
          db.prepare(`UPDATE OR IGNORE video_tags SET video_id = ? WHERE video_id = ?`).run(group.keep_id, oldId);
          db.prepare(`DELETE FROM video_tags WHERE video_id = ?`).run(oldId);
        } catch (e) {}
        db.prepare(`UPDATE files SET parent_video_id = ? WHERE parent_video_id = ?`).run(group.keep_id, oldId);
        db.prepare(`DELETE FROM videos WHERE id = ?`).run(oldId);
      }
    }

    // 2. Find and delete duplicate files
    const dupFiles = db.prepare(`
      SELECT channel_id, message_id, MIN(id) as keep_id
      FROM files GROUP BY channel_id, message_id HAVING COUNT(*) > 1
    `).all();

    for (const group of dupFiles) {
      db.prepare(`DELETE FROM files WHERE channel_id = ? AND message_id = ? AND id != ?`).run(group.channel_id, group.message_id, group.keep_id);
    }

    // 3. Restore missing batch_ids
    const batches = db.prepare('SELECT * FROM batches').all();
    for (const b of batches) {
      db.prepare('UPDATE videos SET batch_id = ? WHERE channel_id = ? AND message_id >= ? AND message_id <= ?').run(b.id, b.channel_id, b.start_msg_id, b.end_msg_id);
      db.prepare('UPDATE files SET batch_id = ? WHERE channel_id = ? AND message_id >= ? AND message_id <= ?').run(b.id, b.channel_id, b.start_msg_id, b.end_msg_id);
    }
  })();
} catch (err) {
  console.error('[DB] Migration error during deduplication:', err);
}
// ----------------------------------------------------------------------------------

// Unique indexes to enable non-destructive re-scans (preserves video IDs, progress & notes)
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_channel_message ON videos(channel_id, message_id)'); } catch (e) { console.error('Failed to create idx_videos_channel_message', e) }
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_files_channel_message ON files(channel_id, message_id)'); } catch (e) { console.error('Failed to create idx_files_channel_message', e) }

// High-Performance Query Indexes
try { db.exec('CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON videos(channel_id)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_videos_batch_id ON videos(batch_id)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_files_channel_id ON files(channel_id)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_files_batch_id ON files(batch_id)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_progress_video_id ON progress(video_id)'); } catch (_) {}

// Video tags feature
db.exec(`
  CREATE TABLE IF NOT EXISTS video_tags (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    tag      TEXT    NOT NULL,
    FOREIGN KEY (video_id) REFERENCES videos(id),
    UNIQUE(video_id, tag)
  );
`);

try { db.exec('ALTER TABLE progress ADD COLUMN dismissed INTEGER DEFAULT 0'); } catch (_) {}



// Safe migration: add telegram_session to users table
try { db.exec('ALTER TABLE users ADD COLUMN telegram_session TEXT'); } catch (_) {}

// Safe migration: add r2 caching status columns to videos and files
try {
  db.exec("ALTER TABLE videos ADD COLUMN r2_status TEXT DEFAULT 'none'");
  db.exec('ALTER TABLE videos ADD COLUMN r2_key TEXT');
} catch (_) {}

try {
  db.exec("ALTER TABLE files ADD COLUMN r2_status TEXT DEFAULT 'none'");
  db.exec('ALTER TABLE files ADD COLUMN r2_key TEXT');
} catch (_) {}

// Safe migration: add Streamtape columns
try {
  db.exec("ALTER TABLE videos ADD COLUMN streamtape_status TEXT DEFAULT 'none'");
  db.exec('ALTER TABLE videos ADD COLUMN streamtape_id TEXT');
  db.exec('ALTER TABLE videos ADD COLUMN streamtape_url TEXT');
} catch (_) {}

try {
  db.exec("ALTER TABLE files ADD COLUMN streamtape_status TEXT DEFAULT 'none'");
  db.exec('ALTER TABLE files ADD COLUMN streamtape_id TEXT');
  db.exec('ALTER TABLE files ADD COLUMN streamtape_url TEXT');
} catch (_) {}

try {
  db.exec("ALTER TABLE batches ADD COLUMN streamtape_folder_id TEXT");
} catch (_) {}

try {
  db.exec("ALTER TABLE channels ADD COLUMN streamtape_folder_id TEXT");
} catch (_) {}

try {
  db.exec("ALTER TABLE videos ADD COLUMN upload_percentage INTEGER DEFAULT 0");
} catch (_) {}

try {
  db.exec("ALTER TABLE files ADD COLUMN upload_percentage INTEGER DEFAULT 0");
} catch (_) {}

try {
  db.exec("ALTER TABLE videos ADD COLUMN streamtape_last_accessed_at TEXT");
} catch (_) {}

try {
  db.exec("ALTER TABLE files ADD COLUMN streamtape_last_accessed_at TEXT");
} catch (_) {}

// Seed initial settings from environment if not present
const seedSetting = (key, val) => {
  if (val && !db.prepare('SELECT value FROM settings WHERE key = ?').get(key)) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, String(val));
  }
};
seedSetting('TELEGRAM_API_ID', process.env.TELEGRAM_API_ID);
seedSetting('TELEGRAM_API_HASH', process.env.TELEGRAM_API_HASH);
seedSetting('SESSION_STRING', process.env.SESSION_STRING);

console.log('[DB] SQLite database ready at', DB_PATH);

// ─── Helper functions ──────────────────────────────────────────────────────

/** Run a SELECT and return all rows */
function getAll(sql, params = []) {
  return db.prepare(sql).all(params);
}

/** Run a SELECT and return one row */
function getOne(sql, params = []) {
  return db.prepare(sql).get(params);
}

/** Run INSERT / UPDATE / DELETE and return the info object */
function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

/** Get a setting by key */
function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

/** Set a setting by key */
function setSetting(key, value) {
  if (value === null || value === undefined) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  } else {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
  }
}

module.exports = { db, getAll, getOne, run, getSetting, setSetting };

