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

function isStreamtapeConfigured() {
  const { login, key } = getStreamtapeCredentials();
  return login.length > 0 && key.length > 0;
}

/**
 * Make a GET request to Streamtape API
 */
function streamtapeApiGet(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const { login, key } = getStreamtapeCredentials();
    if (!login || !key) {
      return reject(new Error('Streamtape credentials (API / FTP login or FTP / API Password) not configured'));
    }

    const url = new URL(`${STREAMTAPE_API_BASE}${endpoint}`);
    url.searchParams.set('login', login);
    url.searchParams.set('key', key);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }

    https.get(url, (res) => {
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
          reject(new Error(`Failed to parse Streamtape response: ${data}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Streamtape network error: ${err.message}`));
    });
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
  if (!tgClient && userId) {
    const { getClient } = require('./telegramClient');
    try {
      tgClient = await getClient(userId);
    } catch (_) {}
  }
  if (!tgClient) {
    console.warn(`[Streamtape] Cannot upload ${type} #${id}: Telegram client unavailable.`);
    activeUploadProgress.delete(`${type}_${id}`);
    run(`UPDATE ${table} SET streamtape_status = 'none' WHERE id = ?`, [id]);
    return;
  }

  // Resolve media location if needed
  let mediaLoc = fileLocation;
  if (!mediaLoc) {
    const mediaRow = getOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (mediaRow && mediaRow.file_id && mediaRow.access_hash) {
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

    // Step 2: Get upload URL for this folder
    const uploadUrl = await getUploadUrl(folderId);

    // Step 3: Stream from Telegram into Streamtape multipart form
    const totalSize = mediaLoc.size || 0;
    console.log(`[Streamtape Queue] Starting upload: ${title || `${type} #${id}`} (Priority ${task.priority}, folder: ${folderId || 'root'}, size: ${(totalSize / 1024 / 1024).toFixed(1)}MB)...`);

    const form = new FormData();
    const cleanFilename = `${(title || 'video').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50)}.mp4`;

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

    const readable = Readable.from(telegramChunkGenerator());
    form.append('file1', readable, {
      filename: cleanFilename,
      contentType: mediaLoc.mimeType || 'video/mp4',
      ...(totalSize > 0 ? { knownLength: totalSize } : {}),
    });

    const uploadRes = await new Promise((resolve, reject) => {
      const parsedUrl = new URL(uploadUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const req = transport.request(parsedUrl, {
        method: 'POST',
        headers: form.getHeaders(),
      }, (res) => {
        let resBody = '';
        res.on('data', (c) => resBody += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(resBody);
            if (json.status === 200 && json.result) {
              resolve(json.result);
            } else {
              reject(new Error(`Streamtape upload failed: ${json.msg || resBody}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse Streamtape upload response: ${resBody}`));
          }
        });
      });

      req.on('error', reject);
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
};
