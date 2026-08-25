// backend/utils/productImportExport/importLock.js
// Per-uploader in-process lock (single Node instance). Prevents concurrent bulk imports for same uploader.

const activeLocks = new Map();

/**
 * @param {string} lockKey - e.g. `seller:${id}` or `admin:${id}`
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withImportLock(lockKey, fn) {
  if (activeLocks.get(lockKey)) {
    const err = new Error('Another import is already in progress for this account. Please wait and retry.');
    err.code = 'IMPORT_IN_PROGRESS';
    throw err;
  }
  activeLocks.set(lockKey, Date.now());
  try {
    return await fn();
  } finally {
    activeLocks.delete(lockKey);
  }
}

module.exports = { withImportLock };
