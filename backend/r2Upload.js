const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { Readable } = require('stream');
const bigInt = require('big-integer');
const { run } = require('./db/database');
const { getClient } = require('./telegramClient');

// We use a singleton map to track ongoing uploads so we don't upload the same file twice
const activeUploads = new Map();

function getS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Checks if R2 is configured
 */
function isR2Configured() {
  return !!getS3Client() && !!process.env.R2_BUCKET_NAME && !!process.env.R2_PUBLIC_URL;
}

/**
 * Trigger background upload to R2
 */
async function triggerR2Cache(type, entityId, reqUserId, fileLocation) {
  if (!isR2Configured()) return;
  
  const uploadKey = `${type}_${entityId}`;
  if (activeUploads.has(uploadKey)) return; // Already uploading
  
  activeUploads.set(uploadKey, true);
  
  const table = type === 'video' ? 'videos' : 'files';
  const ext = type === 'video' ? 'mp4' : 'bin';
  
  // Set status to uploading
  run(`UPDATE ${table} SET r2_status = 'uploading' WHERE id = ?`, [entityId]);
  
  try {
    const s3 = getS3Client();
    const bucket = process.env.R2_BUCKET_NAME;
    const key = `televideo/${type}_${entityId}.${ext}`;
    
    const client = await getClient(reqUserId);
    const dcId = fileLocation.dcId || 0;
    
    // Create an async generator that yields chunks from Telegram
    async function* generateTelegramChunks() {
      for await (const rawChunk of client.iterDownload({
        file: fileLocation.location,
        offset: bigInt(0),
        requestSize: 1024 * 1024, // 1MB chunks
        ...(dcId ? { dcId } : {}),
      })) {
        yield Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      }
    }
    
    const stream = Readable.from(generateTelegramChunks());
    
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: key,
        Body: stream,
        ContentType: fileLocation.mimeType,
      },
      queueSize: 4, // Concurrent parts
      partSize: 5 * 1024 * 1024, // 5MB parts
    });
    
    // Wait for upload to complete
    await upload.done();
    
    // Mark as cached in DB
    run(`UPDATE ${table} SET r2_status = 'cached', r2_key = ? WHERE id = ?`, [key, entityId]);
    console.log(`[R2 Cache] Successfully cached ${type} ${entityId} to R2 as ${key}`);
    
  } catch (err) {
    console.error(`[R2 Cache Error] Failed to cache ${type} ${entityId}:`, err);
    // Revert status so it can be retried later
    run(`UPDATE ${table} SET r2_status = 'none' WHERE id = ?`, [entityId]);
  } finally {
    activeUploads.delete(uploadKey);
  }
}

module.exports = {
  isR2Configured,
  triggerR2Cache,
};
