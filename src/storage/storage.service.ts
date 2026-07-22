/**
 * Centralized storage abstraction.
 *
 * STORAGE_DRIVER=s3   → uploads to any S3-compatible provider (MinIO, AWS S3,
 *                         DigitalOcean Spaces, Wasabi, Cloudflare R2) via env vars.
 * STORAGE_DRIVER=local → writes to ./uploads/ directory (dev fallback).
 *
 * To switch from local MinIO to production AWS S3:
 *   change only S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in .env
 *   and set S3_FORCE_PATH_STYLE=false — no code changes required.
 */

import { S3Client, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import dns from 'node:dns';
import https from 'node:https';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { AppError } from '../utils/AppError';

// Force IPv4 for S3-compatible endpoints — prevents connection timeouts when
// the DNS resolves to an IPv6 address the local network can't route (e.g. Backblaze B2).
function makeIpv4HttpsAgent(): https.Agent {
  const origLookup = dns.lookup.bind(dns);
  return new https.Agent({
    lookup(hostname, options, callback) {
      origLookup(hostname, { ...options, family: 4 }, callback);
    },
  });
}

// ─── Object key strategy ─────────────────────────────────────────

export function buildObjectKey(originalname: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ext = path.extname(originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '';
  return `media/${year}/${month}/${uuidv4()}${ext}`;
}

export function getPublicUrl(objectKey: string): string {
  const key = objectKey.replace(/^\//, '');
  if (config.STORAGE_DRIVER === 's3') {
    const base = (config.S3_PUBLIC_BASE_URL ?? config.MEDIA_PUBLIC_BASE_URL ?? config.BACKEND_URL).replace(/\/$/, '');
    return `${base}/${key}`;
  }
  // local: serve through the API's /uploads static mount.
  // MEDIA_PUBLIC_BASE_URL lets production override the host without changing BACKEND_URL.
  // e.g. MEDIA_PUBLIC_BASE_URL=https://api.example.com, BACKEND_URL=http://localhost:4000
  const localBase = (config.MEDIA_PUBLIC_BASE_URL ?? config.BACKEND_URL).replace(/\/$/, '');
  return `${localBase}/uploads/${path.basename(key)}`;
}

export interface UploadResult {
  objectKey: string;
  url: string;
}

// ─── S3 driver ──────────────────────────────────────────────────

class S3Driver {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.validateConfig();

    this.bucket = config.S3_BUCKET!;
    this.client = new S3Client({
      region: config.S3_REGION ?? 'us-east-1',
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
      forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE).toLowerCase() === 'true',
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID!,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
      },
      requestHandler: new NodeHttpHandler({
        httpsAgent: makeIpv4HttpsAgent(),
        connectionTimeout: 30000,
        socketTimeout: 30000,
      }),
      maxAttempts: 2,
    });
  }

  private validateConfig() {
    const missing = [];
    if (!config.S3_BUCKET) missing.push('S3_BUCKET');
    if (!config.S3_ACCESS_KEY_ID) missing.push('S3_ACCESS_KEY_ID');
    if (!config.S3_SECRET_ACCESS_KEY) missing.push('S3_SECRET_ACCESS_KEY');
    
    if (missing.length > 0) {
      throw new Error(`Missing S3 configuration keys: ${missing.join(', ')}. Check your .env file.`);
    }
  }

  /**
   * Performs a lightweight check to see if the bucket is accessible.
   */
  async healthCheck() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err: any) {
      if (err.name === 'InvalidAccessKeyId' || err.$metadata?.httpStatusCode === 403) {
        throw AppError.internal('Invalid S3/MinIO credentials. Please check S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.');
      }
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        throw AppError.internal(`S3 Bucket "${this.bucket}" not found. Please create it first.`);
      }
      throw AppError.internal(`Storage health check failed: ${err.message}`);
    }
  }

  async upload(buffer: Buffer, objectKey: string, mimeType: string): Promise<void> {
    try {
      const up = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: mimeType,
        },
      });
      await up.done();
    } catch (err: any) {
      console.error('[storage] S3 upload error:', err);
      if (err.name === 'InvalidAccessKeyId' || err.$metadata?.httpStatusCode === 403) {
        throw AppError.internal('Access denied to storage service. Check credentials.');
      }
      throw AppError.internal(`Failed to upload file to storage: ${err.message}`);
    }
  }

  async download(objectKey: string): Promise<Buffer> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      if (!res.Body) throw new Error(`Empty body for ${objectKey}`);
      // @ts-ignore
      const chunks = [];
      // @ts-ignore
      for await (const chunk of res.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err: any) {
      throw AppError.internal(`Failed to download from storage: ${err.message}`);
    }
  }

  async delete(objectKey: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    } catch (err: any) {
      console.warn(`[storage] Failed to delete "${objectKey}":`, err.message);
    }
  }
}

// ─── Local driver ────────────────────────────────────────────────

class LocalDriver {
  private readonly uploadsDir: string;

  constructor() {
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadsDir)) {
      console.log(`[storage] Creating local uploads directory at ${this.uploadsDir}`);
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async healthCheck() {
    if (!fs.existsSync(this.uploadsDir)) {
      throw AppError.internal(`Uploads directory not found at ${this.uploadsDir}`);
    }
  }

  async upload(buffer: Buffer, objectKey: string, _mimeType: string): Promise<void> {
    const dest = path.join(this.uploadsDir, path.basename(objectKey));
    const temp = `${dest}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      // Flatten to /uploads/<basename> for local dev simplicity. The write
      // goes to a temp file in the same directory first, then renames into
      // place so `/uploads/...` never serves a partially written file.
      await fs.promises.writeFile(temp, buffer);
      await fs.promises.rename(temp, dest);
    } catch (err: any) {
      try {
        await fs.promises.unlink(temp);
      } catch {
        // Best-effort cleanup only.
      }
      throw AppError.internal(`Failed to write file to disk: ${err.message}`);
    }
  }

  async download(objectKey: string): Promise<Buffer> {
    const filePath = path.join(this.uploadsDir, path.basename(objectKey));
    if (!fs.existsSync(filePath)) throw AppError.notFound('File not found on disk');
    return fs.readFileSync(filePath);
  }

  async delete(objectKey: string): Promise<void> {
    const filePath = path.join(this.uploadsDir, path.basename(objectKey));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  
  fileExists(objectKey: string): boolean {
    const filePath = path.join(this.uploadsDir, path.basename(objectKey));
    return fs.existsSync(filePath);
  }
}

// ─── Singleton ───────────────────────────────────────────────────

let _driver: S3Driver | LocalDriver | null = null;

function getDriver(): S3Driver | LocalDriver {
  if (!_driver) {
    _driver = config.STORAGE_DRIVER === 's3' ? new S3Driver() : new LocalDriver();
  }
  return _driver;
}

// ─── Public API ──────────────────────────────────────────────────

export async function checkStorageHealth() {
  await getDriver().healthCheck();
}

/**
 * Checks if a file exists (only for local driver, returns true for S3 to avoid latency).
 */
export function verifyFileExists(objectKey: string): boolean {
  const d = getDriver();
  if (d instanceof LocalDriver) {
    return d.fileExists(objectKey);
  }
  return true; // S3 assumed true to avoid HEAD request latency in lists
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Upload a multer in-memory file to the configured storage backend.
 * Returns the objectKey (stored in MediaFile.filename) and the public URL.
 */
export async function uploadToStorage(file: Express.Multer.File): Promise<UploadResult> {
  if (!file.buffer) throw new Error('uploadToStorage requires multer memoryStorage — file.buffer is empty');
  const objectKey = buildObjectKey(file.originalname);
  await getDriver().upload(file.buffer, objectKey, file.mimetype);
  return { objectKey, url: getPublicUrl(objectKey) };
}

/**
 * Upload a raw Buffer to storage.
 */
export async function uploadBufferToStorage(buffer: Buffer, originalname: string, mimeType: string): Promise<UploadResult> {
  const objectKey = buildObjectKey(originalname);
  await getDriver().upload(buffer, objectKey, mimeType);
  return { objectKey, url: getPublicUrl(objectKey) };
}

/**
 * Download an object from storage as a Buffer.
 */
export async function downloadFromStorage(objectKey: string): Promise<Buffer> {
  return getDriver().download(objectKey);
}

/**
 * Delete a stored object by its objectKey (the value saved in MediaFile.filename).
 * Non-fatal: logs a warning on failure but does not throw.
 */
export async function deleteFromStorage(objectKey: string): Promise<void> {
  if (!objectKey) return;
  try {
    await getDriver().delete(objectKey);
  } catch (err) {
    console.warn(`[storage] Failed to delete "${objectKey}":`, (err as Error).message);
  }
}

export async function deleteFromStorageStrict(objectKey: string): Promise<void> {
  if (!objectKey) return;
  await getDriver().delete(objectKey);
}
