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
function streamtapeApiGet(endpoint, params = {}, requireAuth = true) {
  return new Promise((resolve, reject) => {
    const { login, key } = getStreamtapeCredentials();
    if (requireAuth && (!login || !key)) {
      return reject(new Error('Streamtape credentials (API Login or API Password) not configured in settings'));
    }

    const url = new URL(`${STREAMTAPE_API_BASE}${endpoint}`);
    if (login) url.searchParams.set('login', login);
    if (key) url.searchParams.set('key', key);
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
 * Move a Streamtape file into a folder using /file/move
 */
async function moveFileToFolder(fileId, folderId) {
  if (!fileId || !folderId || !isStreamtapeConfigured()) return false;
  try {
    const res = await streamtapeApiGet('/file/move', { file: fileId, folder: folderId });
    return res && res.result === true;
  } catch (err) {
    console.warn(`[Streamtape Move] Note on moving file ${fileId} to folder ${folderId}:`, err.message);
    return false;
  }
}

/**
 * Move any already-uploaded videos belonging to a batch or channel into their target folder
 */
async function organizeExistingUploads(batchId = null, channelId = null) {
  if (!isStreamtapeConfigured()) return 0;
  const folderId = await getOrCreateBatchFolder(batchId, channelId);
  if (!folderId) return 0;

  let movedCount = 0;
  try {
    const videos = getAll(
      `SELECT id, title, streamtape_id FROM videos 
       WHERE streamtape_id IS NOT NULL AND streamtape_status = 'ready'
       AND (${batchId ? 'batch_id = ?' : 'channel_id = ?'})`,
      [batchId || channelId]
    );

    for (const v of videos) {
      if (v.streamtape_id) {
        const moved = await moveFileToFolder(v.streamtape_id, folderId);
        if (moved) movedCount++;
      }
    }
    if (movedCount > 0) {
      console.log(`[Streamtape Organize] Moved ${movedCount} existing uploaded videos into target folder ${folderId}`);
    }
  } catch (err) {
    console.warn('[Streamtape Organize] Error organizing existing files:', err.message);
  }
  return movedCount;
}

/**
 * Daily auto-upload limit tracking (Limits automated background uploads to 5/day)
 * Manual clicks ("Upload to Streamtape" button) bypass this limit!
 */
function getDailyAutoUploadCount() {
  const { getSetting, setSetting } = require('./db/database');
  const today = new Date().toISOString().slice(0, 10);
  const savedDate = getSetting('STREAMTAPE_AUTO_UPLOAD_DATE', '');
  if (savedDate !== today) {
    setSetting('STREAMTAPE_AUTO_UPLOAD_DATE', today);
    setSetting('STREAMTAPE_AUTO_UPLOAD_COUNT', '0');
    return 0;
  }
  return parseInt(getSetting('STREAMTAPE_AUTO_UPLOAD_COUNT', '0'), 10) || 0;
}

function incrementDailyAutoUploadCount() {
  const { setSetting } = require('./db/database');
  const current = getDailyAutoUploadCount();
  setSetting('STREAMTAPE_AUTO_UPLOAD_COUNT', String(current + 1));
}

function getDailyAutoUploadLimit() {
  const { getSetting } = require('./db/database');
  return parseInt(getSetting('STREAMTAPE_DAILY_LIMIT', '5'), 10) || 5;
}

function isAutoUploadPaused() {
  const { getSetting } = require('./db/database');
  return getSetting('STREAMTAPE_AUTO_UPLOAD_PAUSED', 'false') === 'true';
}

function setAutoUploadPaused(paused) {
  const { setSetting } = require('./db/database');
  setSetting('STREAMTAPE_AUTO_UPLOAD_PAUSED', paused ? 'true' : 'false');
}

function canAutoUpload() {
  if (isAutoUploadPaused()) return false;
  return getDailyAutoUploadCount() < getDailyAutoUploadLimit();
}

/**
 * Find existing folder ID on Streamtape by name, or create a new one
 * This prevents duplicate folder errors and ensures files land in the right folder!
 */
async function findOrCreateStreamtapeFolder(folderName, parentId = null) {
  if (!folderName || !isStreamtapeConfigured()) return null;
  const cleanName = folderName
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);

  if (!cleanName) return null;

  try {
    // 1. Check if folder already exists in Streamtape library
    const listRes = await streamtapeApiGet('/file/listfolder', parentId ? { folder: parentId } : {});
    if (listRes && Array.isArray(listRes.folders)) {
      const existing = listRes.folders.find(f => (f.name || '').trim().toLowerCase() === cleanName.toLowerCase());
      if (existing && existing.id) {
        console.log(`[Streamtape] Found existing folder "${cleanName}" -> ID: ${existing.id}`);
        return existing.id;
      }
    }

    // 2. If not found, create new folder
    const createdId = await createFolder(cleanName, parentId);
    if (createdId) {
      console.log(`[Streamtape] Created new folder "${cleanName}" -> ID: ${createdId}`);
      return createdId;
    }
  } catch (err) {
    console.warn(`[Streamtape] Warning in findOrCreateStreamtapeFolder("${cleanName}"):`, err.message);
  }
  return null;
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

      // Check existing folder on Streamtape or create
      const folderName = `${batch.name || 'Batch'} (ID ${batch.id})`;
      const folderId = await findOrCreateStreamtapeFolder(folderName);
      if (folderId) {
        try {
          run('UPDATE batches SET streamtape_folder_id = ? WHERE id = ?', [folderId, batchId]);
        } catch (_) {}
        return folderId;
      }
    }
  }

  // 2. Fallback: Channel folder
  if (channelId) {
    const channel = getOne('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (channel) {
      if (channel.streamtape_folder_id) {
        return channel.streamtape_folder_id;
      }

      // Check existing folder on Streamtape or create
      const folderName = `${channel.title || channel.username || 'Channel'}`;
      const folderId = await findOrCreateStreamtapeFolder(folderName);
      if (folderId) {
        try {
          run('UPDATE channels SET streamtape_folder_id = ? WHERE id = ?', [folderId, channelId]);
        } catch (_) {}
        return folderId;
      }
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
const warmingLinks = new Set(); // fileId currently in progress

/**
 * Prewarm direct stream link in background (fetches dlticket, waits wait_time, fetches dl, and caches for 3h)
 */
async function prewarmDirectStreamLink(fileId) {
  if (!fileId || warmingLinks.has(fileId)) return null;
  const cached = directLinkCache.get(fileId);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.url;

  warmingLinks.add(fileId);
  try {
    const ticketRes = await streamtapeApiGet('/file/dlticket', { file: fileId }, false);
    if (!ticketRes || !ticketRes.ticket) return null;

    const waitTime = typeof ticketRes.wait_time === 'number' ? ticketRes.wait_time : 0;
    if (waitTime > 0 && waitTime <= 30) {
      await new Promise(r => setTimeout(r, (waitTime + 0.5) * 1000));
    }

    const dlRes = await streamtapeApiGet('/file/dl', { file: fileId, ticket: ticketRes.ticket }, false);
    if (dlRes && dlRes.url) {
      console.log(`[Streamtape CDN] Direct video link ready for ${fileId}`);
      directLinkCache.set(fileId, {
        url: dlRes.url,
        expiresAt: Date.now() + 3 * 3600 * 1000,
      });
      return dlRes.url;
    }
  } catch (err) {
    console.warn(`[Streamtape Prewarm] Error for ${fileId}:`, err.message);
  } finally {
    warmingLinks.delete(fileId);
  }
  return null;
}

/**
 * Get direct stream/download link for playing Streamtape in native <video> player
 */
async function getDirectStreamLink(fileId) {
  if (!fileId) return null;

  const cached = directLinkCache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Trigger background prewarming
  const prewarmPromise = prewarmDirectStreamLink(fileId);

  // If fast enough (e.g. waitTime <= 3s or already resolved), wait briefly
  const quickResult = await Promise.race([
    prewarmPromise,
    new Promise(r => setTimeout(() => r(null), 3500))
  ]);

  return quickResult || null;
}

const activeUploadProgress = new Map(); // `${type}_${id}` -> percentage (0..100)

/**
 * Get real-time upload progress for an item
 */
function getUploadProgress(type, id) {
  return activeUploadProgress.has(`${type}_${id}`) ? activeUploadProgress.get(`${type}_${id}`) : null;
}

// Clean up any stale 'uploading' tasks left behind from previous server crashes or deploys
try {
  run("UPDATE videos SET streamtape_status = 'none' WHERE streamtape_status = 'uploading'");
  run("UPDATE files SET streamtape_status = 'none' WHERE streamtape_status = 'uploading'");
} catch (_) {}

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
 * Mark a Streamtape upload as ready in the database and clear progress
 */
function markUploadReady(table, type, id, streamtapeId, streamtapeUrl, title, folderId = null) {
  activeUploadProgress.set(`${type}_${id}`, 100);
  try {
    run(`UPDATE ${table} SET streamtape_status = 'ready', streamtape_id = ?, streamtape_url = ?, upload_percentage = 100, streamtape_last_accessed_at = datetime('now') WHERE id = ?`, [
      streamtapeId,
      streamtapeUrl,
      id,
    ]);
  } catch (_) {}

  // Guarantee the file is placed inside the correct batch/channel folder
  if (folderId && streamtapeId) {
    moveFileToFolder(streamtapeId, folderId).catch(() => {});
  }

  setTimeout(() => {
    activeUploadProgress.delete(`${type}_${id}`);
  }, 10000);

  console.log(`[Streamtape Remote DL] Completed and verified ready: ${title || `${type} #${id}`} -> ID: ${streamtapeId} (${streamtapeUrl}, folder: ${folderId || 'root'})`);
  return { streamtapeId, streamtapeUrl };
}

/**
 * Search Streamtape account file library for a file by name
 * Searches target folder first, then root folder
 */
async function findStreamtapeFile(cleanFilename, folderId = null) {
  if (!cleanFilename) return null;
  const targetName = cleanFilename.trim().toLowerCase();
  const baseName = targetName.replace(/\.mp4$/i, '').slice(0, 30);

  const foldersToSearch = [];
  if (folderId) foldersToSearch.push(folderId);
  foldersToSearch.push(null); // root folder

  for (const fId of foldersToSearch) {
    try {
      const params = {};
      if (fId) params.folder = fId;
      const res = await streamtapeApiGet('/file/listfolder', params);
      if (res && Array.isArray(res.files)) {
        for (const file of res.files) {
          const fn = (file.name || '').trim().toLowerCase();
          if (fn === targetName || (baseName.length >= 8 && fn.includes(baseName))) {
            const streamtapeId = file.linkid || file.id;
            const streamtapeUrl = file.link || `https://streamtape.com/v/${streamtapeId}`;
            return { streamtapeId, streamtapeUrl };
          }
        }
      }
    } catch (err) {
      console.warn(`[Streamtape] Error listing folder ${fId || 'root'}:`, err.message);
    }
  }
  return null;
}

/**
 * Poll Streamtape Remote Download status until completion
 */
async function monitorRemoteDownload(remoteDlId, type, id, title, totalSize, cleanFilename = '', folderId = null) {
  const table = type === 'video' ? 'videos' : 'files';
  const startTime = Date.now();
  const maxTimeoutMs = 60 * 60 * 1000; // 60 minutes
  let lastReportedPct = 0;
  let consecutiveMissingCount = 0;

  while (Date.now() - startTime < maxTimeoutMs) {
    await new Promise(r => setTimeout(r, 2500));

    try {
      const statusRes = await streamtapeApiGet('/remotedl/status', { id: remoteDlId });
      let item = null;
      if (statusRes) {
        if (statusRes[remoteDlId]) {
          item = statusRes[remoteDlId];
        } else if (statusRes[String(remoteDlId)]) {
          item = statusRes[String(remoteDlId)];
        } else if (statusRes.id === remoteDlId || statusRes.id === String(remoteDlId)) {
          item = statusRes;
        } else if (typeof statusRes === 'object') {
          const vals = Object.values(statusRes);
          item = vals.find(v => v && (v.id === remoteDlId || v.id === String(remoteDlId))) || (vals.length > 0 && vals[0] && typeof vals[0] === 'object' ? vals[0] : null);
        }
      }

      if (item) {
        consecutiveMissingCount = 0;
        const bytesLoaded = Number(item.bytes_loaded) || 0;
        const rawTotal = Number(item.bytes_total) || 0;
        const bytesTotal = rawTotal > 0 ? rawTotal : (totalSize > 0 ? totalSize : 1);

        if (item.status === 'new') {
          activeUploadProgress.set(`${type}_${id}`, {
            pct: 1,
            bytesLoaded: 0,
            bytesTotal: bytesTotal,
            status: 'queued',
          });
          try {
            run(`UPDATE ${table} SET streamtape_status = 'uploading', upload_percentage = 1 WHERE id = ?`, [id]);
          } catch (_) {}
        } else if (bytesTotal > 0) {
          const pct = Math.min(99, Math.max(1, Math.floor((bytesLoaded / bytesTotal) * 100)));
          activeUploadProgress.set(`${type}_${id}`, {
            pct,
            bytesLoaded,
            bytesTotal,
            status: item.status || 'downloading',
          });
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            try {
              run(`UPDATE ${table} SET upload_percentage = ? WHERE id = ?`, [pct, id]);
            } catch (_) {}
            console.log(`[Streamtape Remote DL Progress] ${title || `${type} #${id}`}: ${pct}% (${(bytesLoaded / 1024 / 1024).toFixed(1)}MB / ${(bytesTotal / 1024 / 1024).toFixed(1)}MB, status: ${item.status})`);
          }
        }

        // Extract Streamtape ID from all possible fields in item
        let streamtapeId = null;
        if (typeof item.extid === 'string' && item.extid !== 'false' && item.extid.length > 2) {
          streamtapeId = item.extid;
        } else if (typeof item.fileid === 'string' && item.fileid !== 'false' && item.fileid.length > 2) {
          streamtapeId = item.fileid;
        } else if (typeof item.url === 'string' && item.url !== 'false') {
          const match = item.url.match(/streamtape\.[a-z]+\/[ve]\/([a-zA-Z0-9_-]+)/i);
          if (match) streamtapeId = match[1];
        }

        const isFinished = item.status === 'finished' || 
                           item.status === 'completed' || 
                           item.status === 'downloaded' || 
                           item.status === 'ready' || 
                           item.status === 'success' ||
                           (bytesLoaded >= bytesTotal && bytesTotal > 0 && streamtapeId);

        if (streamtapeId && isFinished) {
          const streamtapeUrl = (typeof item.url === 'string' && item.url.includes('streamtape'))
            ? item.url
            : `https://streamtape.com/v/${streamtapeId}`;

          return markUploadReady(table, type, id, streamtapeId, streamtapeUrl, title, folderId);
        }

        // If bytes reached 100% or finished status but ID not returned directly in item,
        // search Streamtape library directly by filename
        if (isFinished || (bytesLoaded >= bytesTotal && bytesTotal > 0)) {
          const found = await findStreamtapeFile(cleanFilename, folderId);
          if (found) {
            return markUploadReady(table, type, id, found.streamtapeId, found.streamtapeUrl, title, folderId);
          }
        }

        if (item.status === 'error') {
          const errMsg = item.last_error || item.msg || JSON.stringify(item);
          console.error(`[Streamtape Remote DL Error] Task #${remoteDlId} reported error:`, errMsg);
          throw new Error(`Streamtape remote download reported error: ${errMsg}`);
        }
      } else {
        // Task is no longer in /remotedl/status (Streamtape purges finished tasks from queue)
        consecutiveMissingCount++;
        console.log(`[Streamtape Remote DL] Task #${remoteDlId} not in active queue (poll ${consecutiveMissingCount}/5). Checking account library...`);

        const found = await findStreamtapeFile(cleanFilename, folderId);
        if (found) {
          return markUploadReady(table, type, id, found.streamtapeId, found.streamtapeUrl, title, folderId);
        }

        if (consecutiveMissingCount >= 6) {
          throw new Error(`Task #${remoteDlId} completed or removed by Streamtape, but file could not be indexed.`);
        }
      }
    } catch (pollErr) {
      if (pollErr.message.includes('Streamtape remote download reported error') || pollErr.message.includes('removed by Streamtape')) {
        throw pollErr;
      }
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

  const mediaRow = getOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!mediaRow) return;

  activeUploadProgress.set(`${type}_${id}`, {
    pct: 1,
    bytesLoaded: 0,
    bytesTotal: mediaRow.size || mediaRow.file_size || 0,
    status: 'queued',
  });
  try {
    run(`UPDATE ${table} SET streamtape_status = 'uploading', upload_percentage = 1 WHERE id = ?`, [id]);
  } catch (_) {}

  const cleanFilename = formatCleanFilename(title || mediaRow.title, id);
  const totalSize = mediaRow.size || mediaRow.file_size || 0;

  // Step 1: Resolve batch folder on Streamtape
  let folderId = null;
  try {
    folderId = await getOrCreateBatchFolder(batchId, channelId);
  } catch (fErr) {
    console.warn(`[Streamtape] Folder creation warning for ${type} #${id}:`, fErr.message);
  }

  // ── DUPLICATE DETECTION: Check if file already exists on Streamtape ───────
  try {
    const existingFile = await findStreamtapeFile(cleanFilename, folderId);
    if (existingFile && existingFile.streamtapeId) {
      console.log(`[Streamtape Duplicate Check] Found existing file on cloud: "${cleanFilename}" -> ID: ${existingFile.streamtapeId}. Skipping upload and marking ready!`);
      return markUploadReady(table, type, id, existingFile.streamtapeId, existingFile.streamtapeUrl, title, folderId);
    }
  } catch (checkErr) {
    console.warn(`[Streamtape Duplicate Check] Warning for ${type} #${id}:`, checkErr.message);
  }

  // ── METHOD A: Streamtape Remote Upload (Direct & 100% Reliable) ────────
  // Streamtape's own CDN downloads directly from our streaming URL (/api/stream/:id).
  // This is multi-threaded, resilient, and avoids all multipart connection timeouts!
  const baseUrl = getAppBaseUrl();
  if (baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
    const streamUrl = `${baseUrl}/api/stream/${id}?download=1`;
    try {
      console.log(`[Streamtape Remote DL] Requesting remote download for "${cleanFilename}" from ${streamUrl} into folder: ${folderId || 'root'}...`);
      const remoteDlId = await triggerRemoteDownload(streamUrl, folderId, cleanFilename);
      if (!task.isManual) {
        incrementDailyAutoUploadCount();
      }
      console.log(`[Streamtape Remote DL] Task #${remoteDlId} queued on Streamtape! (Auto uploads today: ${getDailyAutoUploadCount()}/${getDailyAutoUploadLimit()})`);
      return await monitorRemoteDownload(remoteDlId, type, id, title, totalSize, cleanFilename, folderId);
    } catch (remoteErr) {
      console.warn(`[Streamtape Remote DL] Remote upload failed (${remoteErr.message}), checking direct streaming fallback...`);
    }
  } else {
    console.warn(`[Streamtape Remote DL] Cannot use remote download: baseUrl is "${baseUrl}" (not a public cloud domain). Please check APP_URL in settings.`);
  }

  // ── METHOD B: Direct Multipart Streaming Fallback (Requires local tgClient) ──
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
    const activeUser = getOne("SELECT id FROM users WHERE telegram_session IS NOT NULL AND telegram_session != '' ORDER BY id ASC LIMIT 1");
    if (activeUser && activeUser.id !== effectiveUserId) {
      try {
        const { getClient } = require('./telegramClient');
        tgClient = await getClient(activeUser.id);
      } catch (_) {}
    }
  }
  if (!tgClient) {
    console.warn(`[Streamtape] Cannot upload ${type} #${id}: Telegram client unavailable.`);
    activeUploadProgress.delete(`${type}_${id}`);
    run(`UPDATE ${table} SET streamtape_status = 'failed' WHERE id = ?`, [id]);
    return;
  }

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
/**
 * Smart Queue Trigger:
 * 1. Priority 1: Currently watched video (User is on this video)
 * 2. Priority 2: Immediate NEXT upcoming video in sequence (lookahead)
 * 3. Priority 3: Immediate PREVIOUS un-uploaded videos in sequence (lookback: missed or previously failed)
 * 4. Priority 4: Remaining future videos in the sequence
 * 5. Priority 5: Backlog from other channels/batches
 */
async function triggerStreamtapeUpload(type, id, userId, fileLocation = null, title = null, client = null, isManual = false) {
  if (!isStreamtapeConfigured()) return;

  const table = type === 'video' ? 'videos' : 'files';
  const video = getOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!video) return;

  // If automated trigger (not clicked by user button) and daily auto-upload limit reached:
  if (!isManual && !canAutoUpload()) {
    console.log(`[Streamtape Queue] Daily auto-upload limit reached (${getDailyAutoUploadCount()}/${getDailyAutoUploadLimit()}). Auto-queue paused. User can click "Upload to Streamtape" to upload manually.`);
    return;
  }

  const activeBatchId = video.batch_id || null;
  const activeChannelId = video.channel_id || null;
  const currentScopeId = activeBatchId ? `batch_${activeBatchId}` : `channel_${activeChannelId}`;

  // If user switched to another batch/channel, demote older queued tasks to Priority 5
  if (currentScopeId !== currentActiveBatchId) {
    console.log(`[Streamtape Queue] Active context switched to ${currentScopeId}! Demoting background tasks to Priority 5...`);
    currentActiveBatchId = currentScopeId;

    for (const item of uploadQueue) {
      const itemScope = item.batchId ? `batch_${item.batchId}` : `channel_${item.channelId}`;
      if (itemScope !== currentScopeId) {
        item.priority = 5;
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
    channelId: activeChannelId,
    client,
    isManual,
  });

  // Only auto-queue subsequent/previous videos if daily limit has remaining allowance
  if (!canAutoUpload()) {
    console.log(`[Streamtape Queue] Remaining daily auto-upload limit filled. Additional sequence items will not be queued automatically.`);
    return;
  }

  // Filter for un-uploaded items (includes failed, none, or NULL, but excludes already ready items)
  const unuploadedFilter = "(streamtape_status != 'ready' OR streamtape_status IS NULL)";
  const scopeClause = activeBatchId ? 'batch_id = ?' : 'channel_id = ?';
  const scopeId = activeBatchId || activeChannelId;

  if (scopeId) {
    try {
      // 2. Priority 2: Find immediate NEXT upcoming video in sequence (lookahead)
      let nextVideo = getOne(
        `SELECT id, title, batch_id, channel_id, message_id, size FROM videos 
         WHERE ${scopeClause} AND message_id > ? AND ${unuploadedFilter} AND id != ?
         ORDER BY message_id ASC LIMIT 1`,
        [scopeId, video.message_id || 0, id]
      );

      if (nextVideo) {
        console.log(`[Streamtape Queue] Next video in sequence is #${nextVideo.id} ("${nextVideo.title}") -> Assigned Priority 2`);
        enqueueUpload({
          type: 'video',
          id: nextVideo.id,
          userId,
          priority: 2, // Second priority: immediate next video
          fileLocation: null,
          title: nextVideo.title,
          batchId: nextVideo.batch_id,
          channelId: nextVideo.channel_id,
          client,
        });
      }

      // 3. Priority 3: Look BACK at PREVIOUS un-uploaded videos in sequence (e.g. earlier failed or skipped videos)
      // Ordered by message_id DESC (most recent previous first: e.g. Video 3, then Video 2, then Video 1)
      const prevVideos = getAll(
        `SELECT id, title, batch_id, channel_id, message_id, size FROM videos 
         WHERE ${scopeClause} AND message_id < ? AND ${unuploadedFilter} AND id != ?
         ORDER BY message_id DESC LIMIT 10`,
        [scopeId, video.message_id || 0, id]
      );

      for (const pv of prevVideos) {
        enqueueUpload({
          type: 'video',
          id: pv.id,
          userId,
          priority: 3, // Third priority: lookback to upload missed earlier videos
          fileLocation: null,
          title: pv.title,
          batchId: pv.batch_id,
          channelId: pv.channel_id,
          client,
        });
      }

      if (prevVideos.length > 0) {
        console.log(`[Streamtape Queue] Lookback queued ${prevVideos.length} earlier un-uploaded videos with Priority 3`);
      }

      // 4. Priority 4: Remaining future videos in sequence
      const excludedIds = [id];
      if (nextVideo) excludedIds.push(nextVideo.id);
      for (const pv of prevVideos) excludedIds.push(pv.id);
      const placeholders = excludedIds.map(() => '?').join(',');

      const remainingFutureVideos = getAll(
        `SELECT id, title, batch_id, channel_id, message_id, size FROM videos 
         WHERE ${scopeClause} AND message_id > ? AND id NOT IN (${placeholders}) AND ${unuploadedFilter}
         ORDER BY message_id ASC LIMIT 25`,
        [scopeId, video.message_id || 0, ...excludedIds]
      );

      for (const fv of remainingFutureVideos) {
        enqueueUpload({
          type: 'video',
          id: fv.id,
          userId,
          priority: 4, // Fourth priority: rest of sequence
          fileLocation: null,
          title: fv.title,
          batchId: fv.batch_id,
          channelId: fv.channel_id,
          client,
        });
      }

      // Re-sort queue so active Priority 1, 2, 3 execute in exact optimal order
      uploadQueue.sort((a, b) => a.priority - b.priority);

      if (remainingFutureVideos.length > 0) {
        console.log(`[Streamtape Queue] Enqueued ${remainingFutureVideos.length} future videos with Priority 4`);
      }
    } catch (bErr) {
      console.warn('[Streamtape Queue] Error organizing sequence priorities:', bErr.message);
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

  run(`UPDATE ${table} SET streamtape_id = ?, streamtape_url = ?, streamtape_status = 'ready', upload_percentage = 100, streamtape_last_accessed_at = datetime('now') WHERE id = ?`, [
    cleanId,
    cleanUrl,
    id
  ]);

  return { id, streamtape_id: cleanId, streamtape_url: cleanUrl, streamtape_status: 'ready' };
}

/**
 * Ping Streamtape embed page to register access and reset the 60-day inactivity deletion countdown
 */
async function pingStreamtapeVideo(streamtapeId) {
  if (!streamtapeId) return false;
  return new Promise((resolve) => {
    const https = require('https');
    const url = `https://streamtape.com/e/${streamtapeId}`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * Anti-Inactivity Keep-Alive Worker (Guarantees videos never expire)
 * Streamtape prunes files that have zero views/access for 60 days.
 * This runner checks every 25 days, sends a ping to reset the timer to 0,
 * and auto-heals any purged videos by queueing them for re-upload from Telegram!
 */
async function keepAliveStreamtapeUploads() {
  if (!isStreamtapeConfigured()) return { pinged: 0, healed: 0 };

  const cutoffClause = "datetime('now', '-25 days')";
  const videosToKeepAlive = getAll(
    `SELECT id, title, streamtape_id FROM videos 
     WHERE streamtape_status = 'ready' AND streamtape_id IS NOT NULL 
     AND (streamtape_last_accessed_at IS NULL OR streamtape_last_accessed_at < ${cutoffClause})
     LIMIT 30`
  );

  let pinged = 0;
  let healed = 0;

  for (const v of videosToKeepAlive) {
    try {
      // Check file status on Streamtape
      const info = await streamtapeApiGet('/file/info', { file: v.streamtape_id }).catch(() => null);
      if (!info || info.status === 404 || (info[v.streamtape_id] && info[v.streamtape_id].status === 404)) {
        // Streamtape deleted this file -> Auto-heal by clearing ID so it seamlessly re-uploads
        run("UPDATE videos SET streamtape_status = 'none', streamtape_id = NULL, upload_percentage = 0 WHERE id = ?", [v.id]);
        healed++;
        console.log(`[Streamtape Keep-Alive] File #${v.streamtape_id} was removed from cloud. Reset video #${v.id} for auto-healing re-upload.`);
        continue;
      }

      const success = await pingStreamtapeVideo(v.streamtape_id);
      if (success) {
        run("UPDATE videos SET streamtape_last_accessed_at = datetime('now') WHERE id = ?", [v.id]);
        pinged++;
        console.log(`[Streamtape Keep-Alive] Pinged video #${v.id} ("${v.title}") -> 60-day inactivity timer reset to 0!`);
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.warn(`[Streamtape Keep-Alive] Warning pinging video #${v.id}:`, err.message);
    }
  }

  return { pinged, healed };
}

// Automatically run keep-alive once every 24 hours in background
setInterval(() => {
  try {
    keepAliveStreamtapeUploads().catch(() => {});
  } catch (_) {}
}, 24 * 60 * 60 * 1000);

// Run a check 30 seconds after server startup
setTimeout(() => {
  try {
    keepAliveStreamtapeUploads().catch(() => {});
  } catch (_) {}
}, 30000);

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
  prewarmDirectStreamLink,
  triggerStreamtapeUpload,
  enqueueUpload,
  getUploadProgress,
  linkStreamtapeDirect,
  setDetectedBaseUrl,
  getAppBaseUrl,
  formatCleanFilename,
  getDailyAutoUploadCount,
  getDailyAutoUploadLimit,
  canAutoUpload,
  isAutoUploadPaused,
  setAutoUploadPaused,
  moveFileToFolder,
  organizeExistingUploads,
  pingStreamtapeVideo,
  keepAliveStreamtapeUploads,
};
