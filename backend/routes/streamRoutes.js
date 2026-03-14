/**
 * routes/streamRoutes.js
 *
 * GET /api/stream/:videoId
 *
 * Streams a Telegram video to the browser with HTTP Range support.
 * Always re-fetches a fresh file reference from the original message.
 *
 * Key fix: GramJS uses the `big-integer` library (not native BigInt).
 * The offset passed to iterDownload must be a bigInt instance.
 */

const express  = require('express');
const { Api }  = require('telegram');
const bigInt   = require('big-integer');   // ← GramJS's own bigint library
const { getOne } = require('../db/database');
const { getClient } = require('../telegramClient');

const router = express.Router();

// Telegram requires offsets aligned to multiples of 4 096.
const CHUNK_SIZE = 512 * 1024; // 524 288 bytes

/** Re-fetch a fresh InputDocumentFileLocation from the original message */
async function getFreshMediaLocation(client, media) {
  const channel = getOne('SELECT * FROM channels WHERE id = ?', [media.channel_id]);
  if (!channel) throw new Error('Channel record not found');

  let peer;
  if (channel.username && channel.username.startsWith('__private__')) {
    const numericId = channel.username.replace('__private__', '');
    peer = new Api.PeerChannel({ channelId: bigInt(numericId) });
  } else {
    peer = await client.getEntity(channel.username);
  }

  const msgs = await client.getMessages(peer, { ids: [media.message_id] });
  const msg  = msgs && msgs[0];

  if (!msg || !msg.media || !msg.media.document) {
    throw new Error('Message content not found — re-scan may be required');
  }

  const doc = msg.media.document;

  return {
    location: new Api.InputDocumentFileLocation({
      id:            doc.id,
      accessHash:    doc.accessHash,
      fileReference: Buffer.from(doc.fileReference),
      thumbSize:     '',
    }),
    dcId: doc.dcId || 0,
    size: Number(doc.size) || 0,
    mimeType: doc.mimeType || 'application/octet-stream',
  };
}

router.get('/:videoId', async (req, res) => {
  const videoId = parseInt(req.params.videoId, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const video = getOne('SELECT * FROM videos WHERE id = ?', [videoId]);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  try {
    const client = await getClient();

    // Get fresh file location (avoids expired-reference errors)
    let fileLocation;
    try {
      fileLocation = await getFreshMediaLocation(client, video);
    } catch (fetchErr) {
      console.error('[Stream] Could not refresh file reference:', fetchErr.message);
      return res.status(503).json({ error: fetchErr.message });
    }

    const totalSize = fileLocation.size || video.size || 0;
    const mimeType  = video.mime_type || 'video/mp4';
    const dcId      = fileLocation.dcId || video.dc_id || 0;

    // ── Parse Range header ─────────────────────────────────────────
    const rangeHeader = req.headers.range;
    let start = 0;
    let end   = totalSize > 0 ? totalSize - 1 : 0;

    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        start = parseInt(m[1], 10);
        end   = m[2] ? parseInt(m[2], 10) : end;
      }
    }

    const contentLength = end - start + 1;

    // Align start to Telegram's chunk boundary
    const alignedStart = Math.floor(start / CHUNK_SIZE) * CHUNK_SIZE;
    const skipBytes    = start - alignedStart;

    // ── Send headers ───────────────────────────────────────────────
    if (rangeHeader) {
      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${totalSize || '*'}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': contentLength,
        'Content-Type':   mimeType,
        'Cache-Control':  'no-cache',
      });
    } else {
      res.writeHead(200, {
        ...(totalSize ? { 'Content-Length': totalSize } : {}),
        'Content-Type':  mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });
    }

    // ── Stream via GramJS iterDownload ─────────────────────────────
    // IMPORTANT: offset must use big-integer (GramJS internal type), not native BigInt
    let bytesWritten = 0;
    let firstChunk   = true;

    for await (const rawChunk of client.iterDownload({
      file:        fileLocation.location,   // InputDocumentFileLocation
      offset:      bigInt(alignedStart),    // big-integer instance (GramJS internal type)
      requestSize: CHUNK_SIZE,
      ...(dcId ? { dcId } : {}),           // DC-aware routing for 2-3× faster speeds
    })) {
      if (res.destroyed || !res.writable) break;

      let chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);

      // Drop leading bytes caused by chunk alignment
      if (firstChunk && skipBytes > 0) {
        chunk = chunk.slice(skipBytes);
        firstChunk = false;
      } else {
        firstChunk = false;
      }

      // Stop once we've sent the requested range
      if (rangeHeader && bytesWritten + chunk.length > contentLength) {
        chunk = chunk.slice(0, contentLength - bytesWritten);
      }

      if (chunk.length === 0) break;
      res.write(chunk);
      bytesWritten += chunk.length;
      if (rangeHeader && bytesWritten >= contentLength) break;
    }

    res.end();

  } catch (err) {
    console.error('[Stream Error]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Streaming failed' });
    } else {
      res.end();
    }
  }
});

// ── GET /api/stream/file/:fileId ───────────────────────────────────────────
router.get('/file/:fileId', async (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  if (isNaN(fileId)) return res.status(400).json({ error: 'Invalid file ID' });

  const file = getOne('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) return res.status(404).json({ error: 'File not found' });

  try {
    const client = await getClient();
    const mediaLoc = await getFreshMediaLocation(client, file);

    const totalSize = mediaLoc.size;
    const mimeType  = mediaLoc.mimeType || 'application/octet-stream';
    const dcId      = mediaLoc.dcId;

    res.writeHead(200, {
      'Content-Length': totalSize,
      'Content-Type':   mimeType,
      'Content-Disposition': `inline; filename="${file.file_name || 'file'}"`,
      'Cache-Control':  'public, max-age=3600',
    });

    for await (const rawChunk of client.iterDownload({
      file:        mediaLoc.location,
      offset:      bigInt(0),
      requestSize: 1024 * 1024, // 1MB chunks for files
      ...(dcId ? { dcId } : {}),
    })) {
      if (res.destroyed || !res.writable) break;
      res.write(rawChunk);
    }
    res.end();

  } catch (err) {
    console.error('[File Proxy Error]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

module.exports = router;
