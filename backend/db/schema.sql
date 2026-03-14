-- Telegram Learning Dashboard - Database Schema
-- This file is for reference only.
-- Tables are created programmatically in db/database.js on startup.

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  title TEXT,
  photo_url TEXT,
  scanned_at TEXT
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  title TEXT,
  duration INTEGER,
  file_id TEXT,
  access_hash TEXT,
  file_reference BLOB,
  mime_type TEXT,
  size INTEGER,
  created_at TEXT,
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  file_id TEXT,
  access_hash TEXT,
  file_reference BLOB,
  created_at TEXT,
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE TABLE IF NOT EXISTS progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER UNIQUE NOT NULL,
  watched_percentage REAL DEFAULT 0,
  last_timestamp REAL DEFAULT 0,
  completed INTEGER DEFAULT 0,
  updated_at TEXT,
  FOREIGN KEY (video_id) REFERENCES videos(id)
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  timestamp_sec REAL NOT NULL,
  note_text TEXT NOT NULL,
  created_at TEXT,
  FOREIGN KEY (video_id) REFERENCES videos(id)
);
