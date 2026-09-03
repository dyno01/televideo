const https = require('https');
const http = require('http');
const { Readable } = require('stream');
const FormData = require('form-data');
const { db, getOne, getAll, run } = require('./db/database');
const bigInt = require('big-integer');

const STREAMTAPE_API_BASE = 'https://api.streamtape.com';

/**
 * Streamtape credentials:
 * - STREAMTAPE_LOGIN: "API / FTP" field on Streamtape panel
 * - STREAMTAPE_KEY: "FTP / API Password" field on Streamtape panel
 */
function getStreamtapeCredentials() {
  const { getSetting } = require('./db/database');
  const login = (
    process.env.STREAMTAPE_LOGIN ||
    process.env.STREAMTAPE_API_LOGIN ||
    process.env.STREAMTAPE_API_USER ||
    process.env.STREAMTAPE_USER ||
    getSetting('STREAMTAPE_LOGIN') ||
    getSetting('STREAMTAPE_API_LOGIN') ||
    ''
  ).trim();

  const key = (
    process.env.STREAMTAPE_KEY ||
    process.env.STREAMTAPE_API_KEY ||
    process.env.STREAMTAPE_API_PASSWORD ||
    process.env.STREAMTAPE_PASSWORD ||
    getSetting('STREAMTAPE_KEY') ||
    getSetting('STREAMTAPE_API_KEY') ||
    ''
  ).trim();

  return { login, key };
}

/**
 * Format clean, human-readable video filename from Telegram captions
 * Removes Unicode math fonts (e.g. 𝚅𝚒𝚍 𝙸𝚍 -> Vid Id), resolution tags, channel handles, and junk.
 */
function formatCleanFilename(rawText, defaultId = '') {
  if (!rawText || typeof rawText !== 'string') {
    return `video_${defaultId || Date.now()}.mp4`;
  }

  // 1. Normalize Unicode mathematical/bold/monospace characters (e.g. 𝚅𝚒𝚍 𝙸𝚍 -> Vid Id)
  const norm = rawText.normalize('NFKD');

  // 2. Extract title after 'Video Title :'
  let extracted = '';
  const titleMatch = norm.match(/(?:video\s*title|lecture\s*name|topic)\s*:\s*([^\n\r]+)/i);
  if (titleMatch && titleMatch[1]) {
    extracted = titleMatch[1];
  } else {
    const lines = norm.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const l of lines) {
      if (!/(vid\s*id|batch\s*name|extracted|join|@|https?:)/i.test(l)) {
        extracted = l;
        break;
      }
    }
    if (!extracted && lines.length > 0) extracted = lines[0];
  }

  // 3. Remove metadata, extensions, resolutions, URLs, and channel tags
  let clean = extracted
    .replace(/\[\d+x\d+p\]/gi, '')
    .replace(/\.mkv|\.mp4/gi, '')
    .replace(/@\S+/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[\/\\?%*:|"<>]/g, '')
    .trim();

  // 4. Clean duplicate phrases (e.g. 'Topic 02 Topic [Part 02]' -> 'Topic - Lecture 02')
  const numSplit = clean.split(/\s+(\d+)\s+/);
  if (numSplit.length >= 3) {
    const p1 = numSplit[0].trim();
    const num = numSplit[1].trim();
    const p2 = numSplit.slice(2).join(' ').replace(/\[Part\s*\d+\]/gi, '').trim();
    if (p2.toLowerCase().startsWith(p1.toLowerCase().slice(0, 15)) || p1.toLowerCase().startsWith(p2.toLowerCase().slice(0, 15))) {
      clean = p1 + ' - Lecture ' + num;
    }
  }

  clean = clean
    .replace(/\[Part\s*\d+\]/gi, '')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 2) {
    clean = `video_${defaultId || 'file'}`;
  }

  return clean.slice(0, 100).trim() + '.mp4';
}

function isStreamtapeConfigured() {
  const { login, key } = getStreamtapeCredentials();
  return login.length > 0 && key.length > 0;
}

let detectedBaseUrl = null;

function setDetectedBaseUrl(req) {
  if (req) {
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      const fullUrl = `${proto}://${host}`;
      if (detectedBaseUrl !== fullUrl) {
        detectedBaseUrl = fullUrl;
        try {
          const { setSetting } = require('./db/database');
          setSetting('APP_URL', fullUrl);
        } catch (_) {}
        console.log(`[Streamtape Base URL] Detected and saved public server URL: ${detectedBaseUrl}`);
      }
    }
  }
}

function getAppBaseUrl() {
  const { getSetting } = require('./db/database');
  const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '';
  let url = (
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    renderHost ||
    getSetting('APP_URL') ||
    detectedBaseUrl ||
    ''
  ).trim();

  if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    url = url.replace('http://', 'https://');
  }
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    url = url.replace(/:\d+$/, '');
  }
  return url.replace(/\/+$/, '');
}

/**
 * Make a GET request to Streamtape API
 */
function streamtapeApiGet(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const { login, key } = getStreamtapeCredentials();
    if (!login || !key) {
      return reject(new Error('Streamtape credentials (API Login or API Password) not configured in settings'));
    }

    const url = new URL(`${STREAMTAPE_API_BASE}${endpoint}`);
    url.searchParams.set('login', login);
    url.searchParams.set('key', key);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }

    const options = {
      hostname: url.hostname,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 200) {
            resolve(json.result);
          } else {
            reject(new Error(`Streamtape API [status ${json.status}]: ${json.msg || data}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse Streamtape response: ${data || res.statusCode}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Streamtape API request to ${endpoint} timed out after 15 seconds`));
    });

    req.on('error', (err) => {
      reject(new Error(`Streamtape network error: ${err.message}`));
    });

    req.end();
  });
}

/**
 * Create a folder on Streamtape
 */
async function createFolder(name, parentId = null) {
  const params = { name };
  if (parentId) params.pid = parentId;
  const result = await streamtapeApiGet('/file/createfolder', params);
  return result && result.id ? result.id : null;
}

/**
 * Delete a folder on Streamtape
 */
async function deleteFolder(folderId) {
  if (!folderId || !isStreamtapeConfigured()) return;
  try {
    await streamtapeApiGet('/file/deletefolder', { folder: folderId });
    console.log(`[Streamtape] Deleted folder ${folderId}`);
  } catch (err) {
    console.warn(`[Streamtape] Failed to delete folder ${folderId}:`, err.message);
  }
}

/**
 * Get or create a Streamtape folder for a batch
 */
async function getOrCreateBatchFolder(batchId, channelId) {
  if (!isStreamtapeConfigured()) return null;

  // 1. If video belongs to a specific batch
  if (batchId) {
    const batch = getOne('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (batch) {
      if (batch.streamtape_folder_id) {
        return batch.streamtape_folder_id;
      }

      // Create new folder for this batch
      try {
        const folderName = `${batch.name || 'Batch'} (ID ${batch.id})`;
        const folderId = await createFolder(folderName);
        if (folderId) {
          run('UPDATE batches SET streamtape_folder_id = ? WHERE id = ?', [folderId, batchId]);
          console.log(`[Streamtape] Created folder for Batch "${batch.name}": ${folderId}`);
          return folderId;
        }
      } catch (err) {
        console.warn(`[Streamtape] Failed to create folder for batch ${batchId}:`, err.message);
      }
    }
  }

  // 2. Fallback: Channel folder
  if (channelId) {
    const channel = getOne('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (channel) {
      try {
        const folderName = `${channel.title || channel.username || 'Channel'}`;
        const folderId = await createFolder(folderName);
        return folderId;
      } catch (_) {}
    }
  }

  return null;
}

/**
 * Get an upload URL from Streamtape (optionally targeted to a folder)
 */
async function getUploadUrl(folderId = null) {
  const params = {};
  if (folderId) params.folder = folderId;
  const result = await streamtapeApiGet('/file/ul', params);
  if (!result || !result.url) {
    throw new Error(`Did not receive upload URL from Streamtape: ${JSON.stringify(result)}`);
  }
  return result.url;
}

/**
 * Delete a file on Streamtape
 */
async function deleteStreamtapeVideo(fileId) {
  if (!fileId || !isStreamtapeConfigured()) return;
  try {
    console.log(`[Streamtape] Deleting video ${fileId}...`);
    await streamtapeApiGet('/file/delete', { file: fileId });
    console.log(`[Streamtape] Video ${fileId} deleted.`);
  } catch (err) {
    console.warn(`[Streamtape] Failed to delete video ${fileId}:`, err.message);
  }
}

const directLinkCache = new Map(); // fileId -> { url, expiresAt }

/**
 * Get direct stream/download link for playing Streamtape in native <video> player
 */
async function getDirectStreamLink(fileId) {
  if (!fileId || !isStreamtapeConfigured()) return null;

  const cached = directLinkCache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    const ticketRes = await streamtapeApiGet('/file/dlticket', { file: fileId });
    if (!ticketRes || !ticketRes.ticket) return null;

    const waitTime = typeof ticketRes.wait_time === 'number' ? ticketRes.wait_time : 0;
    if (waitTime > 0 && waitTime <= 5) {
      await new Promise(r => setTimeout(r, (waitTime + 0.5) * 1000));
    }

    const dlRes = await streamtapeApiGet('/file/dl', { file: fileId, ticket: ticketRes.ticket });
    if (dlRes && dlRes.url) {
      // Cache for 2.5 hours
      directLinkCache.set(fileId, {
        url: dlRes.url,
        expiresAt: Date.now() + 2.5 * 3600 * 1000,
      });
      return dlRes.url;
    }
  } catch (err) {
    console.warn(`[Streamtape] Could not resolve direct stream link for ${fileId}:`, err.message);
  }
  return null;
}

const activeUploadProgress = new Map(); // `${type}_${id}` -> percentage (0..100)

/**
 * Get real-time upload progress for an item
 */
function getUploadProgress(type, id) {
  return activeUploadProgress.has(`${type}_${id}`) ? activeUploadProgress.get(`${type}_${id}`) : null;
}

const uploadQueue = [];
let isWorkerRunning = false;

/**
 * Add or update an item in the priority queue
 */
function enqueueUpload(task) {
  const existingIdx = uploadQueue.findIndex(t => t.type === task.type && t.id === task.id);
  if (existingIdx !== -1) {
    // If incoming task has higher priority (smaller number), boost it
    if (task.priority < uploadQueue[existingIdx].priority) {
      uploadQueue[existingIdx].priority = task.priority;
      if (task.fileLocation) uploadQueue[existingIdx].fileLocation = task.fileLocation;
      if (task.client) uploadQueue[existingIdx].client = task.client;
    }
  } else {
    uploadQueue.push(task);
  }

  // Sort queue by priority ascending (1 first, then 2, then 3)
  uploadQueue.sort((a, b) => a.priority - b.priority);

  processQueue();
}

/**
 * Queue worker processing uploads one at a time
 */
async function processQueue() {
  if (isWorkerRunning || uploadQueue.length === 0) return;
  isWorkerRunning = true;

  try {
    while (uploadQueue.length > 0) {
      const task = uploadQueue.shift();
      try {
        await executeUploadTask(task);
      } catch (taskErr) {
        console.error(`[Streamtape Queue] Error processing ${task.type} #${task.id}:`, taskErr.message);
      }
    }
  } finally {
    isWorkerRunning = false;
  }
}

/**
 * Initiate Streamtape Remote Download
 */
async function triggerRemoteDownload(streamUrl, folderId, cleanFilename) {
  const params = {
    url: streamUrl,
    name: cleanFilename,
  };
  if (folderId) params.folder = folderId;

  console.log(`[Streamtape Remote DL] POST /remotedl/add: URL=${streamUrl}, folder=${folderId || 'root'}, name=${cleanFilename}`);
  const result = await streamtapeApiGet('/remotedl/add', params);
  if (!result || !result.id) {
    throw new Error(`Invalid response from /remotedl/add: ${JSON.stringify(result)}`);
  }
  return result.id;
}

/**
 * Poll Streamtape Remote Download status until completion
 */
async function monitorRemoteDownload(remoteDlId, type, id, title, totalSize) {
  const table = type === 'video' ? 'videos' : 'files';
  const startTime = Date.now();
  const maxTimeoutMs = 60 * 60 * 1000; // 60 minutes
  let lastReportedPct = 0;

  while (Date.now() - startTime < maxTimeoutMs) {
    await new Promise(r => setTimeout(r, 4000));

    try {
      const statusRes = await streamtapeApiGet('/remotedl/status', { id: remoteDlId });
      const item = (statusRes && statusRes[remoteDlId]) ? statusRes[remoteDlId] : statusRes;

      if (!item) continue;

      const bytesLoaded = Number(item.bytes_loaded) || 0;
      const bytesTotal = Number(item.bytes_total) || totalSize || 0;

      if (bytesTotal > 0) {
        const pct = Math.min(99, Math.floor((bytesLoaded / bytesTotal) * 100));
        activeUploadProgress.set(`${type}_${id}`, pct);
        if (pct - lastReportedPct >= 5 || pct >= 95) {
          lastReportedPct = pct;
          try {
            run(`UPDATE ${table} SET upload_percentage = ? WHERE id = ?`, [pct, id]);
          } catch (_) {}
          console.log(`[Streamtape Remote DL Progress] ${title || `${type} #${id}`}: ${pct}% (${(bytesLoaded / 1024 / 1024).toFixed(1)}MB / ${(bytesTotal / 1024 / 1024).toFixed(1)}MB)`);
        }
      }

      // Check if finished
      const isFinished = item.status === 'finished' || item.status === 'completed' || (typeof item.extid === 'string' && item.extid !== 'false' && item.extid.length > 0);
      if (isFinished) {
        const streamtapeId = (typeof item.extid === 'string' && item.extid !== 'false') ? item.extid : (typeof item.fileid === 'string' ? item.fileid : null);
        const streamtapeUrl = item.url || (streamtapeId ? `https://streamtape.com/v/${streamtapeId}` : null);

        if (streamtapeId) {
          activeUploadProgress.set(`${type}_${id}`, 100);
          run(`UPDATE ${table} SET streamtape_status = 'ready', streamtape_id = ?, streamtape_url = ?, upload_percentage = 100 WHERE id = ?`, [
            streamtapeId,
            streamtapeUrl,
            id,
          ]);

          setTimeout(() => {
            activeUploadProgress.delete(`${type}_${id}`);
          }, 10000);

          console.log(`[Streamtape Remote DL] Completed successfully: ${title || `${type} #${id}`} -> ID: ${streamtapeId}`);
          return { streamtapeId, streamtapeUrl };
        }
      }

      if (item.status === 'error') {
        const errMsg = item.last_error || item.msg || JSON.stringify(item);
        console.error(`[Streamtape Remote DL Error] Task #${remoteDlId} reported error:`, errMsg);
        throw new Error(`Streamtape remote download reported error: ${errMsg}`);
      }
    } catch (pollErr) {
      console.warn(`[Streamtape Remote DL] Polling status warning for #${id}:`, pollErr.message);
    }
  }

  throw new Error(`Remote download timed out after 60 minutes for task ${remoteDlId}`);
}

/**
 * Execute a single upload task to Streamtape
 */
async function executeUploadTask(task) {
  const { type, id, userId, fileLocation, title, batchId, channelId, client } = task;
  const table = type === 'video' ? 'videos' : 'files';

  // Check current status in DB
  const row = getOne(`SELECT streamtape_status, streamtape_id FROM ${table} WHERE id = ?`, [id]);
  if (!row || row.streamtape_status === 'ready') return;

  activeUploadProgress.set(`${type}_${id}`, 0);
  try {
    run(`UPDATE ${table} SET streamtape_status = 'uploading', upload_percentage = 0 WHERE id = ?`, [id]);
  } catch (_) {}

  // Ensure Telegram client is available
  let tgClient = client;
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    const activeUser = getOne("SELECT id FROM users WHERE telegram_session IS NOT NULL AND telegram_session != '' ORDER BY id ASC LIMIT 1");
    effectiveUserId = activeUser ? activeUser.id : 1;
  }
  if (!tgClient && effectiveUserId) {
    const { getClient } = require('./telegramClient');
    try {
      tgClient = await getClient(effectiveUserId);
    } catch (_) {}
  }
  if (!tgClient) {
    console.warn(`[Streamtape] Cannot upload ${type} #${id}: Telegram client unavailable.`);
    activeUploadProgress.delete(`${type}_${id}`);
    run(`UPDATE ${table} SET streamtape_status = 'none' WHERE id = ?`, [id]);
    return;
  }

  // Resolve media location with fresh file reference from Telegram
  const mediaRow = getOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  let mediaLoc = fileLocation;

  if (!mediaLoc && mediaRow) {
    try {
      const { getFreshMediaLocation } = require('./routes/streamRoutes');
      if (typeof getFreshMediaLocation === 'function') {
        mediaLoc = await getFreshMediaLocation(tgClient, mediaRow);
      }
    } catch (refreshErr) {
      console.warn(`[Streamtape] Could not refresh media location from Telegram for ${type} #${id}, attempting DB fallback:`, refreshErr.message);
    }
  }

  if (!mediaLoc && mediaRow && mediaRow.file_id && mediaRow.access_hash) {
    const { Api } = require('telegram');
    mediaLoc = {
      location: new Api.InputDocumentFileLocation({
        id: bigInt(mediaRow.file_id),
        accessHash: bigInt(mediaRow.access_hash),
        fileReference: Buffer.isBuffer(mediaRow.file_reference) ? mediaRow.file_reference : Buffer.from(mediaRow.file_reference || ''),
        thumbSize: '',
      }),
      dcId: mediaRow.dc_id || 0,
      size: mediaRow.size || mediaRow.file_size || 0,
      mimeType: mediaRow.mime_type || 'video/mp4',
    };
  }

  if (!mediaLoc) {
    console.warn(`[Streamtape] Cannot upload ${type} #${id}: missing file location.`);
    activeUploadProgress.delete(`${type}_${id}`);
    run(`UPDATE ${table} SET streamtape_status = 'failed' WHERE id = ?`, [id]);
    return;
  }

  try {
    // Step 1: Resolve batch folder on Streamtape
    let folderId = null;
    try {
      folderId = await getOrCreateBatchFolder(batchId, channelId);
    } catch (fErr) {
      console.warn(`[Streamtape] Folder creation warning for ${type} #${id}:`, fErr.message);
    }

    const cleanFilename = formatCleanFilename(title || (mediaRow && mediaRow.title), id);
    const totalSize = mediaLoc.size || (mediaRow && (mediaRow.size || mediaRow.file_size)) || 0;

    // ── METHOD A: Streamtape Remote Upload (Direct & 100% Reliable) ────────
    // Streamtape's own CDN downloads directly from our streaming URL (/api/stream/:id).
    // This is multi-threaded, resilient, and avoids all multipart connection timeouts!
    const baseUrl = getAppBaseUrl();
    if (baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
      const streamUrl = `${baseUrl}/api/stream/${id}?download=1`;
      try {
        console.log(`[Streamtape Remote DL] Requesting remote download for "${cleanFilename}" from ${streamUrl} into folder: ${folderId || 'root'}...`);
        const remoteDlId = await triggerRemoteDownload(streamUrl, folderId, cleanFilename);
        console.log(`[Streamtape Remote DL] Task #${remoteDlId} queued on Streamtape! Monitoring live progress...`);
        return await monitorRemoteDownload(remoteDlId, type, id, title, totalSize);
      } catch (remoteErr) {
        console.warn(`[Streamtape Remote DL] Remote upload failed (${remoteErr.message}), falling back to direct multipart streaming...`);
      }
    }

    // ── METHOD B: Direct Multipart Streaming Fallback ─────────────────────
    console.log(`[Streamtape Queue] Starting direct multipart stream: ${title || `${type} #${id}`} (Priority ${task.priority}, folder: ${folderId || 'root'}, size: ${(totalSize / 1024 / 1024).toFixed(1)}MB)...`);

    // Step 2: Get upload URL for this folder
    const uploadUrl = await getUploadUrl(folderId);

    async function* telegramChunkGenerator() {
      let bytesRead = 0;
      let lastPct = 0;

      for await (const chunk of tgClient.iterDownload({
        file: mediaLoc.location,
        offset: bigInt(0),
        requestSize: 1024 * 1024, // 1MB chunks
        ...(mediaLoc.dcId ? { dcId: mediaLoc.dcId } : {}),
      })) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesRead += buf.length;

        if (totalSize > 0) {
          const pct = Math.min(99, Math.floor((bytesRead / totalSize) * 100));
          activeUploadProgress.set(`${type}_${id}`, pct);
          if (pct - lastPct >= 5 || pct >= 95) {
            lastPct = pct;
            try {
              run(`UPDATE ${table} SET upload_percentage = ? WHERE id = ?`, [pct, id]);
            } catch (_) {}
            console.log(`[Streamtape Progress] ${title || `${type} #${id}`}: ${pct}%`);
          }
        }
        yield buf;
      }
    }

    const form = new FormData();
    const readable = Readable.from(telegramChunkGenerator());
    form.append('file1', readable, {
      filename: cleanFilename,
      contentType: mediaLoc.mimeType || 'video/mp4',
      ...(totalSize > 0 ? { knownLength: totalSize } : {}),
    });

    // CRITICAL FIX: Calculate Content-Length for multipart stream
    // Streamtape Nginx servers REJECT Transfer-Encoding: chunked without Content-Length
    let formLength = null;
    try {
      formLength = form.getLengthSync();
    } catch (lenErr) {
      console.warn('[Streamtape] Note: form.getLengthSync() warning:', lenErr.message);
    }

    const headers = {
      ...form.getHeaders(),
      ...(formLength ? { 'Content-Length': String(formLength) } : {}),
    };

    const uploadRes = await new Promise((resolve, reject) => {
      const parsedUrl = new URL(uploadUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const req = transport.request(parsedUrl, {
        method: 'POST',
        headers,
      }, (res) => {
        let resBody = '';
        res.on('data', (c) => resBody += c);
        res.on('end', () => {
          console.log(`[Streamtape Upload Response] HTTP ${res.statusCode}: ${resBody}`);
          try {
            const json = JSON.parse(resBody);
            if (json.status === 200 && json.result) {
              resolve(json.result);
            } else if (json.result && (json.result.id || json.result.url)) {
              resolve(json.result);
            } else if (json.id) {
              resolve(json);
            } else {
              reject(new Error(`Streamtape upload failed (${res.statusCode}): ${json.msg || resBody}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse Streamtape upload response (${res.statusCode}): ${resBody}`));
          }
        });
      });

      // 30 minute timeout for large lectures
      req.setTimeout(30 * 60 * 1000, () => {
        req.destroy(new Error('Streamtape upload request timed out after 30 minutes'));
      });

      req.on('error', (err) => {
        console.error('[Streamtape Upload Request Error]:', err.message);
        reject(err);
      });

      form.pipe(req);
    });

    const streamtapeId = uploadRes.id;
    const streamtapeUrl = uploadRes.url || `https://streamtape.com/v/${streamtapeId}`;

    activeUploadProgress.set(`${type}_${id}`, 100);
    run(`UPDATE ${table} SET streamtape_status = 'ready', streamtape_id = ?, streamtape_url = ?, upload_percentage = 100 WHERE id = ?`, [
      streamtapeId,
      streamtapeUrl,
      id,
    ]);

    setTimeout(() => {
      activeUploadProgress.delete(`${type}_${id}`);
    }, 10000);

    console.log(`[Streamtape Queue] Finished ${title || `${type} #${id}`} -> ID: ${streamtapeId}`);
  } catch (uploadErr) {
    console.error(`[Streamtape Upload Error] ${title || `${type} #${id}`}:`, uploadErr.message);
    activeUploadProgress.delete(`${type}_${id}`);
    try {
      run(`UPDATE ${table} SET streamtape_status = 'failed' WHERE id = ?`, [id]);
    } catch (_) {}
    throw uploadErr;
  }
}

let currentActiveBatchId = null;

/**
 * Trigger upload for actively watched video and dynamically organize next video & batch priorities
 */
async function triggerStreamtapeUpload(type, id, userId, fileLocation, title, client) {
  if (!isStreamtapeConfigured()) return;

  const table = type === 'video' ? 'videos' : 'files';
  const video = getOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!video) return;

  const activeBatchId = video.batch_id || null;

  // If user switched to another batch, demote all previously queued items from other batches
  if (activeBatchId && activeBatchId !== currentActiveBatchId) {
    console.log(`[Streamtape Queue] User switched to Batch #${activeBatchId}! Demoting previous batches to Priority 4...`);
    currentActiveBatchId = activeBatchId;

    for (const item of uploadQueue) {
      if (item.batchId !== activeBatchId) {
        item.priority = 4; // Lower priority for old batch
      }
    }
  }

  // 1. Enqueue the currently watched video with TOP PRIORITY (1)
  enqueueUpload({
    type,
    id,
    userId,
    priority: 1, // Top priority: currently watched video
    fileLocation,
    title: title || video.title || video.file_name,
    batchId: activeBatchId,
    channelId: video.channel_id,
    client,
  });

  // 2. If it belongs to a batch, find the NEXT upcoming video in sequence and queue with Priority 2
  if (activeBatchId) {
    try {
      // Find the immediate next un-uploaded video in this batch (by message_id > current)
      let nextVideo = getOne(
        `SELECT id, title, batch_id, channel_id, size FROM videos 
         WHERE batch_id = ? AND message_id > ? AND (streamtape_status = 'none' OR streamtape_status IS NULL)
         ORDER BY message_id ASC LIMIT 1`,
        [activeBatchId, video.message_id]
      );

      // Fallback if no higher message_id found
      if (!nextVideo) {
        nextVideo = getOne(
          `SELECT id, title, batch_id, channel_id, size FROM videos 
           WHERE batch_id = ? AND id != ? AND (streamtape_status = 'none' OR streamtape_status IS NULL)
           ORDER BY message_id ASC LIMIT 1`,
          [activeBatchId, id]
        );
      }

      if (nextVideo) {
        console.log(`[Streamtape Queue] Next video in active batch is #${nextVideo.id} ("${nextVideo.title}") -> Assigned Priority 2`);
        enqueueUpload({
          type: 'video',
          id: nextVideo.id,
          userId,
          priority: 2, // Second priority: immediate next video in batch
          fileLocation: null, // Will be resolved dynamically
          title: nextVideo.title,
          batchId: activeBatchId,
          channelId: nextVideo.channel_id,
          client,
        });
      }

      // 3. Queue remaining un-uploaded videos in this active batch with Priority 3
      const excludedIds = [id];
      if (nextVideo) excludedIds.push(nextVideo.id);
      const placeholders = excludedIds.map(() => '?').join(',');

      const remainingBatchVideos = getAll(
        `SELECT id, title, batch_id, channel_id, size FROM videos 
         WHERE batch_id = ? AND id NOT IN (${placeholders}) AND (streamtape_status = 'none' OR streamtape_status IS NULL)
         ORDER BY message_id ASC`,
        [activeBatchId, ...excludedIds]
      );

      for (const bv of remainingBatchVideos) {
        enqueueUpload({
          type: 'video',
          id: bv.id,
          userId,
          priority: 3, // Third priority: remaining active batch backlog
          fileLocation: null,
          title: bv.title,
          batchId: activeBatchId,
          channelId: bv.channel_id,
          client,
        });
      }

      // Re-sort queue so active batch Priority 1 & 2 execute first
      uploadQueue.sort((a, b) => a.priority - b.priority);

      if (remainingBatchVideos.length > 0) {
        console.log(`[Streamtape Queue] Enqueued ${remainingBatchVideos.length} remaining videos from Batch #${activeBatchId} with Priority 3`);
      }
    } catch (bErr) {
      console.warn('[Streamtape Queue] Error organizing batch priorities:', bErr.message);
    }
  }
}

/**
 * Link an existing Streamtape URL or ID directly to a video/file
 * This completely bypasses Render server bandwidth!
 */
function linkStreamtapeDirect(type, id, streamtapeUrlOrId) {
  const table = type === 'video' ? 'videos' : 'files';
  let cleanId = (streamtapeUrlOrId || '').trim();
  let cleanUrl = cleanId;

  // Match: https://streamtape.com/v/abcd123/title.mp4 or https://streamtape.com/e/abcd123
  const urlMatch = cleanId.match(/streamtape\.com\/(?:v|e)\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch) {
    cleanId = urlMatch[1];
    cleanUrl = `https://streamtape.com/v/${cleanId}`;
  } else if (!cleanUrl.startsWith('http')) {
    cleanUrl = `https://streamtape.com/v/${cleanId}`;
  }

  run(`UPDATE ${table} SET streamtape_id = ?, streamtape_url = ?, streamtape_status = 'ready', upload_percentage = 100 WHERE id = ?`, [
    cleanId,
    cleanUrl,
    id
  ]);

  return { id, streamtape_id: cleanId, streamtape_url: cleanUrl, streamtape_status: 'ready' };
}

module.exports = {
  isStreamtapeConfigured,
  getStreamtapeCredentials,
  streamtapeApiGet,
  createFolder,
  deleteFolder,
  getOrCreateBatchFolder,
  getUploadUrl,
  deleteStreamtapeVideo,
  getDirectStreamLink,
  triggerStreamtapeUpload,
  enqueueUpload,
  getUploadProgress,
  linkStreamtapeDirect,
  setDetectedBaseUrl,
  getAppBaseUrl,
  formatCleanFilename,
};
