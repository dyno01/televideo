/**
 * routes/channelRoutes.js
 *
 * POST /api/channel/scan   — Scan a Telegram channel and store metadata
 * GET  /api/channel/:username — Get stored channel info + counts
 * GET  /api/channels        — List all scanned channels
 *
 * Supported URL formats:
 *   Public channel:  @username  or  t.me/username
 *   Private channel: https://t.me/c/{ChannelID}/{StartMsgID}-{EndMsgID}
 *                    https://t.me/c/{ChannelID}/{MsgID}
 */

const express = require('express');
const { Api } = require('telegram');
const { getClient } = require('../telegramClient');
const { db, getOne, getAll, run } = require('../db/database');

const router = express.Router();

// ─── Parse any supported channel URL format ────────────────────────────────
function parseChannelInput(raw) {
  const input = (raw || '').trim();

  // Private channel: https://t.me/c/1234567890/10-200
  //                  https://t.me/c/1234567890/10
  const privateMatch = input.match(/t\.me\/c\/(\d+)(?:\/(\d+)(?:-(\d+))?)?/);
  if (privateMatch) {
    return {
      type:      'private',
      channelId: privateMatch[1],                                       // numeric string
      startId:   privateMatch[2] ? parseInt(privateMatch[2], 10) : null,
      endId:     privateMatch[3] ? parseInt(privateMatch[3], 10) : null,
    };
  }

  // Public channel: @username, t.me/username, or bare username
  const username = input
    .replace(/^https?:\/\/t\.me\//, '')
    .replace(/^@/, '')
    .split('/')[0]
    .trim();

  return { type: 'public', username };
}

// ─── Helper: classify a single message ────────────────────────────────────
function classifyMessage(message) {
  if (!message || !message.media) return null;

  const media = message.media;
  if (!media.document) return null;

  const doc    = media.document;
  const mime   = doc.mimeType || '';
  const attrs  = doc.attributes || [];

  const videoAttr    = attrs.find(a => a.className === 'DocumentAttributeVideo');
  const fileNameAttr = attrs.find(a => a.className === 'DocumentAttributeFilename');
  const fileName     = fileNameAttr ? fileNameAttr.fileName : null;

  if (mime.startsWith('video/') || videoAttr) {
    return {
      type:      'video',
      fileId:    String(doc.id),
      accessHash:String(doc.accessHash),
      fileRef:   Buffer.from(doc.fileReference),
      mimeType:  mime,
      size:      Number(doc.size),
      duration:  videoAttr ? videoAttr.duration : 0,
      fileName:  fileName || `video_${message.id}.mp4`,
      dcId:      doc.dcId || 0,
    };
  }
  if (mime === 'application/pdf') {
    return {
      type:      'pdf',
      fileId:    String(doc.id),
      accessHash:String(doc.accessHash),
      fileRef:   Buffer.from(doc.fileReference),
      mimeType:  mime,
      size:      Number(doc.size),
      fileName:  fileName || `file_${message.id}.pdf`,
      dcId:      doc.dcId || 0,
    };
  }
  // Generic document
  return {
    type:      'file',
    fileId:    String(doc.id),
    accessHash:String(doc.accessHash),
    fileRef:   Buffer.from(doc.fileReference),
    mimeType:  mime,
    size:      Number(doc.size),
    fileName:  fileName || `file_${message.id}`,
    dcId:      doc.dcId || 0,
  };
}

// ─── POST /api/channel/scan ────────────────────────────────────────────────
router.post('/scan', async (req, res) => {
  const { channelUsername } = req.body;
  if (!channelUsername || typeof channelUsername !== 'string') {
    return res.status(400).json({ error: 'channelUsername is required' });
  }

  const parsed = parseChannelInput(channelUsername);
  const client = await getClient();

  let entity;
  let dbUsername;   // what we store as the channel's unique key

  try {
    if (parsed.type === 'private') {
      // GramJS PeerChannel for private channels uses the numeric ID
      entity      = await client.getEntity(new Api.PeerChannel({ channelId: BigInt(parsed.channelId) }));
      dbUsername  = `__private__${parsed.channelId}`;
    } else {
      entity      = await client.getEntity(parsed.username);
      dbUsername  = parsed.username;
    }
  } catch (e) {
    return res.status(404).json({
      error: `Channel not found: "${channelUsername}". ` +
             `For private channels use the full link: https://t.me/c/{ChannelID}/{MsgID}-{MsgID}`,
    });
  }

  const channelTitle = entity.title || entity.username || dbUsername;

  // Upsert channel record
  run(
    `INSERT INTO channels (username, title, scanned_at)
     VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET title = excluded.title, scanned_at = excluded.scanned_at`,
    [dbUsername, channelTitle, new Date().toISOString()]
  );
  const channel   = getOne('SELECT * FROM channels WHERE username = ?', [dbUsername]);
  const channelId = channel.id;

  // Clear old data — delete children first to satisfy FK constraints
  // 1. Progress & Notes (depend on videos)
  run(`DELETE FROM progress WHERE video_id IN (SELECT id FROM videos WHERE channel_id = ?)`, [channelId]);
  run(`DELETE FROM notes    WHERE video_id IN (SELECT id FROM videos WHERE channel_id = ?)`, [channelId]);
  
  // 2. Break parent_video_id links in files (depends on videos)
  run('UPDATE files SET parent_video_id = NULL WHERE channel_id = ?', [channelId]);
  
  // 3. Videos & Files (depend on batches and channels)
  run('DELETE FROM videos WHERE channel_id = ?', [channelId]);
  run('DELETE FROM files   WHERE channel_id = ?', [channelId]);

  // 4. Batches (depend on channels)
  run('DELETE FROM batches WHERE channel_id = ?', [channelId]);


  // Prepare batch inserts
  const insertVideo = db.prepare(
    `INSERT OR IGNORE INTO videos
       (channel_id, message_id, title, duration, file_id, access_hash, file_reference, mime_type, size, dc_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertFile = db.prepare(
    `INSERT OR IGNORE INTO files
       (channel_id, message_id, file_name, mime_type, file_size, file_id, access_hash, file_reference, dc_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const batchInsert = db.transaction((messages) => {
    for (const message of messages) {
      const c = classifyMessage(message);
      if (!c) continue;
      const ts = message.date
        ? new Date(message.date * 1000).toISOString()
        : new Date().toISOString();

      if (c.type === 'video') {
        const title = (message.message && message.message.trim())
          ? message.message.trim().slice(0, 300)
          : c.fileName;
        insertVideo.run(channelId, message.id, title, c.duration,
          c.fileId, c.accessHash, c.fileRef, c.mimeType, c.size, c.dcId || 0, ts);
      } else {
        insertFile.run(channelId, message.id, c.fileName, c.mimeType,
          c.size, c.fileId, c.accessHash, c.fileRef, c.dcId || 0, ts);
      }
    }
  });

  let videoCount = 0, fileCount = 0, scannedCount = 0;
  const batch = [];

  // Build iterMessages options — support start/end message ID range
  const iterOpts = { limit: 5000 };
  if (parsed.type === 'private' && parsed.endId) {
    // minId / maxId define an inclusive range
    iterOpts.minId = (parsed.startId || 1) - 1;
    iterOpts.maxId = parsed.endId;
    iterOpts.limit = parsed.endId - (parsed.startId || 1) + 10;
  }

  for await (const message of client.iterMessages(entity, iterOpts)) {
    scannedCount++;
    batch.push(message);
    if (batch.length >= 100) {
      const snap = [...batch];
      batchInsert(snap);
      const vids = snap.filter(m => classifyMessage(m)?.type === 'video').length;
      const fils = snap.filter(m => { const c = classifyMessage(m); return c && c.type !== 'video'; }).length;
      videoCount += vids;
      fileCount  += fils;
      batch.length = 0;
      await new Promise(r => setTimeout(r, 200)); // gentle rate limit
    }
  }
  if (batch.length > 0) {
    batchInsert(batch);
    batch.forEach(m => {
      const c = classifyMessage(m);
      if (!c) return;
      if (c.type === 'video') videoCount++; else fileCount++;
    });
  }

  return res.json({
    success: true,
    channel: { id: channelId, username: dbUsername, title: channelTitle },
    stats:   { scannedMessages: scannedCount, videos: videoCount, files: fileCount },
  });
});

// ─── GET /api/channels (list all) ─────────────────────────────────────────
router.get('/', (req, res) => {
  const channels = getAll(`
    SELECT c.*,
      (SELECT COUNT(*) FROM videos v WHERE v.channel_id = c.id) AS videoCount,
      (SELECT COUNT(*) FROM files  f WHERE f.channel_id = c.id) AS fileCount
    FROM channels c ORDER BY c.scanned_at DESC
  `);
  // Return user-friendly username for private channels
  res.json(channels.map(ch => ({
    ...ch,
    isPrivate:       ch.username.startsWith('__private__'),
    displayUsername: ch.username.startsWith('__private__')
                       ? `Private Channel (${ch.username.replace('__private__', '')})`
                       : ch.username,
  })));
});

// ─── GET /api/channel/:username ───────────────────────────────────────────
router.get('/:username', (req, res) => {
  let username = req.params.username;
  // Support both @name and raw name
  username = username.replace(/^@/, '');

  const channel = getOne('SELECT * FROM channels WHERE username = ?', [username]);
  if (!channel) return res.status(404).json({ error: 'Channel not found. Scan it first.' });

  const videoCount = getOne('SELECT COUNT(*) AS count FROM videos WHERE channel_id = ?', [channel.id]).count;
  const fileCount  = getOne('SELECT COUNT(*) AS count FROM files  WHERE channel_id = ?', [channel.id]).count;

  res.json({
    ...channel,
    videoCount,
    fileCount,
    isPrivate:       channel.username.startsWith('__private__'),
    displayUsername: channel.username.startsWith('__private__')
                       ? `Private Channel (${channel.username.replace('__private__', '')})`
                       : channel.username,
  });
});

module.exports = router;
