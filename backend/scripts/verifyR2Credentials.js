// backend/scripts/verifyR2Credentials.js
require('dotenv').config();
const { S3Client, ListBucketsCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { r2Config, validateR2Config } = require('../config/r2Config');

async function verifyR2Credentials() {
  console.log('🔍 Verifying Cloudflare R2 credentials...\n');

  try {
    // 1. Validate R2 configuration from environment variables
    console.log('1. Validating environment variables...');
    validateR2Config();
    console.log('✅ All required environment variables are present');
    console.log(`   Account ID: ${r2Config.accountId}`);
    console.log(`   Bucket Name: ${r2Config.bucketName}`);
    console.log(`   Public URL: ${r2Config.publicUrl}`);
    console.log(`   Endpoint: ${r2Config.endpoint}\n`);

    // 2. Initialize S3 client for Cloudflare R2
    console.log('2. Initializing R2 client...');
    const r2Client = new S3Client({
      region: r2Config.region,
      endpoint: r2Config.endpoint,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });
    console.log('✅ R2 client initialized successfully\n');

    // 3. Test connection by listing buckets
    console.log('3. Testing connection by listing buckets...');
    const listCommand = new ListBucketsCommand({});
    const listResponse = await r2Client.send(listCommand);
    
    console.log('✅ Connection successful!');
    console.log(`   Found ${listResponse.Buckets.length} bucket(s):`);
    listResponse.Buckets.forEach(bucket => {
      console.log(`   - ${bucket.Name} (created: ${bucket.CreationDate})`);
    });
    console.log('');

    // 4. Test specific bucket access
    console.log('4. Testing access to specified bucket...');
    const headCommand = new HeadBucketCommand({
      Bucket: r2Config.bucketName
    });
    
    try {
      await r2Client.send(headCommand);
      console.log(`✅ Successfully accessed bucket: ${r2Config.bucketName}`);
    } catch (bucketError) {
      if (bucketError.name === 'NotFound') {
        console.log(`⚠️  Bucket '${r2Config.bucketName}' does not exist`);
        console.log('   You may need to create this bucket in your Cloudflare dashboard');
      } else if (bucketError.name === 'AccessDenied') {
        console.log(`❌ Access denied to bucket: ${r2Config.bucketName}`);
        console.log('   Please check your bucket permissions');
      } else {
        console.log(`❌ Error accessing bucket: ${bucketError.message}`);
      }
    }

    // 5. Test public URL accessibility
    console.log('\n5. Testing public URL configuration...');
    if (r2Config.publicUrl && r2Config.publicUrl.startsWith('https://')) {
      console.log(`✅ Public URL format looks correct: ${r2Config.publicUrl}`);
      console.log('   Note: You may need to configure custom domain in Cloudflare dashboard');
    } else {
      console.log('⚠️  Public URL format may be incorrect');
    }

    console.log('\n🎉 R2 credentials verification completed!');
    console.log('✅ Your credentials are valid and working correctly');
    
    if (listResponse.Buckets.length === 0) {
      console.log('\n📝 Next steps:');
      console.log('   1. Create a bucket in your Cloudflare R2 dashboard');
      console.log('   2. Configure public access if needed');
      console.log('   3. Update CLOUDFLARE_R2_BUCKET_NAME in your .env file');
    }

  } catch (error) {
    console.error('\n❌ R2 credentials verification FAILED!');
    console.error('Error details:', error.message);
    
    if (error.message.includes('Missing required R2 environment variables')) {
      console.error('\n🔧 Fix: Ensure all required environment variables are set in your .env file:');
      console.error('   - CLOUDFLARE_ACCOUNT_ID');
      console.error('   - CLOUDFLARE_R2_ACCESS_KEY_ID');
      console.error('   - CLOUDFLARE_R2_SECRET_ACCESS_KEY');
      console.error('   - CLOUDFLARE_R2_BUCKET_NAME');
      console.error('   - CLOUDFLARE_R2_PUBLIC_URL');
    } else if (error.name === 'InvalidAccessKeyId' || error.name === 'SignatureDoesNotMatch') {
      console.error('\n🔧 Fix: Check your access key credentials:');
      console.error('   - Verify CLOUDFLARE_R2_ACCESS_KEY_ID is correct');
      console.error('   - Verify CLOUDFLARE_R2_SECRET_ACCESS_KEY is correct');
      console.error('   - Ensure credentials are from R2 API tokens, not Cloudflare API tokens');
    } else if (error.name === 'AccessDenied') {
      console.error('\n🔧 Fix: Check your permissions:');
      console.error('   - Ensure your R2 API token has proper permissions');
      console.error('   - Verify the account ID is correct');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('\n🔧 Fix: Check your network connection and endpoint:');
      console.error('   - Verify your internet connection');
      console.error('   - Check if the endpoint URL is correct');
    }
    
    process.exit(1);
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyR2Credentials();
}

module.exports = { verifyR2Credentials };
