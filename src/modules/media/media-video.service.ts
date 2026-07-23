import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { uploadToStorage } from '../../storage/storage.service';
import { AuditContext, auditCreate } from '../../utils/audit';
import { MediaFileResponse } from './media.types';
import * as repo from './media.repository';
import { isValidUuid } from '../../utils/uuid';

const DEFAULT_MAX_SIZE_MB = 200;
const DEFAULT_ALLOWED_MIMES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];

function getVideoLimits() {
  const maxSizeMb = process.env.CONTENT_VIDEO_MAX_SIZE_MB
    ? parseInt(process.env.CONTENT_VIDEO_MAX_SIZE_MB, 10)
    : DEFAULT_MAX_SIZE_MB;

  const allowedMimes = process.env.CONTENT_VIDEO_ALLOWED_MIME_TYPES
    ? process.env.CONTENT_VIDEO_ALLOWED_MIME_TYPES.split(',').map((m) => m.trim())
    : DEFAULT_ALLOWED_MIMES;

  return { maxSizeBytes: maxSizeMb * 1024 * 1024, allowedMimes };
}

function format(f: NonNullable<Awaited<ReturnType<typeof repo.findMediaById>>>): MediaFileResponse {
  return {
    id: f.id,
    filename: f.filename,
    originalName: f.originalName,
    mimeType: f.mimeType,
    extension: f.originalName.split('.').pop()?.toLowerCase() || '',
    fileCategory: 'video',
    sizeBytes: f.sizeBytes.toString(),
    url: f.url,
    altText: f.altText,
    uploadedById: f.uploadedById,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    missing: false,
  };
}

export async function uploadVideoFile(
  file: Express.Multer.File,
  uploadedById: string | null | undefined,
  ctx: AuditContext,
): Promise<MediaFileResponse> {
  const limits = getVideoLimits();

  // Validate MIME type
  if (!limits.allowedMimes.includes(file.mimetype)) {
    throw AppError.badRequest(
      `Video MIME type "${file.mimetype}" is not allowed. Supported types: ${limits.allowedMimes.join(', ')}`
    );
  }

  // Validate file size
  if (file.size > limits.maxSizeBytes) {
    throw AppError.badRequest(
      `Video file size (${Math.round(file.size / 1024 / 1024)}MB) exceeds maximum allowed size (${Math.round(limits.maxSizeBytes / 1024 / 1024)}MB)`
    );
  }

  // Validate extension matches MIME type
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  const validExtensions: Record<string, string[]> = {
    'video/mp4': ['mp4'],
    'video/webm': ['webm'],
    'video/quicktime': ['mov'],
    'video/x-m4v': ['m4v'],
  };

  if (validExtensions[file.mimetype] && !validExtensions[file.mimetype].includes(ext)) {
    throw AppError.badRequest(
      `File extension ".${ext}" does not match MIME type "${file.mimetype}"`
    );
  }

  // Generate secure filename
  const baseNameWithoutExt = file.originalname.replace(/\.[^.]+$/, '');
  const sanitizedName = baseNameWithoutExt
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
    .slice(0, 50);
  const secureFilename = `${sanitizedName}-${Date.now()}.${ext}`;

  // Upload to storage
  let objectKey: string;
  let url: string;
  try {
    // Create a temporary file object for storage
    const tempFile: Express.Multer.File = {
      ...file,
      originalname: secureFilename,
    };
    const result = await uploadToStorage(tempFile);
    objectKey = result.objectKey;
    url = result.url;
  } catch (err) {
    throw AppError.internal(`Failed to upload video file: ${(err as Error).message}`);
  }

  // Save to database
  const data: Parameters<typeof repo.createMediaFile>[0] = {
    filename: objectKey,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    url,
  };

  // See the matching comment in media.service.ts uploadFile(): Central
  // Auth-issued ids aren't UUIDs and aren't rows in this table at all, so
  // only attempt the local FK link when the id is actually UUID-shaped.
  if (uploadedById && isValidUuid(uploadedById)) {
    const userExists = await prisma.user.findUnique({
      where: { id: uploadedById },
      select: { id: true },
    });
    if (!userExists) {
      throw AppError.unauthorized('Authenticated user not found in the database');
    }
    data.uploadedBy = { connect: { id: uploadedById } };
  }

  const created = await repo.createMediaFile(data);
  await auditCreate('media_file', created.id, { filename: created.filename, url, mimeType: created.mimeType }, ctx);

  return format(created);
}

/**
 * Get video upload limits (for client to show in UI)
 */
export function getVideoUploadLimits() {
  const limits = getVideoLimits();
  return {
    maxSizeMB: Math.round(limits.maxSizeBytes / 1024 / 1024),
    allowedMimeTypes: limits.allowedMimes,
    allowedExtensions: ['mp4', 'webm', 'mov', 'm4v'],
  };
}
