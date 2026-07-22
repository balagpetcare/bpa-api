import sharp from 'sharp';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import { AuditContext, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import { PaginationMeta } from '../../types';
import { uploadToStorage, downloadFromStorage, uploadBufferToStorage, verifyFileExists } from '../../storage/storage.service';
import { correctMimeType, getExtension, getFileCategory } from '../../utils/fileType';
import * as repo from './media.repository';
import { UpdateMediaDto, MediaListQuery, MediaFileResponse, CropMediaDto } from './media.types';
import {
  deleteMediaLibraryEntry,
  performDeferredStorageCleanup,
} from './media-delete.service';

type RawFile = Awaited<ReturnType<typeof repo.findMediaById>>;

function format(f: NonNullable<RawFile>): MediaFileResponse {
  const isMissing = !verifyFileExists(f.filename);
  const nameForType = f.originalName || f.filename;
  const mimeType = correctMimeType(f.mimeType, nameForType);

  return {
    id: f.id,
    filename: f.filename,
    originalName: f.originalName,
    mimeType,
    extension: getExtension(nameForType),
    fileCategory: getFileCategory(mimeType, nameForType),
    sizeBytes: f.sizeBytes.toString(),
    url: isMissing ? 'https://placehold.co/400x400?text=File+Missing' : f.url,
    altText: f.altText,
    uploadedById: f.uploadedById,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    missing: isMissing,
  };
}

export async function cropMedia(
  id: string,
  dto: CropMediaDto,
  uploadedById: string | null | undefined,
  ctx: AuditContext,
): Promise<MediaFileResponse> {
  const existing = await repo.findMediaById(id);
  if (!existing) throw AppError.notFound('MediaFile');

  const buffer = await downloadFromStorage(existing.filename);

  const croppedBuffer = await sharp(buffer)
    .extract({
      left: Math.round(dto.x),
      top: Math.round(dto.y),
      width: Math.round(dto.width),
      height: Math.round(dto.height),
    })
    .resize(dto.targetWidth, dto.targetHeight)
    .toBuffer();

  const originalName = existing.originalName;
  const ext = originalName.split('.').pop();
  const newName = `${originalName.replace(`.${ext}`, '')}_cropped.${ext}`;

  const { objectKey, url } = await uploadBufferToStorage(croppedBuffer, newName, existing.mimeType);

  const data: Parameters<typeof repo.createMediaFile>[0] = {
    filename: objectKey,
    originalName: newName,
    mimeType: existing.mimeType,
    sizeBytes: croppedBuffer.length,
    url,
  };

  if (uploadedById) {
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

  await auditCreate('media_file', created.id, { filename: created.filename, url, sourceId: id }, ctx);
  return format(created);
}

export async function listMedia(
  query: MediaListQuery,
): Promise<{ data: MediaFileResponse[]; meta: PaginationMeta }> {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const filter = { search: query.search, mimeType: query.mimeType };
  const [rows, total] = await Promise.all([
    repo.findManyMedia(filter, skip, limit),
    repo.countMedia(filter),
  ]);
  return { data: rows.map(format), meta: buildPaginationMeta(total, page, limit) };
}

export async function getMediaById(id: string): Promise<MediaFileResponse> {
  const f = await repo.findMediaById(id);
  if (!f) throw AppError.notFound('MediaFile');
  return format(f);
}

export async function uploadFile(
  file: Express.Multer.File,
  uploadedById: string | null | undefined,
  ctx: AuditContext,
): Promise<MediaFileResponse> {
  let buffer: Buffer;
  if (file.buffer) {
    buffer = file.buffer;
  } else if (file.path) {
    buffer = require('fs').readFileSync(file.path);
  } else {
    throw AppError.badRequest('Invalid file upload payload');
  }

  // Check if this is a video file
  if (isVideoMime(file.mimetype, file.originalname)) {
    // Delegate to video upload handler
    const videoService = await import('./media-video.service');
    return videoService.uploadVideoFile(file, uploadedById, ctx);
  }

  // Image upload - validate with Sharp
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.format || !['jpeg', 'png', 'webp', 'avif', 'heif'].includes(meta.format)) {
      throw AppError.badRequest('Unsupported or invalid image format');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.badRequest('Invalid image data. File may be corrupted or not a valid image.');
  }

  const { objectKey, url } = await uploadToStorage(file);
  const data: Parameters<typeof repo.createMediaFile>[0] = {
    filename: objectKey,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    url,
  };

  if (uploadedById) {
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

  await auditCreate('media_file', created.id, { filename: created.filename, url }, ctx);
  return format(created);
}

function isVideoMime(mime: string, originalName: string): boolean {
  return getFileCategory(mime, originalName) === 'video';
}

export async function updateMedia(
  id: string,
  dto: UpdateMediaDto,
  ctx: AuditContext,
): Promise<MediaFileResponse> {
  const existing = await repo.findMediaById(id);
  if (!existing) throw AppError.notFound('MediaFile');
  const updated = await repo.updateMediaFile(id, { altText: dto.altText });
  await auditUpdate('media_file', id, { altText: existing.altText }, { altText: updated.altText }, ctx);
  return format(updated);
}

export async function deleteMedia(id: string, ctx: AuditContext): Promise<void> {
  const existing = await repo.findMediaById(id);
  if (!existing) throw AppError.notFound('MediaFile');
  const result = await prisma.$transaction((tx) => deleteMediaLibraryEntry(tx, id));
  await auditDelete('media_file', id, { filename: existing.filename }, ctx);
  await performDeferredStorageCleanup(result.storageCleanup, ctx);
}
