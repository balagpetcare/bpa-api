require('dotenv').config();

const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const required = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing env: ${key}`);
    process.exit(1);
  }
}

const client = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE).toLowerCase() === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

async function main() {
  const Bucket = process.env.S3_BUCKET;
  const Key = `test/node-b2-test-${Date.now()}.txt`;

  console.log('Testing B2 upload...');
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
    Body: `BPA Backblaze Node test ${new Date().toISOString()}`,
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
