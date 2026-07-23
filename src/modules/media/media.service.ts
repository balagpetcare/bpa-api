import sharp from 'sharp';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { config } from '../../config';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import { AuditContext, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import { PaginationMeta } from '../../types';
import { uploadToStorage, downloadFromStorage, uploadBufferToStorage, verifyFileExists } from '../../storage/storage.service';
import { correctMimeType, getExtension, getFileCategory } from '../../utils/fileType';
import { isValidUuid } from '../../utils/uuid';
import * as repo from './media.repository';
import { UpdateMediaDto, MediaListQuery, MediaFileResponse, CropMediaDto } from './media.types';
import {
  deleteMediaLibraryEntry,
  performDeferredStorageCleanup,
} from './media-delete.service';

type RawFile = Awaited<ReturnType<typeof repo.findMediaById>>;

// Dev-host variants that all resolve to *this same* locally-managed storage
// backend (mirrors bpa_admin's resolveMediaUrl KNOWN_DEV_MEDIA_HOSTS list —
// the two must stay in sync). Records whose url's host is one of these (or
// this server's own configured BACKEND_URL/MEDIA_PUBLIC_BASE_URL host) are
// genuinely "our" uploads, and the local-disk existence check applies.
const LOCAL_STORAGE_HOST_PATTERN = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

export function isLocallyManagedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (LOCAL_STORAGE_HOST_PATTERN.test(url.host)) return true;
    for (const configured of [config.BACKEND_URL, config.MEDIA_PUBLIC_BASE_URL]) {
      if (configured && url.host === new URL(configured).host) return true;
    }
    return false;
  } catch {
    // Not a parseable absolute URL at all — treat as a relative /uploads
    // path, which is always locally managed.
    return true;
  }
}

function format(f: NonNullable<RawFile>): MediaFileResponse {
  // Some records (seed/demo data, or content deliberately pointing at a
  // real external image host) were never uploaded to our own storage
  // backend at all — their `url` is a genuine, independently-hosted
  // absolute URL (e.g. placehold.co, images.unsplash.com). Running the
  // local-disk existence check against `filename` for those always fails
  // (there is no local file to find, by design) and incorrectly flagged
  // them "File Missing" even though the URL itself is live and correct.
  // Only apply the local-storage missing check to records that actually
  // belong to this server's own managed storage.
  const isMissing = isLocallyManagedUrl(f.url) ? !verifyFileExists(f.filename) : false;
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

  // `uploadedById` comes straight off the authenticated principal's JWT
  // `sub` claim. For bpa_api's own local-login users that's always a real
  // row id (a UUID, matching the `users.id @db.Uuid` column) — but Central
  // Auth-issued tokens (Global Super Admin SSO) carry Central Auth's own
  // user id format (a cuid, not a UUID, and not a row in this table at
  // all). Passing a non-UUID straight into a `@db.Uuid` lookup used to
  // surface as Prisma error P2023 ("Invalid data format in request"),
  // blocking every Central Auth-authenticated upload. Only attempt the
  // local-user FK link when the id is actually shaped like one of this
  // table's own ids; Central Auth uploads are still recorded, just without
  // a local `uploadedBy` relation (there is no local row to link to).
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

  // `uploadedById` comes straight off the authenticated principal's JWT
  // `sub` claim. For bpa_api's own local-login users that's always a real
  // row id (a UUID, matching the `users.id @db.Uuid` column) — but Central
  // Auth-issued tokens (Global Super Admin SSO) carry Central Auth's own
  // user id format (a cuid, not a UUID, and not a row in this table at
  // all). Passing a non-UUID straight into a `@db.Uuid` lookup used to
  // surface as Prisma error P2023 ("Invalid data format in request"),
  // blocking every Central Auth-authenticated upload. Only attempt the
  // local-user FK link when the id is actually shaped like one of this
  // table's own ids; Central Auth uploads are still recorded, just without
  // a local `uploadedBy` relation (there is no local row to link to).
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
