/**
 * routes/videoRoutes.js
 * 
 * GET /api/channel/:username/videos — List all videos for a channel
 * GET /api/video/:id                — Get a single video's metadata
 */

const express = require('express');
const { getAll, getOne } = require('../db/database');
const { getUploadProgress } = require('../streamtapeUpload');

const router = express.Router();

// ─── GET /api/channel/:username/videos ────────────────────────────────────
router.get('/channel/:username/videos', (req, res) => {
  const username = req.params.username.replace(/^@/, '');

  const channel = getOne('SELECT id FROM channels WHERE username = ?', [username]);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found. Scan it first.' });
  }

  const videos = getAll(
    `SELECT
       v.*,
       COALESCE(p.watched_percentage, 0) AS watched_percentage,
       COALESCE(p.last_timestamp, 0)     AS last_timestamp,
       COALESCE(p.completed, 0)          AS completed,
       COALESCE(p.dismissed, 0)          AS dismissed,
       p.updated_at                      AS progress_updated_at
     FROM videos v
     LEFT JOIN progress p ON p.video_id = v.id AND p.user_id = ?
     WHERE v.channel_id = ?
     GROUP BY v.id
     ORDER BY v.created_at ASC`,
    [req.user.id, channel.id]
  );

  const result = videos.map(v => {
    const liveProgress = getUploadProgress('video', v.id);
    return {
      ...v,
      upload_percentage: liveProgress !== null ? liveProgress : (v.upload_percentage || (v.streamtape_status === 'ready' ? 100 : 0)),
    };
  });

  res.json(result);
});

// ─── GET /api/video/:id/upload-status ──────────────────────────────────────
router.get('/video/:id/upload-status', (req, res) => {
  const videoId = parseInt(req.params.id, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const v = getOne('SELECT id, streamtape_status, streamtape_id, upload_percentage FROM videos WHERE id = ?', [videoId]);
  if (!v) return res.status(404).json({ error: 'Video not found' });

  const liveProgress = getUploadProgress('video', videoId);
  const uploadPct = liveProgress !== null 
    ? liveProgress 
    : (v.upload_percentage || (v.streamtape_status === 'ready' ? 100 : 0));

  res.json({
    id: v.id,
    streamtape_status: v.streamtape_status,
    streamtape_id: v.streamtape_id,
    upload_percentage: uploadPct,
  });
});

// ─── GET /api/streamtape/config (Check status) ─────────────────────────────
router.get('/streamtape/config', (req, res) => {
  const { getStreamtapeCredentials, isStreamtapeConfigured, getAppBaseUrl, getDailyAutoUploadCount, getDailyAutoUploadLimit } = require('../streamtapeUpload');
  const creds = getStreamtapeCredentials();
  res.json({
    configured: isStreamtapeConfigured(),
    login: creds.login ? (creds.login.length > 4 ? creds.login.slice(0, 4) + '***' : creds.login) : '',
    hasKey: !!creds.key,
    appUrl: typeof getAppBaseUrl === 'function' ? getAppBaseUrl() : '',
    daily_uploads: {
      count: typeof getDailyAutoUploadCount === 'function' ? getDailyAutoUploadCount() : 0,
      limit: typeof getDailyAutoUploadLimit === 'function' ? getDailyAutoUploadLimit() : 5,
    },
  });
});

// ─── POST /api/streamtape/config (Set credentials via UI) ─────────────────
router.post('/streamtape/config', (req, res) => {
  const { login, key, appUrl, dailyLimit } = req.body;
  const { setSetting } = require('../db/database');
  if (login !== undefined && String(login).trim().length > 0) {
    setSetting('STREAMTAPE_LOGIN', String(login).trim());
  }
  if (key !== undefined && String(key).trim().length > 0) {
    setSetting('STREAMTAPE_KEY', String(key).trim());
  }
  if (appUrl !== undefined && String(appUrl).trim().length > 0) {
    setSetting('APP_URL', String(appUrl).trim().replace(/\/+$/, ''));
  }
  if (dailyLimit !== undefined) {
    const lim = parseInt(dailyLimit, 10);
    if (!isNaN(lim) && lim >= 1) {
      setSetting('STREAMTAPE_DAILY_LIMIT', String(lim));
    }
  }
  const { isStreamtapeConfigured } = require('../streamtapeUpload');
  res.json({ success: true, configured: isStreamtapeConfigured() });
});

// ─── GET /api/streamtape/test (Test Streamtape API connection & DNS) ───────
router.get('/streamtape/test', async (req, res) => {
  const { streamtapeApiGet, isStreamtapeConfigured } = require('../streamtapeUpload');
  if (!isStreamtapeConfigured()) {
    return res.status(400).json({ success: false, error: 'Streamtape login or key not configured in settings.' });
  }

  try {
    const result = await streamtapeApiGet('/account/info');
    res.json({ success: true, message: 'Streamtape API connected successfully via Cloudflare DNS!', result });
  } catch (err) {
    console.error('[Streamtape Test Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/video/:id/streamtape-upload (Manual trigger background upload) ─
router.post('/video/:id/streamtape-upload', async (req, res) => {
  const videoId = parseInt(req.params.id, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const video = getOne('SELECT id, title, streamtape_status FROM videos WHERE id = ?', [videoId]);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const { isStreamtapeConfigured, triggerStreamtapeUpload } = require('../streamtapeUpload');
  if (!isStreamtapeConfigured()) {
    return res.status(400).json({ error: 'Streamtape is not configured. Please enter your API Login and Password in Telegram Settings.' });
  }

  try {
    const { setDetectedBaseUrl } = require('../streamtapeUpload');
    if (typeof setDetectedBaseUrl === 'function') {
      setDetectedBaseUrl(req);
    }
    run("UPDATE videos SET streamtape_status = 'uploading', upload_percentage = 1 WHERE id = ?", [videoId]);
    const userId = (req.user && req.user.id) || 1;
    await triggerStreamtapeUpload('video', video.id, userId, null, video.title, null, true /* isManual = true */);
    res.json({ success: true, message: 'Upload queued successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/video/:id/streamtape-link (Direct manual link for admin/bandwidth bypass) ─
router.post('/video/:id/streamtape-link', (req, res) => {
  const videoId = parseInt(req.params.id, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const { streamtape_url } = req.body;
  if (!streamtape_url || typeof streamtape_url !== 'string') {
    return res.status(400).json({ error: 'streamtape_url is required' });
  }

  const video = getOne('SELECT id FROM videos WHERE id = ?', [videoId]);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  try {
    const { linkStreamtapeDirect } = require('../streamtapeUpload');
    const result = linkStreamtapeDirect('video', videoId, streamtape_url);
    res.json({ success: true, message: 'Streamtape link saved successfully', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/video/:id ────────────────────────────────────────────────────
router.get('/video/:id', (req, res) => {
  const videoId = parseInt(req.params.id, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const video = getOne(
    `SELECT
       v.*,
       c.username AS channel_username,
       c.title    AS channel_title,
       b.name     AS batch_name,
       COALESCE(p.watched_percentage, 0) AS watched_percentage,
       COALESCE(p.last_timestamp, 0)     AS last_timestamp,
       COALESCE(p.completed, 0)          AS completed,
       COALESCE(p.dismissed, 0)          AS dismissed
     FROM videos v
     JOIN channels c ON c.id = v.channel_id
     LEFT JOIN batches b ON b.id = v.batch_id
     LEFT JOIN progress p ON p.video_id = v.id AND p.user_id = ?
     WHERE v.id = ?`,
    [req.user.id, videoId]
  );

  if (!video) return res.status(404).json({ error: 'Video not found' });

  // Auto-trigger background upload and organize smart sequence queue (next video + lookback previous)
  const { isStreamtapeConfigured, triggerStreamtapeUpload, organizeExistingUploads } = require('../streamtapeUpload');
  if (isStreamtapeConfigured()) {
    try {
      triggerStreamtapeUpload('video', video.id, req.user.id, null, video.title, null);
      if (video.batch_id || video.channel_id) {
        organizeExistingUploads(video.batch_id, video.channel_id).catch(() => {});
      }
    } catch (err) {
      console.warn('[Streamtape Auto-Trigger Error]', err.message);
    }
  }

  const liveProgress = getUploadProgress('video', videoId);
  const uploadPct = (liveProgress && typeof liveProgress.pct === 'number')
    ? liveProgress.pct
    : (typeof liveProgress === 'number'
      ? liveProgress
      : (video.upload_percentage || (video.streamtape_status === 'ready' ? 100 : 0)));

  const { getDailyAutoUploadCount, getDailyAutoUploadLimit } = require('../streamtapeUpload');

  res.json({
    ...video,
    upload_percentage: uploadPct,
    upload_progress: liveProgress,
    daily_uploads: {
      count: typeof getDailyAutoUploadCount === 'function' ? getDailyAutoUploadCount() : 0,
      limit: typeof getDailyAutoUploadLimit === 'function' ? getDailyAutoUploadLimit() : 5,
    },
  });
});

// ─── GET /api/video/:id/files ─────────────────────────────────────────────
router.get('/video/:id/files', (req, res) => {
  const videoId = parseInt(req.params.id, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const files = getAll(
    `SELECT f.*, c.username AS channel_username
     FROM files f
     JOIN channels c ON c.id = f.channel_id
     WHERE f.parent_video_id = ?
     ORDER BY f.message_id ASC`,
    [videoId]
  );

  res.json(files);
});

// ─── DELETE /api/video/:id ──────────────────────────────────────────────────
router.delete('/video/:id', async (req, res) => {
  const videoId = parseInt(req.params.id, 10);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });

  const video = getOne('SELECT * FROM videos WHERE id = ?', [videoId]);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  try {
    // NOTE: Keep Streamtape cloud videos safe — do not delete cloud content on video delete
    const { run } = require('../db/database');
    run('DELETE FROM progress WHERE video_id = ?', [videoId]);
    run('DELETE FROM notes WHERE video_id = ?', [videoId]);
    run('DELETE FROM video_tags WHERE video_id = ?', [videoId]);
    run('UPDATE files SET parent_video_id = NULL WHERE parent_video_id = ?', [videoId]);
    run('DELETE FROM videos WHERE id = ?', [videoId]);

    res.json({ success: true, message: 'Video deleted' });
  } catch (err) {
    console.error('[Delete Video Error]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
