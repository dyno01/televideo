const Database = require('better-sqlite3');
const path = require('path');

// Database file lives in the backend/db/ folder (or custom DATABASE_PATH env)
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'app.db');

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

