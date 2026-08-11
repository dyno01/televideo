/**
 * routes/streamRoutes.js
 *
 * GET /api/stream/:videoId
 *
 * Streams a Telegram video to the browser with HTTP Range support.
 * Re-fetches fresh file references with database fallbacks.
 */

const express  = require('express');
const { Api }  = require('telegram');
const bigInt   = require('big-integer');
const { getOne, run } = require('../db/database');
const { getClient } = require('../telegramClient');

const router = express.Router();

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks (Maximum Telegram chunk size for faster streaming)

/** Re-fetch a fresh InputDocumentFileLocation from the original message */
async function getFreshMediaLocation(client, media) {
  const channel = getOne('SELECT * FROM channels WHERE id = ?', [media.channel_id]);
  if (!channel) throw new Error('Channel record not found');

  let peer;
  if (channel.username && channel.username.startsWith('__private__')) {
    const numericId = channel.username.replace('__private__', '');
    peer = new Api.PeerChannel({ channelId: bigInt(numericId) });
  } else {
    try {
      peer = await client.getEntity(channel.username);
    } catch (_) {
      peer = channel.username;
    }
  }

  const msgs = await client.getMessages(peer, { ids: [media.message_id] });
  const msg  = msgs && msgs[0];

  if (!msg || !msg.media || !msg.media.document) {
    throw new Error('Message content not found on Telegram — re-scan may be required');
  }

  const doc = msg.media.document;

  // Persist fresh file reference in DB
  try {
    if (media.title !== undefined) {
      run('UPDATE videos SET file_reference = ?, access_hash = ?, dc_id = ? WHERE id = ?',
        [Buffer.from(doc.fileReference), String(doc.accessHash), doc.dcId || 0, media.id]);
    } else {
      run('UPDATE files SET file_reference = ?, access_hash = ?, dc_id = ? WHERE id = ?',
        [Buffer.from(doc.fileReference), String(doc.accessHash), doc.dcId || 0, media.id]);
    }
  } catch (_) {}

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
    let client;
    try {
      client = await getClient();
    } catch (authErr) {
      return res.status(401).json({
        error: authErr.message || 'Telegram authentication required. Please log in via Telegram Settings.',
        authRequired: true,
      });
    }

    // Get fresh file location with database fallback
    let fileLocation;
    try {
      fileLocation = await getFreshMediaLocation(client, video);
    } catch (fetchErr) {
      console.warn('[Stream] Could not refresh file reference online, checking database fallback:', fetchErr.message);

      if (video.file_id && video.access_hash && video.file_reference) {
        fileLocation = {
          location: new Api.InputDocumentFileLocation({
            id:            bigInt(video.file_id),
            accessHash:    bigInt(video.access_hash),
            fileReference: Buffer.isBuffer(video.file_reference)
                             ? video.file_reference
                             : Buffer.from(video.file_reference),
            thumbSize:     '',
          }),
          dcId: video.dc_id || 0,
          size: video.size || 0,
          mimeType: video.mime_type || 'video/mp4',
        };
      } else {
        return res.status(503).json({ error: `Stream unavailable: ${fetchErr.message}` });
      }
    }

    const totalSize = fileLocation.size || video.size || 0;
    const mimeType  = video.mime_type || 'video/mp4';
    const dcId      = fileLocation.dcId || video.dc_id || 0;

    // Parse Range header
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
    const alignedStart = Math.floor(start / CHUNK_SIZE) * CHUNK_SIZE;
    const skipBytes    = start - alignedStart;

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

    let bytesWritten = 0;
    let firstChunk   = true;

    for await (const rawChunk of client.iterDownload({
      file:        fileLocation.location,
      offset:      bigInt(alignedStart),
      requestSize: CHUNK_SIZE,
      ...(dcId ? { dcId } : {}),
    })) {
      if (res.destroyed || !res.writable) break;

      let chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);

      if (firstChunk && skipBytes > 0) {
        chunk = chunk.slice(skipBytes);
        firstChunk = false;
      } else {
        firstChunk = false;
      }

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

// GET /api/stream/file/:fileId
router.get('/file/:fileId', async (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  if (isNaN(fileId)) return res.status(400).json({ error: 'Invalid file ID' });

  const file = getOne('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) return res.status(404).json({ error: 'File not found' });

  try {
    let client;
    try {
      client = await getClient();
    } catch (authErr) {
      return res.status(401).json({
        error: authErr.message || 'Telegram authentication required. Please log in via Telegram Settings.',
        authRequired: true,
      });
    }

    let mediaLoc;
    try {
      mediaLoc = await getFreshMediaLocation(client, file);
    } catch (fetchErr) {
      if (file.file_id && file.access_hash && file.file_reference) {
        mediaLoc = {
          location: new Api.InputDocumentFileLocation({
            id:            bigInt(file.file_id),
            accessHash:    bigInt(file.access_hash),
            fileReference: Buffer.isBuffer(file.file_reference) ? file.file_reference : Buffer.from(file.file_reference),
            thumbSize:     '',
          }),
          dcId: file.dc_id || 0,
          size: file.file_size || 0,
          mimeType: file.mime_type || 'application/octet-stream',
        };
      } else {
        return res.status(503).json({ error: fetchErr.message });
      }
    }

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
      requestSize: 1024 * 1024,
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
