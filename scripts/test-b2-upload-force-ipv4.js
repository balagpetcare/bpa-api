require('dotenv').config();

const dns = require('dns');
const https = require('https');
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

const agent = new https.Agent({
  keepAlive: false,
  lookup: (hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    dns.resolve4(hostname, (err, addresses) => {
      if (err) return callback(err);

      if (!addresses || addresses.length === 0) {
        return callback(new Error(`No IPv4 address found for ${hostname}`));
      }

      const ip = addresses[0];
      console.log(`Resolved ${hostname} -> ${ip}`);

      // Node may request all addresses
      if (options && options.all) {
        return callback(null, [{ address: ip, family: 4 }]);
      }

      return callback(null, ip, 4);
    });
  },
});

const client = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE).toLowerCase() === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  requestHandler: new NodeHttpHandler({
    httpsAgent: agent,
    connectionTimeout: 30000,
    socketTimeout: 30000,
  }),
  maxAttempts: 1,
});

async function main() {
  const Bucket = process.env.S3_BUCKET;
  const Key = `test/forced-ipv4-b2-test-${Date.now()}.txt`;

  console.log('Testing B2 upload with forced IPv4...');
  console.log({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: Bucket,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
  });

  await client.send(new PutObjectCommand({
    Bucket,
    Key,
    Body: `BPA Backblaze forced IPv4 test ${new Date().toISOString()}`,
    ContentType: 'text/plain',
  }));

  console.log('Upload OK:', Key);

  const list = await client.send(new ListObjectsV2Command({
    Bucket,
    Prefix: 'test/',
    MaxKeys: 10,
  }));

  console.log('List OK:');
  for (const obj of list.Contents || []) {
    console.log('-', obj.Key, obj.Size);
  }
}

main().catch((err) => {
  console.error('B2 TEST FAILED');
  console.error('Name:', err.name);
  console.error('Message:', err.message);
  console.error(err);
  process.exit(1);
});
