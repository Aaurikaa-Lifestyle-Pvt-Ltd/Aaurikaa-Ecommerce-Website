// backend/services/r2UploadService.js
const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2Config, validateR2Config } = require('../config/r2Config');
const { toR2DeleteKey } = require('../utils/mediaUrlUtils');
const crypto = require('crypto');
const path = require('path');

// Initialize S3 client for Cloudflare R2
const r2Client = new S3Client({
  region: r2Config.region,
  endpoint: r2Config.endpoint,
  credentials: {
    accessKeyId: r2Config.accessKeyId,
    secretAccessKey: r2Config.secretAccessKey,
  },
});

/**
 * @deprecated Use mediaNamingService.generateMediaKey when MEDIA_NAMING_V2=true
 * Generate secure filename for R2 storage (legacy random keys)
 */
const generateSecureFilename = (originalname, folder = '') => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(16).toString('hex');
  
  // Handle undefined or null originalname
  if (!originalname) {
    const filename = `${timestamp}_${randomString}_file`;
    return folder ? `${folder}/${filename}` : filename;
  }
  
  // Get file extension
  const ext = path.extname(originalname);
  
  // Remove extension from originalname if it exists
  const nameWithoutExt = originalname.replace(/\.[^/.]+$/, '');
  const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  const filename = `${timestamp}_${randomString}_${sanitizedName}${ext}`;
  return folder ? `${folder}/${filename}` : filename;
};

/**
 * Generate presigned URL for file upload
 * @param {string} key - File key/path in R2 bucket
 * @param {string} contentType - MIME type of the file
 * @param {number} expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>} - Presigned URL
 */
const generatePresignedUploadUrl = async (key, contentType, expiresIn = 3600) => {
  try {
    validateR2Config();

    const command = new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn });
    
    return {
      success: true,
      presignedUrl,
      key,
      publicUrl: `${r2Config.publicUrl}/${key}`
    };
  } catch (error) {
    console.error('❌ Error generating presigned upload URL:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Upload file directly to R2 (for server-side uploads)
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} key - File key/path in R2 bucket
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<Object>} - Upload result
 */
const uploadFileToR2 = async (fileBuffer, key, contentType, options = {}) => {
  try {
    validateR2Config();

    const putParams = {
      Bucket: r2Config.bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    };

    if (options.ifNoneMatch) {
      putParams.IfNoneMatch = '*';
    }

    const command = new PutObjectCommand(putParams);

    await r2Client.send(command);

    return {
      success: true,
      key,
      publicUrl: `${r2Config.publicUrl}/${key}`,
    };
  } catch (error) {
    const isPreconditionFailed =
      error.name === 'PreconditionFailed' ||
      error.$metadata?.httpStatusCode === 412 ||
      error.Code === 'PreconditionFailed';

    if (isPreconditionFailed) {
      return {
        success: false,
        preconditionFailed: true,
        error: error.message,
      };
    }

    console.error('❌ Error uploading file to R2:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Delete file from R2
 * @param {string} key - File key/path in R2 bucket
 * @returns {Promise<Object>} - Delete result
 */
/**
 * Delete R2 object from stored URL, key, or legacy path.
 * @param {string} stored - Full URL, R2 key, or legacy relative path
 */
const deleteMediaObject = async (stored) => {
  const key = toR2DeleteKey(stored);
  if (!key) {
    return { success: true, skipped: true };
  }
  return deleteFileFromR2(key);
};

const deleteFileFromR2 = async (key) => {
  try {
    validateR2Config();

    const command = new DeleteObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
    });

    await r2Client.send(command);
    
    return {
      success: true,
      key
    };
  } catch (error) {
    console.error('❌ Error deleting file from R2:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if file exists in R2
 * @param {string} key - File key/path in R2 bucket
 * @returns {Promise<Object>} - File existence result
 */
const checkFileExistsInR2 = async (key) => {
  try {
    validateR2Config();

    const command = new HeadObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
    });

    await r2Client.send(command);
    
    return {
      success: true,
      exists: true,
      key
    };
  } catch (error) {
    if (error.name === 'NotFound') {
      return {
        success: true,
        exists: false,
        key
      };
    }
    
    console.error('❌ Error checking file existence in R2:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get public URL for a file in R2
 * @param {string} key - File key/path in R2 bucket
 * @returns {string} - Public URL
 */
const getPublicUrl = (key) => {
  if (!key) return null;
  
  // If key already contains the full URL, return as is
  if (key.startsWith('http')) {
    return key;
  }
  
  // If key starts with /, remove it
  const cleanKey = key.startsWith('/') ? key.substring(1) : key;
  
  return `${r2Config.publicUrl}/${cleanKey}`;
};

/**
 * Extract key from R2 URL
 * @param {string} url - Full R2 URL
 * @returns {string} - File key
 */
const extractKeyFromUrl = (url) => {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1); // Remove leading slash
  } catch (error) {
    console.error('❌ Error extracting key from URL:', error);
    return null;
  }
};

/**
 * Stream a private object from R2 (admin-only downloads).
 * @param {string} key - File key/path in R2 bucket
 * @returns {Promise<{ success: boolean, stream?: import('stream').Readable, contentType?: string, contentLength?: number, error?: string }>}
 */
const getFileStreamFromR2 = async (key) => {
  try {
    validateR2Config();

    const command = new GetObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
    });

    const response = await r2Client.send(command);

    return {
      success: true,
      stream: response.Body,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      return { success: false, notFound: true, error: 'File not found' };
    }

    console.error('❌ Error streaming file from R2:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  r2Client,
  generateSecureFilename,
  generatePresignedUploadUrl,
  uploadFileToR2,
  deleteFileFromR2,
  deleteMediaObject,
  checkFileExistsInR2,
  getPublicUrl,
  extractKeyFromUrl,
  getFileStreamFromR2,
};
