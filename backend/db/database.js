const Database = require('better-sqlite3');
const path = require('path');

// Database file lives in the backend/db/ folder
const DB_PATH = path.join(__dirname, 'app.db');

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

  CREATE TABLE IF NOT EXISTS progress (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id            INTEGER UNIQUE NOT NULL,
    watched_percentage  REAL    DEFAULT 0,
    last_timestamp      REAL    DEFAULT 0,
    completed           INTEGER DEFAULT 0,
    updated_at          TEXT,
    FOREIGN KEY (video_id) REFERENCES videos(id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
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

// Unique indexes to enable non-destructive re-scans (preserves video IDs, progress & notes)
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_channel_message ON videos(channel_id, message_id)'); } catch (_) {}
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_files_channel_message ON files(channel_id, message_id)'); } catch (_) {}

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

