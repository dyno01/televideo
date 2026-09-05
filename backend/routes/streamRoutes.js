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
const jwt      = require('jsonwebtoken');
const { getOne, run, getSetting } = require('../db/database');
const { getClient } = require('../telegramClient');
const { isStreamtapeConfigured, triggerStreamtapeUpload, getDirectStreamLink, formatCleanFilename } = require('../streamtapeUpload');

const router = express.Router();
const JWT_SECRET = getSetting('JWT_SECRET', 'super_secret_televideo_key_2026');

/** Extract user ID from Bearer token, query token, media ownership, or active session */
function getUserIdFromRequest(req, media) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) {
        return decoded.id;
      }
    } catch (_) {}
  }

  if (req.user && req.user.id) {
    return req.user.id;
  }

  const activeUser = getOne("SELECT id FROM users WHERE telegram_session IS NOT NULL AND telegram_session != '' ORDER BY id ASC LIMIT 1");
  if (activeUser) return activeUser.id;

  const firstUser = getOne('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  return firstUser ? firstUser.id : 1;
}

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

async function handleStreamVideo(req, res) {
  const videoId = parseInt(req.params.videoId, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const video = getOne('SELECT * FROM videos WHERE id = ?', [videoId]);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const isDownload = req.query.download === '1' || req.query.dl === '1' || req.path.endsWith('/download');

  // 1. Streamtape Playback Redirect Check (Direct video CDN link for native player)
  if (isStreamtapeConfigured() && video.streamtape_status === 'ready' && video.streamtape_id) {
    try {
      const directUrl = await getDirectStreamLink(video.streamtape_id);
      if (directUrl && typeof directUrl === 'string' && (directUrl.includes('.tapecontent.net') || directUrl.includes('/stream') || directUrl.includes('get_video') || directUrl.includes('dl?'))) {
        return res.redirect(directUrl);
      }
    } catch (err) {
      console.warn('[Streamtape Direct Link Error]:', err.message);
    }
    // Note: Do NOT redirect to video.streamtape_url because that is an HTML webpage,
    // which causes the HTML5 <video> player to buffer or error.
    // Instead, smoothly fall through to direct Telegram streaming below!
  }

  const userId = getUserIdFromRequest(req, video);

  try {
    let client;
    try {
      client = await getClient(userId);
    } catch (authErr) {
      return res.status(401).json({
        error: authErr.message || 'Telegram authentication required. Please log in via Telegram Settings.',
        authRequired: true,
      });
    }

    // 1. FAST PATH: Use cached database file reference immediately for 0ms startup lag
    let fileLocation;
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
      try {
        fileLocation = await getFreshMediaLocation(client, video);
      } catch (fetchErr) {
        return res.status(503).json({ error: `Stream unavailable: ${fetchErr.message}` });
      }
    }

    const totalSize = fileLocation.size || video.size || 0;
    const mimeType  = isDownload ? 'application/octet-stream' : (video.mime_type || 'video/mp4');
    const dcId      = fileLocation.dcId || video.dc_id || 0;

    const filenameSafe = formatCleanFilename(video.title, video.id);
    const contentDisposition = isDownload 
      ? `attachment; filename="${filenameSafe}"; filename*=UTF-8''${encodeURIComponent(filenameSafe)}` 
      : 'inline';

    // 3. Trigger Streamtape background upload if configured and not yet uploaded
    if (isStreamtapeConfigured() && (!video.streamtape_status || video.streamtape_status === 'none' || video.streamtape_status === 'failed')) {
      try {
        triggerStreamtapeUpload('video', video.id, userId, fileLocation, video.title, client).catch(err =>
          console.error('[Streamtape Trigger Error]', err.message)
        );
      } catch (triggerErr) {
        console.warn('[Streamtape Trigger Sync Error]', triggerErr.message);
      }
    }

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
        'Content-Range':       `bytes ${start}-${end}/${totalSize || '*'}`,
        'Accept-Ranges':       'bytes',
        'Content-Length':      contentLength,
        'Content-Type':        mimeType,
        'Content-Disposition': contentDisposition,
        'Cache-Control':       'no-cache',
      });
    } else {
      res.writeHead(200, {
        ...(totalSize ? { 'Content-Length': totalSize } : {}),
        'Content-Type':        mimeType,
        'Content-Disposition': contentDisposition,
        'Accept-Ranges':       'bytes',
        'Cache-Control':       'no-cache',
      });
    }

    // If client (e.g. Streamtape or browser) sent a HEAD request to probe headers, end response now
    if (req.method === 'HEAD') {
      return res.end();
    }

    let bytesWritten = 0;
    let firstChunk   = true;

    async function streamFromLocation(loc) {
      for await (const rawChunk of client.iterDownload({
        file:        loc.location,
        offset:      bigInt(alignedStart + bytesWritten),
        requestSize: CHUNK_SIZE,
        ...(loc.dcId ? { dcId: loc.dcId } : {}),
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
    }

    try {
      await streamFromLocation(fileLocation);
    } catch (streamErr) {
      const errStr = (streamErr.message || '').toUpperCase();
      if (errStr.includes('FILEREF') || errStr.includes('FILE_REFERENCE')) {
        console.log('[Stream] File reference expired mid-stream, refreshing online from Telegram...');
        const freshLoc = await getFreshMediaLocation(client, video);
        await streamFromLocation(freshLoc);
      } else {
        throw streamErr;
      }
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
}

router.get('/:videoId/download', (req, res) => {
  req.query.download = '1';
  return handleStreamVideo(req, res);
});
router.get('/:videoId', handleStreamVideo);

// GET /api/stream/file/:fileId
router.get('/file/:fileId', async (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  if (isNaN(fileId)) return res.status(400).json({ error: 'Invalid file ID' });

  const file = getOne('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const userId = getUserIdFromRequest(req, file);

  try {
    let client;
    try {
      client = await getClient(userId);
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

router.getFreshMediaLocation = getFreshMediaLocation;
module.exports = router;
