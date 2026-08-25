// backend/config/r2Config.js
require('dotenv').config();

const r2Config = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
  publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL,
  region: 'auto', // Cloudflare R2 uses 'auto' region
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
};

// Validation function to check if all required environment variables are set
const validateR2Config = () => {
  const requiredVars = [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_R2_ACCESS_KEY_ID', 
    'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_R2_BUCKET_NAME',
    'CLOUDFLARE_R2_PUBLIC_URL'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required R2 environment variables: ${missingVars.join(', ')}`);
  }

  return true;
};

module.exports = {
  r2Config,
  validateR2Config
};
