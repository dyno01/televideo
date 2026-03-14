/**
 * routes/batchRoutes.js
 *
 * Batch management — lets users create named batches from a Telegram
 * message ID range link (t.me/c/{channelId}/{startId}-{endId}).
 *
 * POST   /api/batches               — create + scan a batch
 * GET    /api/batches/channel/:id   — list batches for a channel
 * GET    /api/batches/:id           — single batch info
 * GET    /api/batches/:id/videos    — videos in a batch
 * GET    /api/batches/:id/files     — files in a batch
 * DELETE /api/batches/:id           — delete batch (untags videos/files)
 */

const express    = require('express');
const { Api }    = require('telegram');
const bigInt     = require('big-integer');
const { db, getOne, getAll, run } = require('../db/database');
const { getClient } = require('../telegramClient');

const router = express.Router();

const CHUNK_SIZE_SCAN = 100; // batch insert size
const RATE_LIMIT_MS   = 200;

// ── Parse batch link — supports both public and private channels ───────────
function parseBatchLink(link) {
  if (!link) return null;
  const trimmed = link.trim();

  // Private channel: https://t.me/c/1234567890/100-200  or  /100
  const privateMatch = trimmed.match(/t\.me\/c\/(\d+)\/(\d+)(?:-(\d+))?/);
  if (privateMatch) {
    return {
      type:      'private',
      channelId: privateMatch[1],
      username:  null,
      startId:   parseInt(privateMatch[2], 10),
      endId:     privateMatch[3] ? parseInt(privateMatch[3], 10) : parseInt(privateMatch[2], 10),
    };
  }

  // Public channel: https://t.me/username/100-200  or  /100
  const publicMatch = trimmed.match(/t\.me\/([a-zA-Z][a-zA-Z0-9_]{2,})\/(\d+)(?:-(\d+))?/);
  if (publicMatch) {
    return {
      type:      'public',
      channelId: null,
      username:  publicMatch[1],
      startId:   parseInt(publicMatch[2], 10),
      endId:     publicMatch[3] ? parseInt(publicMatch[3], 10) : parseInt(publicMatch[2], 10),
    };
  }

  return null;
}

// ── Classify a message (same logic as channelRoutes) ───────────────────────
function classifyMessage(message) {
  if (!message?.media?.document) return null;
  const doc    = message.media.document;
  const mime   = doc.mimeType || '';
  const attrs  = doc.attributes || [];
  const videoAttr    = attrs.find(a => a.className === 'DocumentAttributeVideo');
  const fileNameAttr = attrs.find(a => a.className === 'DocumentAttributeFilename');
  const fileName     = fileNameAttr?.fileName || null;

  if (mime.startsWith('video/') || videoAttr) {
    return { type: 'video', fileId: String(doc.id), accessHash: String(doc.accessHash),
      fileRef: Buffer.from(doc.fileReference), mimeType: mime, size: Number(doc.size),
      duration: videoAttr?.duration || 0, fileName: fileName || `video_${message.id}.mp4`,
      dcId: doc.dcId || 0 };
  }
  return { type: 'file', fileId: String(doc.id), accessHash: String(doc.accessHash),
    fileRef: Buffer.from(doc.fileReference), mimeType: mime, size: Number(doc.size),
    fileName: fileName || `file_${message.id}`, dcId: doc.dcId || 0 };
}

// ── POST /api/batches — create and scan a batch ────────────────────────────
router.post('/', async (req, res) => {
  const { channelId, name, tgLink } = req.body;
  if (!channelId || !name || !tgLink) {
    return res.status(400).json({ error: 'channelId, name, and tgLink are required' });
  }

  const parsed = parseBatchLink(tgLink);
  if (!parsed) {
    return res.status(400).json({
      error: 'Invalid Telegram link. Expected format: https://t.me/c/{ChannelID}/{StartID}-{EndID}',
    });
  }

  const channel = getOne('SELECT * FROM channels WHERE id = ?', [channelId]);
  if (!channel) return res.status(404).json({ error: 'Channel not found. Scan it first.' });

  try {
    const client = await getClient();

    // Resolve the peer
    let peer;
    if (channel.username.startsWith('__private__')) {
      const numId = channel.username.replace('__private__', '');
      peer = new Api.PeerChannel({ channelId: bigInt(numId) });
    } else {
      // For public channels peer can also be resolved from the link's channelId
      try { peer = await client.getEntity(new Api.PeerChannel({ channelId: bigInt(parsed.channelId) })); }
      catch { peer = await client.getEntity(channel.username); }
    }

    // Create the batch record
    run(
      `INSERT INTO batches (channel_id, name, tg_link, start_msg_id, end_msg_id, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [channelId, name.trim().slice(0, 120), tgLink, parsed.startId, parsed.endId,
       new Date().toISOString()]
    );
    const batch    = getOne('SELECT * FROM batches WHERE channel_id=? AND name=? ORDER BY id DESC LIMIT 1', [channelId, name.trim().slice(0, 120)]);
    const batchId  = batch.id;

    // Prepare inserts
    const insertVideo = db.prepare(
      `INSERT OR IGNORE INTO videos
         (channel_id, batch_id, message_id, title, duration, file_id, access_hash, file_reference, mime_type, size, dc_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertFile = db.prepare(
      `INSERT OR IGNORE INTO files
         (channel_id, batch_id, parent_video_id, message_id, file_name, mime_type, file_size, file_id, access_hash, file_reference, dc_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let lastVideoId = null;

    const batchInsert = db.transaction((messages) => {
      for (const message of messages) {
        const c = classifyMessage(message);
        if (!c) continue;
        const ts = message.date
          ? new Date(message.date * 1000).toISOString()
          : new Date().toISOString();
        if (c.type === 'video') {
          const title = message.message?.trim()?.slice(0, 300) || c.fileName;
          const info = insertVideo.run(channelId, batchId, message.id, title, c.duration,
            c.fileId, c.accessHash, c.fileRef, c.mimeType, c.size, c.dcId, ts);
          
          // Better-sqlite3 run returns { changes: 1, lastInsertRowid: xyz } if inserted
          // If IGNORE matches, changes will be 0. We need to find the video ID.
          if (info.changes === 1) {
            lastVideoId = info.lastInsertRowid;
          } else {
            const existing = getOne('SELECT id FROM videos WHERE channel_id = ? AND message_id = ?', [channelId, message.id]);
            if (existing) lastVideoId = existing.id;
          }
        } else {
          insertFile.run(channelId, batchId, lastVideoId, message.id, c.fileName, c.mimeType,
            c.size, c.fileId, c.accessHash, c.fileRef, c.dcId, ts);
        }
      }
    });

    // Scan message range
    const rangeSize  = parsed.endId - parsed.startId + 10;
    let videoCount = 0, fileCount = 0, scannedCount = 0;
    const buf = [];

    for await (const message of client.iterMessages(peer, {
      limit: rangeSize,
      minId: parsed.startId - 1,
      maxId: parsed.endId,
      reverse: true, // Crucial: scan oldest to newest so files follow their video
    })) {
      scannedCount++;
      buf.push(message);
      if (buf.length >= CHUNK_SIZE_SCAN) {
        batchInsert([...buf]);
        buf.forEach(m => { const c = classifyMessage(m); if (c) c.type === 'video' ? videoCount++ : fileCount++; });
        buf.length = 0;
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    }
    if (buf.length) {
      batchInsert(buf);
      buf.forEach(m => { const c = classifyMessage(m); if (c) c.type === 'video' ? videoCount++ : fileCount++; });
    }

    return res.json({
      success: true,
      batch: { ...batch, id: batchId },
      stats: { scanned: scannedCount, videos: videoCount, files: fileCount },
    });

  } catch (err) {
    // Clean up the batch record if scan failed
    run('DELETE FROM batches WHERE id = (SELECT MAX(id) FROM batches WHERE channel_id = ?)', [channelId]);
    console.error('[Batch] Scan error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/batches/channel/:channelId — list batches ─────────────────────
router.get('/channel/:channelId', (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const batches = getAll(
    `SELECT b.*,
       (SELECT COUNT(*) FROM videos v WHERE v.batch_id = b.id) AS videoCount,
       (SELECT COUNT(*) FROM files  f WHERE f.batch_id = b.id) AS fileCount
     FROM batches b WHERE b.channel_id = ? ORDER BY b.id ASC`,
    [channelId]
  );
  res.json(batches);
});

// ── GET /api/batches/:id — single batch ────────────────────────────────────
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const batch = getOne(
    `SELECT b.*,
       (SELECT COUNT(*) FROM videos v WHERE v.batch_id = b.id) AS videoCount,
       (SELECT COUNT(*) FROM files  f WHERE f.batch_id = b.id) AS fileCount
     FROM batches b WHERE b.id = ?`,
    [id]
  );
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  res.json(batch);
});

// ── GET /api/batches/:id/videos ────────────────────────────────────────────
router.get('/:id/videos', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const videos = getAll(
    `SELECT v.*,
       COALESCE(p.watched_percentage, 0) AS watched_percentage,
       COALESCE(p.last_timestamp, 0)     AS last_timestamp,
       COALESCE(p.completed, 0)          AS completed,
       c.username AS channel_username,
       c.title    AS channel_title
     FROM videos v
     JOIN channels c ON c.id = v.channel_id
     LEFT JOIN progress p ON p.video_id = v.id
     WHERE v.batch_id = ?
     ORDER BY v.message_id ASC`,
    [id]
  );
  res.json(videos);
});

// ── GET /api/batches/:id/files ─────────────────────────────────────────────
router.get('/:id/files', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const files = getAll(
    `SELECT f.*, c.username AS channel_username
     FROM files f JOIN channels c ON c.id = f.channel_id
     WHERE f.batch_id = ?
     ORDER BY f.parent_video_id ASC, f.mime_type DESC, f.message_id ASC`,
    [id]
  );
  res.json(files);
});

// ── GET /api/batches/:id/sequence ──────────────────────────────────────────
router.get('/:id/sequence', (req, res) => {
  const id = parseInt(req.params.id, 10);
  
  const videos = getAll(
    `SELECT v.*, 'video' as item_type,
       COALESCE(p.watched_percentage, 0) AS watched_percentage,
       COALESCE(p.last_timestamp, 0)     AS last_timestamp,
       COALESCE(p.completed, 0)          AS completed,
       c.username AS channel_username,
       c.title    AS channel_title
     FROM videos v
     JOIN channels c ON c.id = v.channel_id
     LEFT JOIN progress p ON p.video_id = v.id
     WHERE v.batch_id = ?`,
    [id]
  );

  const files = getAll(
    `SELECT f.*, 'file' as item_type, c.username AS channel_username
     FROM files f JOIN channels c ON c.id = f.channel_id
     WHERE f.batch_id = ?`,
    [id]
  );

  // Combine and sort by message_id
  const sequence = [...videos, ...files].sort((a, b) => a.message_id - b.message_id);
  res.json(sequence);
});

// ── DELETE /api/batches/:id ────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const batch = getOne('SELECT * FROM batches WHERE id = ?', [id]);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  try {
    // 1. Find all videos that are ONLY tied to this batch (not main channel scan)
    // Actually, in this app, videos usually belong to a channel.
    // Progress and notes are tied to video_id.
    
    // We untag videos/files from the batch.
    run('UPDATE videos SET batch_id = NULL WHERE batch_id = ?', [id]);
    run('UPDATE files  SET batch_id = NULL WHERE batch_id = ?', [id]);
    
    // 2. Delete the batch record
    run('DELETE FROM batches WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[Batch Delete Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/batches/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, link } = req.body;

  try {
    const oldBatch = getOne('SELECT * FROM batches WHERE id = ?', [id]);
    if (!oldBatch) return res.status(404).json({ error: 'Batch not found' });

    // Update basic info
    if (name) {
      run('UPDATE batches SET name = ? WHERE id = ?', [name.trim().slice(0, 120), id]);
    }

    // If link changed, we need to clear and re-scan
    if (link && link !== oldBatch.tg_link) {
      console.log(`[Batch] Link changed for ${id}. Clearing and re-scanning...`);
      
      const parsed = parseBatchLink(link);
      if (!parsed) return res.status(400).json({ error: 'Invalid Telegram message link' });

      // --- CRITICAL CLEANUP ---
      // We must untag items from THIS batch.
      // If we were to DELETE videos, we'd need to delete notes/progress too.
      // But we standardly 'untag' them unless they have no other associations.
      // However, scanBatchRange below will try to re-tag existing ones or insert new ones.
      
      run('UPDATE videos SET batch_id = NULL WHERE batch_id = ?', [id]);
      run('UPDATE files  SET batch_id = NULL WHERE batch_id = ?', [id]);
      
      // Update batch range
      run('UPDATE batches SET tg_link = ?, start_msg_id = ?, end_msg_id = ? WHERE id = ?', 
          [link, parsed.startId, parsed.endId, id]);

      // Trigger re-scan asynchronously
      scanBatchRange(id, parsed).catch(err => console.error('[Batch Re-scan Error]', err));
      
      return res.json({ success: true, message: 'Batch range updated and re-scan started' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Batch Update Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/** Helper to re-scan a batch range (used when link change) */
async function scanBatchRange(batchId, parsed) {
  const { getClient } = require('../lib/telegram');
  const client = await getClient();
  const channelId = getOne('SELECT channel_id FROM batches WHERE id = ?', [batchId]).channel_id;
  const channel = getOne('SELECT * FROM channels WHERE id = ?', [channelId]);
  const peer = await client.getEntity(channel.username);
  
  const rangeSize = parsed.endId - parsed.startId + 1;
  let lastVideoId = null;

  for await (const message of client.iterMessages(peer, {
    limit: rangeSize + 5,
    minId: parsed.startId - 1,
    maxId: parsed.endId,
    reverse: true, // Chronological scan
  })) {
    const c = classifyMessage(message);
    if (!c) continue;

    const ts = message.date;
    if (c.type === 'video') {
      const vid = getOne('SELECT id FROM videos WHERE channel_id = ? AND message_id = ?', [channelId, message.id]);
      if (vid) {
        run('UPDATE videos SET batch_id = ? WHERE id = ?', [batchId, vid.id]);
        lastVideoId = vid.id;
      } else {
        const { getVideoInfo } = require('../lib/telegram');
        const info = await getVideoInfo(client, message);
        const res = run(`INSERT INTO videos (channel_id, batch_id, message_id, title, duration, size, 
                         mime_type, file_id, access_hash, file_ref, dc_id, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [channelId, batchId, message.id, info.title, info.duration, info.size, 
           info.mimeType, info.fileId, info.accessHash, info.fileRef, info.dcId, ts]);
        lastVideoId = res.lastInsertRowid;
      }
    } else {
      run(`INSERT INTO files (channel_id, batch_id, parent_video_id, message_id, file_name, 
           mime_type, file_size, file_id, access_hash, file_ref, dc_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [channelId, batchId, lastVideoId, message.id, c.fileName, c.mimeType, 
         c.size, c.fileId, c.accessHash, c.fileRef, c.dcId, ts]);
    }
  }
}

module.exports = router;
